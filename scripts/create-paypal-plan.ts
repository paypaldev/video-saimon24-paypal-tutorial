#!/usr/bin/env bun
/**
 * Creates the PayPal product + monthly subscription plan for the Pro tier and
 * prints the plan id to paste into `.env.local`.
 *
 *   bun run paypal:plan             # create against PAYPAL_ENV (default sandbox)
 *   bun run paypal:plan --dry-run   # print the payloads, call nothing
 *
 * Credentials come from the environment — Bun loads `.env.local` for you, so
 * filling in NEXT_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET there is
 * enough. See the "PayPal setup" section of the README.
 *
 * Name, price and description are read from src/lib/billing/plans.ts so the
 * plan PayPal charges can never drift from the plan the app advertises.
 */
import { PLANS } from "@/lib/billing/plans";

const API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

const CURRENCY = "USD";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const confirmed = args.has("--yes");

function fail(message: string, hint?: string): never {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

// ── Inputs ────────────────────────────────────────────────────────────
const clientId =
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || "";
const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
const env = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
const apiBase = API_BASE[env];

if (!dryRun && (!clientId || !clientSecret)) {
  fail(
    "NEXT_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set.",
    "Add them to .env.local (Apps & Credentials → your app), then re-run.",
  );
}

// A live plan is customer-facing and cannot be deleted, only deactivated —
// so creating one is never an accident.
if (env === "live" && !confirmed && !dryRun) {
  fail(
    "PAYPAL_ENV=live — this would create a real, customer-facing plan.",
    "Re-run with --yes if that is what you want, or use --dry-run to preview it.",
  );
}

if (process.env.PAYPAL_PLAN_ID_PRO && !force && !dryRun) {
  fail(
    `PAYPAL_PLAN_ID_PRO is already set to ${process.env.PAYPAL_PLAN_ID_PRO}.`,
    "Re-running creates a second plan at PayPal. Pass --force if that is what you want.",
  );
}

const plan = PLANS.pro;

// ── Payloads ──────────────────────────────────────────────────────────
const productBody = {
  name: "Asset Forge",
  description: "AI game asset generation",
  type: "SERVICE",
  category: "SOFTWARE",
};

function planBody(productId: string) {
  return {
    product_id: productId,
    name: `Asset Forge ${plan.name}`,
    description: `${plan.generations} generations per month`,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0, // 0 = renew until cancelled
        pricing_scheme: {
          fixed_price: { value: String(plan.priceUsd), currency_code: CURRENCY },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  };
}

// ── PayPal calls ──────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    fail(
      `PayPal rejected the credentials (${response.status}).`,
      "Check that the client id and secret are from the same app, and that the " +
        `dashboard toggle matches PAYPAL_ENV=${env}.`,
    );
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) fail("PayPal returned no access token.");
  return json.access_token;
}

type PaypalErrorBody = {
  name?: string;
  message?: string;
  details?: Array<{ issue?: string; description?: string }>;
};

async function post(path: string, token: string, body: unknown, label: string) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (!response.ok) {
    const error = json as PaypalErrorBody;
    const issues = (error.details ?? [])
      .map((d) => `${d.issue ?? "?"}: ${d.description ?? ""}`)
      .join("; ");
    fail(
      `Could not create the ${label} (${response.status} ${error.name ?? ""}). ${
        error.message ?? ""
      } ${issues}`.trim(),
      response.status === 403
        ? "403 usually means the Subscriptions feature is not enabled on the app — " +
            "Apps & Credentials → your app → Features → Subscriptions → Save."
        : undefined,
    );
  }

  return json as { id: string };
}

// ── Run ───────────────────────────────────────────────────────────────
console.log(`\nPayPal environment: ${env} (${apiBase})`);
console.log(`Plan from src/lib/billing/plans.ts: ${plan.name} — $${plan.priceUsd}/month, ${plan.generations} generations\n`);

if (dryRun) {
  console.log("--dry-run: nothing was sent to PayPal.\n");
  console.log("POST /v1/catalogs/products");
  console.log(JSON.stringify(productBody, null, 2));
  console.log("\nPOST /v1/billing/plans");
  console.log(JSON.stringify(planBody("<product id from the call above>"), null, 2));
  process.exit(0);
}

const token = await getAccessToken();

// Reuse an existing product if one was passed in, so re-running only ever
// adds a plan (e.g. when changing the price).
let productId = process.env.PAYPAL_PRODUCT_ID;
if (productId) {
  console.log(`✓ Reusing product   ${productId}`);
} else {
  const product = await post("/v1/catalogs/products", token, productBody, "product");
  productId = product.id;
  console.log(`✓ Created product   ${productId}`);
}

const created = await post("/v1/billing/plans", token, planBody(productId), "plan");
console.log(`✓ Created plan      ${created.id}`);

console.log(`\nAdd this to .env.local and restart the dev server:\n`);
console.log(`PAYPAL_PLAN_ID_PRO=${created.id}`);
console.log(`\n(Product id, if you want to add more plans later: PAYPAL_PRODUCT_ID=${productId})\n`);
