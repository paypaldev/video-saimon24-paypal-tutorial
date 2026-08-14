import "server-only";
import { clientEnv } from "@/lib/env/client";
import { serverEnv } from "@/lib/env/server";

const API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

export type PaypalConfig = {
  env: "sandbox" | "live";
  apiBase: string;
  clientId: string;
  clientSecret: string;
  planId: string;
  webhookId: string;
};

/**
 * Returns the PayPal config only when *every* piece is present, so the rest of
 * the app can branch on a single value: configured → real checkout, not
 * configured → "Coming soon". Nothing throws at import time.
 */
export function getPaypalConfig(): PaypalConfig | null {
  const clientId = clientEnv.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const { PAYPAL_CLIENT_SECRET, PAYPAL_PLAN_ID_PRO, PAYPAL_WEBHOOK_ID, PAYPAL_ENV } =
    serverEnv;

  if (!clientId || !PAYPAL_CLIENT_SECRET || !PAYPAL_PLAN_ID_PRO || !PAYPAL_WEBHOOK_ID) {
    return null;
  }
  // The webhook is the only path that writes a plan, and it needs the service
  // role. Without it, checkout would take money and never upgrade the account.
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return {
    env: PAYPAL_ENV,
    apiBase: API_BASE[PAYPAL_ENV],
    clientId,
    clientSecret: PAYPAL_CLIENT_SECRET,
    planId: PAYPAL_PLAN_ID_PRO,
    webhookId: PAYPAL_WEBHOOK_ID,
  };
}

/** Which PayPal env vars are still missing — used for the setup hint in the UI. */
export function missingPaypalEnvVars(): string[] {
  const missing: string[] = [];
  if (!clientEnv.NEXT_PUBLIC_PAYPAL_CLIENT_ID) missing.push("NEXT_PUBLIC_PAYPAL_CLIENT_ID");
  if (!serverEnv.PAYPAL_CLIENT_SECRET) missing.push("PAYPAL_CLIENT_SECRET");
  if (!serverEnv.PAYPAL_PLAN_ID_PRO) missing.push("PAYPAL_PLAN_ID_PRO");
  if (!serverEnv.PAYPAL_WEBHOOK_ID) missing.push("PAYPAL_WEBHOOK_ID");
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}
