-- ============================================================
-- 0002_quota.sql — atomic quota functions + protected-column guard
-- ============================================================

-- Atomically checks and consumes one generation credit.
-- The conditional UPDATE ... WHERE generations_used < p_limit is atomic under
-- Postgres row locking — read-then-write in application code would let a
-- double-click spend a 6th generation.
-- The limit is passed IN from application code (lib/billing/plans.ts) so
-- pricing changes never require a migration.
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

-- Mirrored refund (floored at zero), called when the OpenAI call fails after
-- a credit was already consumed.
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

-- Guard billing columns: a user must not be able to write their own plan or
-- credit counter through the profiles update policy.
--
-- We check current_user (the Postgres role executing the statement), not
-- auth.role(): a direct PostgREST update runs as the "authenticated" role,
-- while the SECURITY DEFINER quota functions above run as their owner
-- (postgres), so they pass the guard — auth.role() would report
-- 'authenticated' in both cases and block the quota functions too.
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
