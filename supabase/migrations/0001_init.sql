-- ============================================================
-- 0001_init.sql — profiles, assets, RLS, signup trigger,
--                 storage bucket + storage policies
-- ============================================================

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  plan_renews_at timestamptz,
  generations_used int not null default 0 check (generations_used >= 0),
  style_json jsonb not null default '{
    "version": 1,
    "art_direction": "stylized hand-painted fantasy game icon",
    "composition": "single object centered, clean silhouette, 3/4 view",
    "lighting": "soft painterly shading with warm highlights",
    "palette": "vibrant saturated fantasy colors",
    "detail": "high",
    "background": "transparent",
    "prompt_hints": [
      "polished mobile-game quality art",
      "no text, no watermark, no border",
      "consistent scale and framing across assets"
    ]
  }'::jsonb,
  paypal_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- assets ----------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  prompt text not null,
  style_json jsonb not null,
  model text not null,
  storage_path text not null,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index idx_assets_user_created on public.assets (user_id, created_at desc);

-- ---------- updated_at maintenance ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- create a profile for every new auth user ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.assets enable row level security;

-- profiles: select + update own row. No insert policy (the trigger owns
-- creation), no delete policy (cascades from auth.users).
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- assets: select + insert + delete own rows. No update policy in Phase 1.
create policy "assets_select_own"
  on public.assets for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "assets_insert_own"
  on public.assets for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "assets_delete_own"
  on public.assets for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Tight grants: only what the policies allow.
revoke all on public.profiles from anon, authenticated;
revoke all on public.assets from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.assets to authenticated;

-- ---------- storage: private "assets" bucket ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('assets', 'assets', false, 10485760) -- 10 MB
on conflict (id) do nothing;

-- All storage policies key on the first path segment being the user's id:
-- storage_path = {user_id}/{asset_id}.png
create policy "assets_bucket_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "assets_bucket_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "assets_bucket_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
