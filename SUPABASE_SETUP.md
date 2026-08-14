# Supabase Setup Guide

Everything you need to click and run to get Asset Forge working against a hosted Supabase
project. Total time: ~5 minutes. (For local development with the Supabase CLI, see the note at
the end — the SQL below is identical to `supabase/migrations/`.)

## 1. Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Pick any name (e.g. `asset-forge`), a strong database password, and a region near you.
3. Wait for provisioning to finish (~1 minute).

## 2. Grab your keys

**Project Settings → API** (or **Connect** → App Frameworks):

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Put both in `.env.local`. No service role key is needed in Phase 1.

## 3. Check Auth settings

**Authentication → Sign In / Providers → Email**:

- **Email provider**: enabled (it is by default).
- **Confirm email**:
  - For local development, **turn it off** — signup logs you straight in.
  - For production, keep it **on**.

**Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` (change to your production URL when you deploy).
- **Redirect URLs**: add `http://localhost:3000/auth/callback` (and later
  `https://your-domain.com/auth/callback`).

## 4. Run the SQL

Open **SQL Editor → New query**, paste **each block below in order**, and hit **Run**.

### 4a. Tables, RLS, signup trigger, storage bucket (= `supabase/migrations/0001_init.sql`)

```sql
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

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

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

revoke all on public.profiles from anon, authenticated;
revoke all on public.assets from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.assets to authenticated;

-- ---------- storage: private "assets" bucket ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('assets', 'assets', false, 10485760) -- 10 MB
on conflict (id) do nothing;

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
```

### 4b. Quota functions + protected-column guard (= `supabase/migrations/0002_quota.sql`)

```sql
-- Atomically checks and consumes one generation credit. The conditional
-- UPDATE ... WHERE generations_used < p_limit is atomic under Postgres row
-- locking — read-then-write in app code would let a double-click spend a
-- 6th free generation.
create or replace function public.consume_generation_credit(p_limit int)
returns int -- remaining credits after consumption
language plpgsql
security definer
set search_path = public
as $$
declare v_used int;
begin
  update public.profiles
     set generations_used = generations_used + 1,
         updated_at = now()
   where id = auth.uid()
     and generations_used < p_limit
  returning generations_used into v_used;

  if v_used is null then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  return p_limit - v_used;
end $$;

-- Mirrored refund (floored at zero), called when the OpenAI call fails
-- after a credit was already consumed.
create or replace function public.refund_generation_credit()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_used int;
begin
  update public.profiles
     set generations_used = greatest(generations_used - 1, 0),
         updated_at = now()
   where id = auth.uid()
  returning generations_used into v_used;

  return coalesce(v_used, 0);
end $$;

revoke execute on function public.consume_generation_credit(int) from public, anon;
revoke execute on function public.refund_generation_credit() from public, anon;
grant execute on function public.consume_generation_credit(int) to authenticated;
grant execute on function public.refund_generation_credit() to authenticated;

-- Guard billing columns: a user must not be able to write their own plan
-- or credit counter through the profiles update policy.
-- We check current_user (the Postgres role executing the statement), not
-- auth.role(): a direct API update runs as the "authenticated" role, while
-- the SECURITY DEFINER functions above run as their owner (postgres), so
-- they pass the guard.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if new.plan is distinct from old.plan
       or new.plan_renews_at is distinct from old.plan_renews_at
       or new.generations_used is distinct from old.generations_used
       or new.paypal_subscription_id is distinct from old.paypal_subscription_id
    then
      raise exception 'protected_column' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();
```

## 5. Verify

Quick sanity checks in the dashboard:

- **Table Editor**: `profiles` and `assets` exist, both show the RLS badge.
- **Storage**: an `assets` bucket exists and is **not** public.
- **Database → Functions**: `consume_generation_credit` and `refund_generation_credit` exist.

Then run the app (`bun dev`), sign up, and confirm a row appeared in `profiles`. Generate an
asset and confirm a row in `assets` plus a PNG under `assets/{your-user-id}/` in Storage.

## What you did NOT need

- **Service role key** — Phase 1 never bypasses RLS; signed URLs are created with the user's own
  session. The service key only arrives with the PayPal webhook in Phase 2.
- **Dashboard-created storage policies** — the SQL above created them.
- **Email templates / SMTP** — Supabase's built-in email is fine for dev volumes.

## Alternative: local development with the Supabase CLI

```bash
supabase init      # once
supabase start     # local stack on http://127.0.0.1:54321
supabase db reset  # applies supabase/migrations/ (same SQL as above)
```

Use the URL + anon key printed by `supabase start` in `.env.local`. After schema changes,
regenerate types with:

```bash
supabase gen types typescript --local > src/types/database.ts
```
