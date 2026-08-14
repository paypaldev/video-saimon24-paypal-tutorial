import "server-only";
import { z } from "zod";

/**
 * Treats an unset var and an empty one (`PAYPAL_WEBHOOK_ID=` in .env.local)
 * the same, so a half-filled env file degrades to "PayPal not configured"
 * instead of crashing the app at import time.
 */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_IMAGE_MODEL: z.string().min(1).default("gpt-image-1"),
  APP_URL: z.url(),

  // ── Billing (optional) ───────────────────────────────────────────
  // The app runs fine without these; /app/billing simply shows the Pro plan
  // as "Coming soon" until all of them are set. See lib/paypal/config.ts.
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  PAYPAL_PLAN_ID_PRO: optionalString,
  PAYPAL_WEBHOOK_ID: optionalString,
  PAYPAL_ENV: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.enum(["sandbox", "live"]).optional(),
    )
    .transform((value) => value ?? "sandbox"),
});

const parsed = serverEnvSchema.safeParse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
  APP_URL: process.env.APP_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_PLAN_ID_PRO: process.env.PAYPAL_PLAN_ID_PRO,
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
  PAYPAL_ENV: process.env.PAYPAL_ENV,
});

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid or missing server env vars: ${missing}`);
}

export const serverEnv = parsed.data;
