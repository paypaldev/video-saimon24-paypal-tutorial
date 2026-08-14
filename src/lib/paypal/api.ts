import "server-only";
import type { PaypalConfig } from "@/lib/paypal/config";

/**
 * Thin REST client for the three PayPal calls this app makes:
 * an OAuth token, a webhook signature verification, and a subscription read.
 * No SDK dependency — same approach as lib/generation/openai.ts.
 */

const TIMEOUT_MS = 15_000;

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

async function paypalFetch(
  config: PaypalConfig,
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<Response> {
  const { accessToken, ...rest } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${config.apiBase}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...rest.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Client-credentials token, cached in memory until a minute before it expires. */
export async function getAccessToken(config: PaypalConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
    "base64",
  );
  const response = await paypalFetch(config, "/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    // Never echo the response body — it can contain the client id/secret.
    throw new Error(`PayPal auth failed (${response.status})`);
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("PayPal auth returned no access token");
  }

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + Math.max(0, (json.expires_in ?? 300) - 60) * 1000,
  };
  return cachedToken.value;
}

const SIGNATURE_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

/**
 * Verifies a webhook delivery against PayPal.
 *
 * `rawBody` must be the exact bytes PayPal signed — that is why the route
 * reads `request.text()` before parsing. The verification payload is
 * assembled by string concatenation so the event is forwarded byte-for-byte;
 * `JSON.stringify(JSON.parse(body))` would re-order keys and re-encode
 * numbers, and the signature would no longer match.
 */
export async function verifyWebhookSignature(
  config: PaypalConfig,
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const values: Record<string, string> = {};
  for (const header of SIGNATURE_HEADERS) {
    const value = headers.get(header);
    if (!value) return false; // A genuine delivery always carries all five.
    values[header] = value;
  }

  const verificationBody =
    "{" +
    [
      `"auth_algo":${JSON.stringify(values["paypal-auth-algo"])}`,
      `"cert_url":${JSON.stringify(values["paypal-cert-url"])}`,
      `"transmission_id":${JSON.stringify(values["paypal-transmission-id"])}`,
      `"transmission_sig":${JSON.stringify(values["paypal-transmission-sig"])}`,
      `"transmission_time":${JSON.stringify(values["paypal-transmission-time"])}`,
      `"webhook_id":${JSON.stringify(config.webhookId)}`,
      `"webhook_event":${rawBody}`,
    ].join(",") +
    "}";

  const accessToken = await getAccessToken(config);
  const response = await paypalFetch(config, "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    accessToken,
    body: verificationBody,
  });

  if (!response.ok) return false;
  const json = (await response.json()) as { verification_status?: string };
  return json.verification_status === "SUCCESS";
}

export type PaypalSubscription = {
  id: string;
  status: string;
  plan_id?: string;
  custom_id?: string;
  billing_info?: { next_billing_time?: string };
};

/** Reads a subscription. Returns null if PayPal does not know it. */
export async function getSubscription(
  config: PaypalConfig,
  subscriptionId: string,
): Promise<PaypalSubscription | null> {
  const accessToken = await getAccessToken(config);
  const response = await paypalFetch(
    config,
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET", accessToken },
  );
  if (!response.ok) return null;
  return (await response.json()) as PaypalSubscription;
}

/** Where a subscriber manages or cancels their own subscription. */
export function subscriptionManagementUrl(env: "sandbox" | "live"): string {
  return env === "live"
    ? "https://www.paypal.com/myaccount/autopay/"
    : "https://www.sandbox.paypal.com/myaccount/autopay/";
}
