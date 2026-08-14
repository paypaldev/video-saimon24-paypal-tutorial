-- ============================================================
-- 0003_paypal.sql — webhook idempotency log
-- ============================================================
--
-- PayPal retries a webhook until it gets a 2xx, so the same event id can
-- arrive several times. Every delivery is inserted here first; the unique
-- constraint on event_id turns a replay into a no-op instead of a second
-- plan activation / usage reset.
--
-- profiles.paypal_subscription_id already exists from 0001, so the plan
-- columns need no migration.

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paypal',
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_webhook_events_received on public.webhook_events (received_at desc);

-- RLS on with NO policies: this table is invisible to anon and authenticated.
-- Only the service role (which bypasses RLS) touches it, from the webhook
-- route — the one place SUPABASE_SERVICE_ROLE_KEY is used.
alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from anon, authenticated;

-- Note: the protect_profile_columns() guard from 0002 checks
-- current_user = 'authenticated'. The webhook writes as 'service_role', so it
-- can set plan / plan_renews_at / generations_used / paypal_subscription_id
-- while a signed-in user still cannot.
