-- ============================================================
-- 0004_refund_guard.sql — take the credit refund away from the browser
-- ============================================================
--
-- 0002 granted refund_generation_credit() to `authenticated`, keyed on
-- auth.uid(). Any signed-in user could therefore call it straight from the
-- browser — supabase.rpc("refund_generation_credit") in a loop — and walk
-- generations_used back to zero: unlimited generations on any plan.
--
-- A refund is only legitimate when /api/generate consumed a credit and the
-- provider call then failed, and only the server knows that. So the function
-- now takes the user id explicitly and is executable by `service_role` alone;
-- the route calls it with the service-role client for the session's own user.
--
-- consume_generation_credit() stays callable by `authenticated`: calling it
-- directly can only ever cost the caller a credit.

drop function if exists public.refund_generation_credit();

create or replace function public.refund_generation_credit(p_user_id uuid)
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
   where id = p_user_id
  returning generations_used into v_used;

  return coalesce(v_used, 0);
end $$;

-- Supabase's default privileges grant EXECUTE on new functions to anon and
-- authenticated, so revoke explicitly rather than rely on never granting.
revoke execute on function public.refund_generation_credit(uuid) from public, anon, authenticated;
grant execute on function public.refund_generation_credit(uuid) to service_role;
