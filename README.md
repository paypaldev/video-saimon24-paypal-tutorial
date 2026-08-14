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

Billing (PayPal subscriptions) is Phase 2 and intentionally not implemented yet; the Pro plan CTA
is a disabled "Coming soon".
