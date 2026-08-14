# Asset Forge — Architecture Spec

> **Purpose of this document**: a complete, hand-off-ready specification for bootstrapping a new
> repository from scratch. It is the *minimum viable version* of the SpriteFoundry asset generator,
> built to be readable on camera for a YouTube video titled
> *"I Turned My Private AI Tool Into a Real SaaS"* (sponsor: PayPal).
>
> An AI agent should be able to build this repo end-to-end from this document alone.
> Read the whole thing before writing code. Build in the milestone order in §12.

`Asset Forge` is a placeholder name — replace it everywhere with the final product name.

---

## 1. What this product is

A logged-in user types a **title** and a **description** of a game asset, hits **Generate**, and gets
back a single AI-generated image rendered in their chosen art style. Every generated asset is saved
to their personal library. Free accounts get **5 generations**; paid plans get more.

The whole app is one loop:

```
sign up → (optionally tweak the style JSON) → new asset (title + description)
        → Generate → image appears in library → download
```

That is the entire product. Everything not serving that loop is out of scope.

### 1.1 What this is a reduction *of*

The original tool is a multi-tenant platform with organizations, projects, categories, bulk item
tables, multiple style presets per project, a style-diff editor, encrypted per-user provider
credentials, two model providers, an async job queue with a client-side pump, image variant history,
and Stripe billing. **All of that is deliberately removed.** The table below is the contract for what
survives; treat anything not listed as out of scope.

| Original concept | In this repo |
|---|---|
| Tenants / organizations / members | **Cut.** Data is owned by `auth.users.id` directly. |
| Projects | **Cut.** One flat asset library per user. |
| Categories, items, bulk item tables | **Cut.** One asset = one row = one image. |
| Multiple style presets, preset seeding, style diffing | **Cut.** One editable style JSON per user. |
| Provider registry, adapters, Gemini | **Cut.** OpenAI images only, called directly. |
| Encrypted per-user API keys (AES-256-GCM) | **Cut.** Single server-side `OPENAI_API_KEY`. See §4.3. |
| Async job queue, client pump, cron worker, reaper | **Cut.** Generation is synchronous. See §6.2. |
| Image variant history (`item_images`, `active_image_id`) | **Cut.** One image per asset. |
| Stripe subscriptions | **Replaced** by PayPal, and deferred to Phase 2. See §9. |
| Supabase Auth + RLS | **Kept**, simplified to `user_id = auth.uid()`. |
| Private storage bucket + signed URLs | **Kept.** |
| Style JSON → prompt directives | **Kept**, simplified. |

---

## 2. Tech stack

Same stack as the original repo, so the code feels familiar on camera.

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, RSC, Server Actions) |
| Language | TypeScript, `strict: true` |
| Package manager | Bun |
| Styling | Tailwind CSS v4 |
| UI components | shadcn/ui (only the primitives actually used) |
| Icons | `lucide-react` |
| Database / Auth / Storage | Supabase (Postgres, Supabase Auth, Supabase Storage) |
| Supabase client | `@supabase/supabase-js` + `@supabase/ssr` |
| Validation | Zod v4 |
| Forms | `react-hook-form` + `@hookform/resolvers` (only where a form is non-trivial) |
| Image model | OpenAI Images API (`gpt-image-1`), called via `fetch` — **no SDK dependency** |
| Payments (Phase 2) | PayPal Subscriptions (JS SDK button + REST webhooks) |
| Hosting | Vercel |

**No** state-management library, **no** React Query, **no** ORM, **no** job queue, **no** Sentry, **no**
test framework beyond what §13 specifies. Server Components fetch data directly; mutations are Server
Actions; the single long-running operation is a Route Handler.

---

## 3. Data model

Two tables. That is the whole schema for Phase 1.

### 3.1 `profiles`

One row per auth user, created automatically by a trigger on `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | FK → `auth.users(id)` on delete cascade |
| `email` | `text` not null | Copied from auth at signup, for display |
| `plan` | `text` not null default `'free'` | check in `('free','pro')` — extend the check, not the code, when plans are added |
| `plan_renews_at` | `timestamptz` null | Set by PayPal in Phase 2; null for free |
| `generations_used` | `int` not null default `0` | Monotonic within a billing period; reset on renewal |
| `style_json` | `jsonb` not null default `<DEFAULT_STYLE_JSON>` | The user's single editable style. See §5 |
| `paypal_subscription_id` | `text` null | Phase 2. Nullable now so no migration is needed later |
| `created_at` / `updated_at` | `timestamptz` not null default `now()` | `updated_at` maintained by trigger |

### 3.2 `assets`

One row per successfully generated image.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `user_id` | `uuid` not null | FK → `profiles(id)` on delete cascade |
| `title` | `text` not null | 1–120 chars, user-supplied |
| `description` | `text` null | 0–2000 chars, user-supplied |
| `prompt` | `text` not null | The **final** prompt sent to OpenAI. Shown in the UI — this is a selling point |
| `style_json` | `jsonb` not null | Snapshot of the style at generation time, so history stays truthful |
| `model` | `text` not null | e.g. `gpt-image-1` |
| `storage_path` | `text` not null | `{user_id}/{asset_id}.png` in the `assets` bucket |
| `width` / `height` | `int` null | Parsed from the requested size |
| `created_at` | `timestamptz` not null default `now()` | |

Index: `idx_assets_user_created on assets(user_id, created_at desc)`.

**No `status` column.** Generation is synchronous and a row is only written on success (§6.2), so
there is no pending/failed state to model. This removes an entire class of stuck-job bugs that the
original tool had.

### 3.3 Row Level Security

RLS is enabled on both tables. Every policy is the same shape — this is the simplification that
replaces the original's `is_tenant_member()` helper:

```sql
-- profiles: select + update where id = auth.uid(). No insert policy (trigger owns creation),
--           no delete policy (cascades from auth.users).
-- assets:   select + insert + delete where user_id = auth.uid(). No update policy in Phase 1.
```

Grant `select, insert, delete` on `assets` and `select, update` on `profiles` to `authenticated`.

> **Important**: `profiles.plan` and `profiles.generations_used` are user-updatable under a naive
> update policy, which would let a user grant themselves unlimited credits. Fix it with a
> `BEFORE UPDATE` trigger that rejects any change to `plan`, `plan_renews_at`,
> `generations_used`, or `paypal_subscription_id` when `auth.role() = 'authenticated'`. Those columns
> are only ever written by `SECURITY DEFINER` functions (§3.5) and by the Phase 2 webhook using the
> service role. Call this out on camera — it is a genuinely instructive five lines.

### 3.4 Storage

One **private** bucket named `assets`, created in the migration
(`insert into storage.buckets (id, name, public) values ('assets','assets',false)`), with a 10 MB file
size limit.

Storage RLS policies, all keyed on the first path segment being the user's id:

```sql
-- select + insert + delete on storage.objects
-- where bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text
```

Because the *user's own* session can read its own objects, signed URLs are created with the
user-scoped server client. **No service role key is needed in Phase 1** — one less secret to manage
and one less footgun on camera. (Phase 2 introduces it for the PayPal webhook, which has no user
session.)

Signed URLs are generated server-side with a 1-hour TTL and passed to Client Components as props.

### 3.5 The quota function

The single most important piece of backend logic. A `SECURITY DEFINER` Postgres function that
atomically checks and consumes one generation credit:

```sql
create or replace function public.consume_generation_credit(p_limit int)
returns int                       -- returns remaining credits after consumption
language plpgsql security definer set search_path = public as $$
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
```

Plus a mirrored `refund_generation_credit()` that decrements (floored at zero), called when the
OpenAI call fails after a credit was consumed.

**Why it matters**: read-then-write in application code lets a double-click spend a 6th generation.
The conditional `UPDATE ... WHERE generations_used < p_limit` is atomic under Postgres row locking.
This is a 10-line answer to "how do you actually enforce a free tier" and is worth a beat in the
video.

The limit is passed *in* from application code rather than stored in the DB, so pricing changes live
in `lib/billing/plans.ts` (§9.1) and never require a migration.

---

## 4. External services

### 4.1 Supabase

- Auth: **email + password**. Recommend disabling email confirmation for local dev; keep it on in
  prod. Optionally add Google OAuth later — the callback route exists either way.
- Local development uses the Supabase CLI (`supabase start`) with migrations in `supabase/migrations/`.
  Every schema change is a migration file; no clicking around in the dashboard.

### 4.2 OpenAI

`POST https://api.openai.com/v1/images/generations`, model `gpt-image-1`, `n: 1`,
`size: "1024x1024"`, `output_format: "png"`, `background: "transparent"`. The response contains
`data[0].b64_json`; decode to a Buffer and upload to Storage. Use an `AbortController` with a
**60-second** timeout (below the Vercel function limit of 60s on Pro / configure `maxDuration`).

Port the error-normalization shape from the original `openai.ts` adapter, but inline as a single
module — no `ProviderAdapter` interface, no registry.

### 4.3 API key handling — read this carefully

The brief says "you need to bring your API key". There are two readings, and they conflict with
"5 free generations":

- **Per-user keys stored in the app**: users paste their own key into settings. But if a user pays
  OpenAI directly, capping them at 5 generations is arbitrary and the free tier means nothing — and
  it drags in AES-256-GCM encryption at rest, key validation, and a credentials UI.
- **One server-side key** (`OPENAI_API_KEY` in env): the operator pays for inference. "Bring your own
  key" applies to *whoever clones and runs the repo*. The free tier now has a real cost behind it,
  which is exactly what makes the PayPal upgrade story coherent.

**Decision for this spec: one server-side key.** It is smaller, and it makes the SaaS narrative
honest — you are metering something that genuinely costs you money. If you later want per-user keys
as a "Pro" perk that bypasses quota, add a `profiles.openai_key_ciphertext` column and lift
`src/lib/crypto/aes-gcm.ts` from the original repo verbatim; nothing else in this design changes.

---

## 5. The style system

One JSON object per user, stored in `profiles.style_json`, edited on a single page in a plain
`<textarea>`. There are no presets, no per-project styles, and no visual token editor.

### 5.1 Default style JSON

Ship this as `DEFAULT_STYLE_JSON` in `src/lib/style/default.ts`, and use it as the column default:

```json
{
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
}
```

### 5.2 Validation

Deliberately permissive — the point of the feature is that users can invent their own keys.

```ts
const styleSchema = z.object({ prompt_hints: z.array(z.string()).optional() })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]));
```

Rules: must parse as JSON, must be an object (not an array or scalar), must be ≤ 8 KB serialized.
The editor shows a live parse error and disables **Save** while invalid. A **Reset to default**
button restores `DEFAULT_STYLE_JSON`.

### 5.3 Prompt construction

`src/lib/generation/prompt.ts` exports one pure, unit-testable function:

```ts
buildPrompt({ title, description, style }): string
```

It produces:

```
Generate a single game asset image: {title}.
{description ? `Details: ${description}` : ""}
Art direction: {style.art_direction}
Style directives: {every scalar key of style, excluding `version` and `prompt_hints`, as "key: value", joined by ", "}
Additional notes: {style.prompt_hints joined by "; "}
Output a single standalone asset image on a transparent background. No text or watermarks.
```

Unknown keys the user invents are folded into "Style directives" automatically — that is what makes
the freeform JSON worth editing, and it demos beautifully (add `"mood": "cursed and dripping"`,
regenerate, watch it change).

---

## 6. Application architecture

### 6.1 Routes

| Route | Type | Auth | Purpose |
|---|---|---|---|
| `/` | RSC | public | Landing: hero, the 3-step loop, sample asset grid, CTA |
| `/pricing` | RSC | public | Free vs Pro. Phase 1: Pro CTA is a disabled "Coming soon" |
| `/login` | RSC + client form | public | Email + password sign in, link to signup |
| `/signup` | RSC + client form | public | Email + password sign up |
| `/auth/callback` | Route Handler | public | Exchanges auth code for a session |
| `/auth/signout` | Route Handler (POST) | any | Signs out, redirects to `/` |
| `/app` | RSC | **required** | Asset library grid + usage meter + "New asset" |
| `/app/new` | RSC + client form | **required** | Title + description → Generate |
| `/app/assets/[id]` | RSC | **required** | Full image, final prompt, style snapshot, download, delete |
| `/app/style` | RSC + client editor | **required** | The style JSON textarea |
| `/app/billing` | RSC | **required** | Current plan, usage, upgrade CTA (Phase 2: PayPal button) |
| `/api/generate` | Route Handler (POST) | **required** | The only real endpoint. `maxDuration = 60` |
| `/api/paypal/webhook` | Route Handler (POST) | service | **Phase 2 only** |

`middleware.ts` refreshes the Supabase session on every non-static request (port
`updateSupabaseSession` from the original repo verbatim) and redirects unauthenticated requests for
`/app/*` to `/login?next=<path>`.

### 6.2 Generation flow — synchronous by design

`POST /api/generate` with `{ title, description }`:

1. Resolve the session; 401 if absent.
2. Validate the body with Zod; 422 on failure.
3. Load the profile → read `plan` and `style_json`; derive `limit` from `PLANS[plan].generations`.
4. `rpc('consume_generation_credit', { p_limit: limit })`. On the `quota_exceeded` error, return
   **402** with `{ error: "quota_exceeded", plan, limit }`. The client turns this into the upgrade
   prompt.
5. `buildPrompt(...)` → call OpenAI (60s timeout).
6. On provider failure: `rpc('refund_generation_credit')`, then return **502** with a normalized
   message. No asset row is written.
7. Upload the PNG to `assets/{user_id}/{asset_id}.png`.
8. Insert the `assets` row (with the final prompt and the style snapshot).
9. `revalidatePath('/app')` and return `{ id, remaining }`. The client routes to
   `/app/assets/{id}`.

**Why synchronous**: `gpt-image-1` returns in roughly 10–30s, comfortably inside a 60s function. The
original tool's queue existed to support bulk generation of 50 icons, and it brought a client-side
pump, a cron worker, a stuck-job reaper, and an attempts counter with it. One image at a time needs
none of that. The client just shows a spinner and disables the button. **Bulk generation is an
explicit non-goal** — reintroducing it means reintroducing the queue.

### 6.3 Mutations

Server Actions for everything except generation:

- `updateStyle(formData)` — validate, write `profiles.style_json`, `revalidatePath('/app/style')`.
- `deleteAsset(id)` — delete the storage object, then the row (RLS scopes both). Deleting an asset
  **does not** refund a credit; the API call was already paid for. State this in the UI copy.
- `signIn` / `signUp` / `signOut`.

### 6.4 Reading data

Server Components query Supabase directly through the user-scoped server client. `/app` fetches the
user's assets ordered by `created_at desc`, batch-creates signed URLs for all `storage_path`s in one
call, and passes plain props into a client grid component. No client-side data fetching anywhere.

### 6.5 Error handling

`src/lib/http.ts` provides `ok(data)` / `fail(status, code, message)` returning a consistent
`{ error: { code, message } }` envelope. Client code switches on `code`, never on the message string.
Codes used: `unauthorized`, `invalid_input`, `quota_exceeded`, `provider_error`, `storage_error`,
`not_found`.

---

## 7. UI

Dark, dense, tool-like — it should read as a product a developer built for themselves. Reuse the
original's brand palette so the video has visual continuity:

```
background #F6F4EF · surface #1E2430 · accent #E97A2B · secondary #1E9E9A
success #3F8D5A · warning #D9981E · danger #C74B45
```

Screens:

- **Landing** — one-sentence hero, the three-step loop as three cards, a grid of 6–8 sample generated
  images committed to `public/marketing/`, pricing teaser, footer.
- **App shell** — slim top bar: wordmark, `Library` / `Style` / `Billing`, and a usage pill
  (`3 / 5 generations`) that turns amber at the limit and links to `/app/billing`.
- **Library** — responsive card grid; each card shows the image, title, and relative date. Empty
  state points at `/app/new`.
- **New asset** — two fields and one big **Generate** button. While generating: button disabled,
  spinner, and rotating status text ("Building prompt…", "Calling the model…", "Saving your
  asset…"). On a 402, swap the form for an upgrade card linking to `/app/billing`.
- **Asset detail** — large image, Download button (signed URL, `download` attribute), collapsible
  "Prompt used" and "Style used" blocks, Delete with a confirm dialog.
- **Style editor** — monospace textarea, live JSON validity indicator, Save, Reset to default, and a
  short explainer that any key added here becomes a prompt directive.
- **Billing** — current plan, usage bar, and the plan comparison. Phase 1: disabled CTA. Phase 2:
  PayPal button.

shadcn/ui components to install: `button`, `input`, `textarea`, `card`, `badge`, `dialog`, `label`,
`progress`, `sonner` (toasts). Nothing else.

---

## 8. Repository layout

```
.
├── README.md                    # setup in <10 minutes, .env table, supabase start
├── .env.example
├── middleware.ts
├── next.config.ts
├── package.json
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_init.sql        # profiles, assets, RLS, trigger, storage bucket + policies
│   │   ├── 0002_quota.sql       # consume_ / refund_generation_credit, column-guard trigger
│   │   └── 0003_paypal.sql      # Phase 2: subscriptions/webhook-event table
│   └── seed.sql                 # optional demo data for recording
├── public/marketing/            # sample generated images for the landing page
└── src/
    ├── app/
    │   ├── layout.tsx  globals.css  page.tsx        # landing
    │   ├── pricing/page.tsx
    │   ├── (auth)/login/page.tsx
    │   ├── (auth)/signup/page.tsx
    │   ├── auth/callback/route.ts
    │   ├── auth/signout/route.ts
    │   ├── app/
    │   │   ├── layout.tsx                           # app shell + auth guard
    │   │   ├── page.tsx                             # library
    │   │   ├── new/page.tsx
    │   │   ├── assets/[id]/page.tsx
    │   │   ├── style/page.tsx
    │   │   └── billing/page.tsx
    │   └── api/
    │       ├── generate/route.ts
    │       └── paypal/webhook/route.ts              # Phase 2
    ├── components/
    │   ├── ui/                                      # shadcn primitives
    │   ├── layout/{marketing-nav,app-nav,usage-pill}.tsx
    │   ├── assets/{asset-grid,asset-card,generate-form,delete-asset-dialog}.tsx
    │   └── style/style-editor.tsx
    ├── lib/
    │   ├── supabase/{client,server,middleware,admin}.ts   # admin.ts is Phase 2 only
    │   ├── auth/session.ts                          # requireUser(), getUser()
    │   ├── env/{client,server}.ts                   # Zod-validated env
    │   ├── billing/{plans,quota}.ts
    │   ├── style/{default,schema}.ts
    │   ├── generation/{prompt,openai}.ts
    │   ├── assets/{queries,actions}.ts
    │   ├── storage.ts
    │   ├── http.ts
    │   └── utils.ts
    └── types/database.ts                            # generated: supabase gen types typescript
```

Roughly 35 source files. If a milestone's implementation is pushing well past that, something from
§1.1 has crept back in.

---

## 9. Billing

### 9.1 Phase 1 — plans exist, payment does not

`src/lib/billing/plans.ts` is the single source of truth:

```ts
export const PLANS = {
  free: { id: "free", name: "Free",  generations: 5,   priceUsd: 0,  paypalPlanId: null },
  pro:  { id: "pro",  name: "Pro",   generations: 200, priceUsd: 12, paypalPlanId: process.env.PAYPAL_PLAN_ID_PRO ?? null },
} as const;
export type PlanId = keyof typeof PLANS;
```

`src/lib/billing/quota.ts` exposes `getQuota(profile) → { used, limit, remaining, plan }` and is the
only thing the UI and the generate route consult. Nothing outside these two files hardcodes `5`.

`/pricing` and `/app/billing` render from `PLANS` already, so Phase 2 only has to make the button do
something. Ship Phase 1 with the Pro CTA disabled and labelled "Coming soon" — do not fake a
checkout.

### 9.2 Phase 2 — PayPal subscriptions

Design so that adding PayPal touches **four** places and nothing else: one migration, one webhook
route, one button component, one `activatePlan()` helper.

1. **PayPal setup** (dashboard, no code): sandbox app → client ID + secret; a Product; a monthly
   Subscription Plan at the Pro price → `PAYPAL_PLAN_ID_PRO`. Subscribe the webhook to
   `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`,
   `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `PAYMENT.SALE.COMPLETED`.

2. **Migration `0003_paypal.sql`** — a `webhook_events` table (`id`, `provider`, `event_id` **unique**,
   `event_type`, `payload jsonb`, `processed_at`) for idempotency. RLS on, with **no** policies: only
   the service role touches it. `profiles.paypal_subscription_id` already exists from `0001`.

3. **Checkout** — the PayPal JS SDK button on `/app/billing`, in a Client Component, created with
   `plan_id: PAYPAL_PLAN_ID_PRO` and `custom_id: user.id`. `custom_id` is what links the subscription
   back to the account inside the webhook; nothing else in the payload is trustworthy.

4. **Webhook** `POST /api/paypal/webhook` — must:
   - read the **raw body** before parsing (signature verification needs the exact bytes);
   - verify via PayPal's `/v1/notifications/verify-webhook-signature` using `PAYPAL_WEBHOOK_ID`.
     Reject with 401 if it does not return `SUCCESS`. **Never trust an unverified webhook**;
   - insert into `webhook_events` and bail out early on a unique-violation (PayPal retries);
   - use the **service role** client — there is no user session here, so RLS must be bypassed
     deliberately. This is the one place `SUPABASE_SERVICE_ROLE_KEY` is used;
   - dispatch on event type:
     - `ACTIVATED` → `plan='pro'`, store `paypal_subscription_id`, set `plan_renews_at`, reset
       `generations_used = 0`;
     - `PAYMENT.SALE.COMPLETED` → renewal: reset `generations_used = 0`, roll `plan_renews_at`;
     - `CANCELLED` / `EXPIRED` / `SUSPENDED` → `plan='free'`, clear `plan_renews_at`. Existing
       assets are never deleted;
   - return 200 for anything it does not handle, so PayPal stops retrying.

5. **Nothing else changes.** The generate route already reads the limit from `PLANS[profile.plan]`.

> **On camera**: the two details worth dwelling on are signature verification and the idempotency
> table. Both are the difference between a demo and something you would actually take money with.

---

## 10. Environment variables

`src/lib/env/{client,server}.ts` parse these with Zod at import time and fail loudly with the
variable's name. `.env.example` lists all of them with comments.

**Phase 1**

| Variable | Scope | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | yes | Anon key |
| `OPENAI_API_KEY` | server | yes | The image model key |
| `OPENAI_IMAGE_MODEL` | server | no (default `gpt-image-1`) | Lets you switch models without a deploy |
| `APP_URL` | server | yes | Absolute URL for auth redirects |

**Phase 2 adds**

| Variable | Scope | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | server | Webhook writes only. Never imported into a Client Component |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | client | SDK button |
| `PAYPAL_CLIENT_SECRET` | server | Webhook signature verification |
| `PAYPAL_PLAN_ID_PRO` | server | Subscription plan id |
| `PAYPAL_WEBHOOK_ID` | server | Signature verification |
| `PAYPAL_ENV` | server | `sandbox` \| `live` — selects the API base URL |

---

## 11. Security requirements

Non-negotiable; each is one or two lines of code and each is worth naming in the video.

1. RLS enabled on every table, with `auth.uid()`-scoped policies. No table is left open.
2. The column-guard trigger from §3.3 — a user cannot write their own `plan` or `generations_used`.
3. Quota consumed by the atomic `UPDATE ... WHERE used < limit`, never read-then-write.
4. `SUPABASE_SERVICE_ROLE_KEY` appears only in `src/lib/supabase/admin.ts`, which starts with
   `import "server-only"`.
5. The storage bucket is private; the client only ever sees short-lived signed URLs.
6. Every API input goes through a Zod schema before touching the database.
7. PayPal webhooks are signature-verified and deduplicated by `event_id`.
8. `OPENAI_API_KEY` is never exposed to the browser and never echoed in an error response —
   normalize provider errors before returning them.

---

## 12. Build milestones

Each milestone ends with a working app. Do not start the next until the previous runs.

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold: Next 16 + TS + Tailwind v4 + shadcn, `supabase init`, env parsing, `.env.example`, README | `bun dev` serves a styled placeholder; `bun run ci` (lint + typecheck + build) passes |
| **M1** | Auth: migration `0001` (profiles, assets, RLS, signup trigger, bucket + storage policies), Supabase clients, middleware, login/signup/callback/signout, `/app` guard | Sign up → land on an empty `/app`; a `profiles` row exists; signed-out access to `/app` redirects |
| **M2** | Style: `DEFAULT_STYLE_JSON`, schema, `/app/style` editor with validation, save action, reset | Edit + save + reload persists; invalid JSON blocks Save |
| **M3** | Generation: migration `0002` (quota functions + column guard), `plans.ts`, `quota.ts`, `buildPrompt`, OpenAI module, `POST /api/generate`, `/app/new`, storage upload | Title + description → a real PNG in the library; the 6th generation returns 402 |
| **M4** | Library: `/app` grid with signed URLs, `/app/assets/[id]` detail with prompt + style + download, delete action, usage pill | Full loop works; deleting removes the row *and* the storage object |
| **M5** | Marketing: landing, `/pricing`, `/app/billing` (disabled CTA), sample images, README polish | A stranger can sign up and generate without being told how |
| **M6** | **PayPal (later)**: migration `0003`, SDK button, verified webhook, `activatePlan()` | A sandbox subscription flips the account to Pro and resets usage; a replayed webhook is a no-op |

M0–M5 is the video's build. M6 is the sponsor segment and should be a clean, separable set of
commits — ideally its own PR, so the diff is legible on screen.

---

## 13. Quality bar

- `bun run ci` = `eslint . && tsc --noEmit && next build`. It must pass at every milestone; wire it
  into a GitHub Action on push and PR.
- Tests are **not** required, with one exception: `buildPrompt` is pure and is the heart of the
  product, so give it a handful of `bun test` cases (default style, custom keys, missing
  description). Keep it to one file.
- No `any` outside generated Supabase types. No `@ts-expect-error` without a comment explaining why.
- `src/types/database.ts` is generated (`supabase gen types typescript --local`), committed, and
  regenerated after every migration.
- README must get a stranger from `git clone` to a generated image in under ten minutes: prerequisites,
  env table, `supabase start`, `supabase db reset`, where to get an OpenAI key, `bun dev`.

---

## 14. Explicit non-goals

Do not build these, and push back if asked to during implementation. Each one is a thing the original
tool has that made it big.

Projects or folders · teams, orgs, or sharing · bulk or batch generation · a job queue, cron, or
background worker · image variants or generation history per asset · multiple style presets or a
style library · a second model provider · image editing, upscaling, or background removal · per-user
API keys (see §4.3) · admin dashboard · usage analytics beyond the counter · email notifications ·
password reset flows (Phase 1 — Supabase's hosted flow is fine) · dark/light theme toggle ·
internationalization · a public API or API keys for users.
