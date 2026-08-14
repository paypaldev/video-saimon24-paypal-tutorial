# Asset Forge

A logged-in user types a **title** and a **description** of a game asset, hits **Generate**, and
gets back an AI-generated image rendered in their chosen art style. Every asset is saved to their
personal library. Free accounts get 5 generations.

The whole app is one loop:

```
sign up → (optionally tweak the style JSON) → new asset (title + description)
        → Generate → image appears in library → download
```

## Stack

Next.js 16 (App Router, RSC, Server Actions) · TypeScript · Bun · Tailwind v4 · shadcn/ui ·
Supabase (Postgres, Auth, Storage) · OpenAI Images API (`gpt-image-1`, plain `fetch`, no SDK).

## Setup (under 10 minutes)

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.2
- A [Supabase](https://supabase.com) account (or the Supabase CLI for local dev)
- An [OpenAI API key](https://platform.openai.com/api-keys) with access to `gpt-image-1`

### 1. Install

```bash
git clone <this repo> && cd asset-saas
bun install
```

### 2. Set up Supabase

Follow **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** — create a project, run the two SQL
migrations, check the auth settings. Takes ~5 minutes.

For local development with the Supabase CLI instead:

```bash
supabase init && supabase start
supabase db reset   # applies supabase/migrations/
```

### 3. Environment

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (Dashboard → Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key (same page) |
| `OPENAI_API_KEY` | yes | Server-side image model key — never exposed to the browser |
| `OPENAI_IMAGE_MODEL` | no | Defaults to `gpt-image-1` |
| `APP_URL` | yes | Absolute URL for auth redirects, e.g. `http://localhost:3000` |
| `PAYPAL_ENV` | no | `sandbox` (default) or `live` — picks the PayPal API base URL |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | billing only | PayPal REST app client id (public — it ships in the SDK script URL) |
| `PAYPAL_CLIENT_SECRET` | billing only | PayPal REST app secret |
| `PAYPAL_PLAN_ID_PRO` | billing only | The monthly Pro subscription plan id (`P-…`) |
| `PAYPAL_WEBHOOK_ID` | billing only | Webhook id (`WH-…`), used to verify every delivery |
| `SUPABASE_SERVICE_ROLE_KEY` | billing only | Used **only** by the PayPal webhook — never sent to the browser |

The five "billing only" variables are optional. Leave them empty and the app runs exactly as
before, with the Pro plan shown as "Coming soon". Fill in all five to turn on checkout — see
[PayPal setup](#paypal-setup) below.

### 4. Run

```bash
bun dev
```

Open http://localhost:3000, sign up, and generate your first asset.

## Scripts

| Command | What it does |
|---|---|
| `bun dev` | Dev server |
| `bun run ci` | `eslint . && tsc --noEmit && next build` — must always pass |
| `bun test` | Unit tests for `buildPrompt` (the heart of the product) |
| `bun run paypal:plan` | Creates the PayPal product + Pro subscription plan and prints the id for `.env.local`. `--dry-run` to preview — see [PayPal setup](#3-create-a-product-and-a-monthly-plan--paypal_plan_id_pro) |

## How it works

- **Data model**: two tables — `profiles` (one per user, holds the plan, usage counter, and the
  editable style JSON) and `assets` (one row per generated image). RLS scopes everything to
  `auth.uid()`.
- **Quota**: a `SECURITY DEFINER` Postgres function consumes a credit with an atomic
  `UPDATE … WHERE generations_used < limit` — a double-click can never spend a 6th free
  generation. Limits live in [src/lib/billing/plans.ts](src/lib/billing/plans.ts), not the DB.
- **Generation** ([/api/generate](src/app/api/generate/route.ts)) is synchronous: consume credit →
  build prompt → call OpenAI (60s timeout) → upload PNG to a private bucket → insert the row.
  Provider failures refund the credit.
- **Style**: one JSON object per user. Every scalar key becomes a prompt directive, so users can
  invent their own keys (`"mood": "cursed and dripping"`).
- **Images** are served via short-lived signed URLs from a private bucket — nothing is public.
- **Billing**: PayPal subscriptions. The checkout button on `/app/billing` creates a subscription
  carrying the user id as `custom_id`; a signature-verified webhook flips the plan and resets the
  usage counter. See below.

---

## PayPal setup

Everything here happens once, in PayPal's dashboard. Budget about 15 minutes. Do it all in
**sandbox** first — the only difference for production is which toggle you are on and setting
`PAYPAL_ENV=live`.

### 1. Create a PayPal developer account

Sign in at **[developer.paypal.com/dashboard](https://developer.paypal.com/dashboard/)** with any
PayPal account. Under **Testing Tools → Sandbox Accounts** you get two accounts generated for you:
a **business** one (the merchant — that's you) and a **personal** one (the buyer — that's your test
customer). Note the personal account's email and click **⋮ → View/Edit account** to see its
password. You will need both to test a checkout.

### 2. Create a REST app → client id + secret

1. **Apps & Credentials** → make sure the **Sandbox** toggle is selected.
2. **Create App** → name it (e.g. `Asset Forge`) → type **Merchant** → pick your sandbox business
   account → **Create App**.
3. Copy **Client ID** and **Secret** (click "Show").
4. Scroll to **Features** and make sure **Subscriptions** is enabled, then **Save**. Without it,
   the SDK button will fail to create a subscription.

```bash
NEXT_PUBLIC_PAYPAL_CLIENT_ID=AeA1QIZ...   # Client ID
PAYPAL_CLIENT_SECRET=EK7f9x...            # Secret
```

### 3. Create a product and a monthly plan → `PAYPAL_PLAN_ID_PRO`

A PayPal subscription needs a **product** (what you sell) and a **plan** (how it is billed).

**Option A — the sandbox merchant dashboard.** Log in at
[sandbox.paypal.com](https://www.sandbox.paypal.com) with your sandbox *business* account, then
**Pay & Get Paid → Subscriptions → Create plan**. Create the product, then a **Fixed price**,
**Monthly**, **$12 USD** plan with no trial. Copy the plan id (`P-…`).

**Option B — the included script** (faster and repeatable; this is what the video does). Put the
client id and secret from step 2 into `.env.local` first — the script reads them from there:

```bash
bun run paypal:plan
```

```
PayPal environment: sandbox (https://api-m.sandbox.paypal.com)
Plan from src/lib/billing/plans.ts: Pro — $12/month, 200 generations

✓ Created product   PROD-3BS769049C001622G
✓ Created plan      P-6T670114DN158503MNJ7OEUQ

Add this to .env.local and restart the dev server:

PAYPAL_PLAN_ID_PRO=P-6T670114DN158503MNJ7OEUQ
```

[scripts/create-paypal-plan.ts](scripts/create-paypal-plan.ts) makes exactly the two API calls
Option A does through the UI — `POST /v1/catalogs/products` then `POST /v1/billing/plans` — and it
reads the name, price and description from
[src/lib/billing/plans.ts](src/lib/billing/plans.ts), so the plan PayPal charges can never drift
from the plan the app advertises. Change the price there, re-run, swap the id.

| Flag / variable | Effect |
|---|---|
| `--dry-run` | Prints both payloads and calls nothing. Good for a look before you leap |
| `--force` | Allows a re-run when `PAYPAL_PLAN_ID_PRO` is already set (otherwise it refuses, so you don't quietly end up with two plans) |
| `--yes` | Required when `PAYPAL_ENV=live`, because a live plan is customer-facing and can only be deactivated, never deleted |
| `PAYPAL_PRODUCT_ID=…` | Reuses an existing product instead of creating another one — use this when adding a second plan or changing the price |

### 4. Create the webhook → `PAYPAL_WEBHOOK_ID`

Back in **Apps & Credentials → your app → Webhooks → Add Webhook**.

- **Webhook URL**: `https://your-domain.com/api/paypal/webhook`
- **Event types** — subscribe to exactly these five:
  - `BILLING.SUBSCRIPTION.ACTIVATED`
  - `BILLING.SUBSCRIPTION.CANCELLED`
  - `BILLING.SUBSCRIPTION.EXPIRED`
  - `BILLING.SUBSCRIPTION.SUSPENDED`
  - `PAYMENT.SALE.COMPLETED`

Save, then copy the **Webhook ID** shown next to the webhook (`WH-…`) — not the URL.

```bash
PAYPAL_WEBHOOK_ID=WH-2WR32451HC0233532-67976317FL4543714
```

> PayPal will not deliver to `localhost`. For local testing, expose your dev server with
> `ngrok http 3000` (or `cloudflared tunnel --url http://localhost:3000`) and register the
> public URL. Upgrading still works locally without a tunnel — the button confirms the
> subscription server-side through `/api/paypal/confirm` — but renewals and cancellations only
> arrive by webhook.

### 5. Add the Supabase service role key

**Supabase Dashboard → Project Settings → API → `service_role` key.** The webhook has no user
session, and `profiles.plan` is deliberately not writable by a signed-in user, so this one path
bypasses RLS on purpose. It is used only in
[src/lib/supabase/admin.ts](src/lib/supabase/admin.ts), which starts with `import "server-only"`.

### 6. Apply the migration and restart

```bash
supabase db reset          # local; or run supabase/migrations/0003_paypal.sql in the SQL editor
bun dev
```

`0003_paypal.sql` adds the `webhook_events` table used for idempotency. `profiles` already has
`plan`, `plan_renews_at` and `paypal_subscription_id` from `0001`.

Open `/app/billing`. If any variable is missing, the page tells you which ones (in development) and
keeps the Pro plan disabled instead of rendering a checkout that cannot work.

### 7. Test the flow

1. Go to `/app/billing` and click the PayPal button.
2. Log in with your **sandbox personal (buyer)** account and approve the subscription.
3. The window closes, the plan flips to **Pro**, and `generations_used` resets to 0.
4. In **Apps & Credentials → your app → Webhooks → Webhook events**, check the delivery shows a
   `200`. Use **Resend** on the same event — the account state must not change, because
   `webhook_events.event_id` is unique.
5. Cancel from the sandbox buyer account (**sandbox.paypal.com → Payments → Manage automatic
   payments**) and confirm the account drops back to Free. Assets are never deleted.

### Going live

Switch the dashboard toggle to **Live**, redo steps 2–4 with the live credentials (live plan ids
and webhook ids are different), set `PAYPAL_ENV=live`, and point the webhook at your production
domain.

## How billing is wired

| Piece | File |
|---|---|
| Plans, prices, limits | [src/lib/billing/plans.ts](src/lib/billing/plans.ts) |
| Env → validated PayPal config | [src/lib/paypal/config.ts](src/lib/paypal/config.ts) |
| Token, signature verification, subscription read | [src/lib/paypal/api.ts](src/lib/paypal/api.ts) |
| The only code that writes a plan | [src/lib/billing/activate.ts](src/lib/billing/activate.ts) |
| Checkout button | [src/components/billing/paypal-subscribe-button.tsx](src/components/billing/paypal-subscribe-button.tsx) |
| Webhook | [src/app/api/paypal/webhook/route.ts](src/app/api/paypal/webhook/route.ts) |
| Post-approval confirm | [src/app/api/paypal/confirm/route.ts](src/app/api/paypal/confirm/route.ts) |

Three rules the implementation follows:

1. **Never trust an unverified webhook.** The raw body is read before parsing and checked against
   PayPal's `/v1/notifications/verify-webhook-signature`; anything else is a 401.
2. **Every event is deduplicated.** PayPal retries until it gets a 2xx, so each delivery is
   inserted into `webhook_events` first — a repeat event id hits the unique constraint and the
   handler exits without re-applying it.
3. **The account is resolved from `custom_id`**, which the checkout button sets to the user id, or
   from `paypal_subscription_id`. Nothing else in a PayPal payload identifies the customer.
