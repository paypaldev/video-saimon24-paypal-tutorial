import "server-only";
import {
  ApiError,
  Client,
  Environment,
  SubscriptionsController,
  type OAuthToken,
  type Subscription,
} from "@paypal/paypal-server-sdk";
import type { PaypalConfig } from "@/lib/paypal/config";

/**
 * PayPal access, via PayPal's official server SDK.
 *
 * The SDK covers three of the four calls this app makes — the OAuth token
 * (handled internally), creating a subscription, and reading one back. It has
 * no webhooks controller, so `verifyWebhookSignature` is still a hand-rolled
 * request; it borrows the SDK's token manager rather than keeping a second
 * copy of the credential handling.
 */

const TIMEOUT_MS = 15_000;

/** One client per process. Config is fixed for the lifetime of the server. */
let client: Client | null = null;

function getClient(config: PaypalConfig): Client {
  if (!client) {
    client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: config.clientId,
        oAuthClientSecret: config.clientSecret,
      },
      environment: config.env === "live" ? Environment.Production : Environment.Sandbox,
      timeout: TIMEOUT_MS,
    });
  }
  return client;
}

function getSubscriptionsController(config: PaypalConfig): SubscriptionsController {
  return new SubscriptionsController(getClient(config));
}

/**
 * A bearer token for the one endpoint the SDK does not model. Token fetching,
 * expiry and clock skew are the SDK's problem, not ours.
 */
let cachedToken: OAuthToken | undefined;

async function getAccessToken(config: PaypalConfig): Promise<string> {
  const manager = getClient(config).clientCredentialsAuthManager;
  if (!manager.isValid(cachedToken) || manager.isExpired(cachedToken)) {
    cachedToken = await manager.fetchToken();
  }
  return cachedToken.accessToken;
}

/**
 * Creates a subscription on our Pro plan for `userId`.
 *
 * Both the plan and the `customId` come from the server: the browser only
 * ever learns the resulting subscription id. That is the whole reason this
 * call is here — under JS SDK v5 the browser chose both, and the confirm route
 * had to catch a mismatch after the fact.
 */
export async function createSubscription(
  config: PaypalConfig,
  userId: string,
): Promise<{ id: string; status: string } | null> {
  try {
    const { result } = await getSubscriptionsController(config).createSubscription({
      body: { planId: config.planId, customId: userId },
    });
    if (!result.id) return null;
    return { id: result.id, status: result.status ?? "APPROVAL_PENDING" };
  } catch (error) {
    // ApiError carries the PayPal response, which can echo plan/merchant
    // detail — log the status only.
    if (error instanceof ApiError) {
      console.error(`[paypal] createSubscription failed (${error.statusCode})`);
    } else {
      console.error("[paypal] createSubscription failed", error);
    }
    return null;
  }
}

export type PaypalSubscription = Subscription;

/** Reads a subscription. Returns null if PayPal does not know it. */
export async function getSubscription(
  config: PaypalConfig,
  subscriptionId: string,
): Promise<PaypalSubscription | null> {
  try {
    const { result } = await getSubscriptionsController(config).getSubscription({
      id: subscriptionId,
    });
    return result;
  } catch {
    return null;
  }
}

const SIGNATURE_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

const API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

/**
 * Verifies a webhook delivery against PayPal.
 *
 * Not available through the server SDK — it models Orders, Payments, Vault,
 * Transaction Search and Subscriptions, but not Notifications — so this stays
 * a direct request.
 *
 * `rawBody` must be the exact bytes PayPal signed, which is why the route
 * reads `request.text()` before parsing, and why the verification payload is
 * assembled by string concatenation: `JSON.stringify(JSON.parse(body))` would
 * re-order keys and re-encode numbers, and the signature would no longer match.
 * That also rules out passing the event through a typed SDK model.
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `${API_BASE[config.env]}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: verificationBody,
      },
    );
    if (!response.ok) return false;
    const json = (await response.json()) as { verification_status?: string };
    return json.verification_status === "SUCCESS";
  } finally {
    clearTimeout(timeout);
  }
}

/** Where a subscriber manages or cancels their own subscription. */
export function subscriptionManagementUrl(env: "sandbox" | "live"): string {
  return env === "live"
    ? "https://www.paypal.com/myaccount/autopay/"
    : "https://www.sandbox.paypal.com/myaccount/autopay/";
}
