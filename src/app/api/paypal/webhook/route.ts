import { z } from "zod";
import { getPaypalConfig } from "@/lib/paypal/config";
import { getSubscription, verifyWebhookSignature } from "@/lib/paypal/api";
import { activatePlan, deactivatePlan, renewPlan } from "@/lib/billing/activate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

/**
 * PayPal subscription webhook.
 *
 * Three things make this safe rather than a demo:
 *  1. the raw body is read before parsing and the delivery is signature-verified;
 *  2. every event is written to `webhook_events` first — a duplicate event id
 *     hits the unique constraint and the handler exits without re-applying;
 *  3. the account is resolved from `custom_id` (which we set at checkout) or
 *     from `paypal_subscription_id`, never from anything the payload claims
 *     about the user.
 */

const UNIQUE_VIOLATION = "23505";

const eventSchema = z.object({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource: z
    .object({
      id: z.string().optional(),
      custom_id: z.string().optional(),
      custom: z.string().optional(),
      billing_agreement_id: z.string().optional(),
      billing_info: z.object({ next_billing_time: z.string().optional() }).optional(),
    })
    .optional(),
});

type PaypalEvent = z.infer<typeof eventSchema>;

export async function POST(request: Request) {
  const config = getPaypalConfig();
  if (!config) {
    // Nothing to verify against — treat as not enabled rather than pretend.
    return new Response("PayPal is not configured", { status: 503 });
  }

  // 1. Raw body first: signature verification needs the exact bytes.
  const rawBody = await request.text();

  const verified = await verifyWebhookSignature(config, request.headers, rawBody).catch(
    () => false,
  );
  if (!verified) {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Malformed webhook body", { status: 400 });
  }

  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) {
    // Verified but unrecognisable: 200 so PayPal stops retrying it.
    return new Response("Ignored", { status: 200 });
  }
  const event = parsed.data;

  // 2. Idempotency: claim the event id, or bail out if it is a replay.
  const admin = createAdminClient();
  const { error: insertError } = await admin.from("webhook_events").insert({
    provider: "paypal",
    event_id: event.id,
    event_type: event.event_type,
    payload: payload as Json,
  });
  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      return new Response("Duplicate event ignored", { status: 200 });
    }
    // Could not record it — 500 makes PayPal retry, which is what we want.
    console.error("[paypal] could not record event", insertError.message);
    return new Response("Could not record event", { status: 500 });
  }

  // 3. Dispatch.
  try {
    await handleEvent(event);
  } catch (error) {
    console.error("[paypal] handler failed", error);
    // Release the claim so PayPal's retry is processed instead of deduped.
    await admin.from("webhook_events").delete().eq("event_id", event.id);
    return new Response("Handler failed", { status: 500 });
  }

  await admin
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", event.id);

  return new Response("OK", { status: 200 });
}

async function handleEvent(event: PaypalEvent): Promise<void> {
  const config = getPaypalConfig();
  if (!config) return;
  const resource = event.resource ?? {};

  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.ACTIVATED": {
      const subscriptionId = resource.id;
      if (!subscriptionId) return;

      // custom_id is the user id we attached at checkout. If PayPal omitted it
      // from the event, read it back from the subscription itself.
      let userId = resource.custom_id;
      let renewsAt = resource.billing_info?.next_billing_time ?? null;
      if (!userId || !renewsAt) {
        const subscription = await getSubscription(config, subscriptionId);
        userId = userId ?? subscription?.custom_id;
        renewsAt = renewsAt ?? subscription?.billing_info?.next_billing_time ?? null;
      }
      if (!userId) {
        console.error("[paypal] activated event without custom_id", subscriptionId);
        return;
      }

      // Throwing releases the idempotency claim and returns a 500, so PayPal
      // retries — the alternative is a paid subscription on a Free account.
      if (!(await activatePlan({ userId, subscriptionId, renewsAt }))) {
        throw new Error(`activatePlan failed for subscription ${subscriptionId}`);
      }
      return;
    }

    case "PAYMENT.SALE.COMPLETED": {
      // A renewal payment. `billing_agreement_id` is the subscription id.
      const subscriptionId = resource.billing_agreement_id;
      if (!subscriptionId) return; // A one-off sale, not a subscription charge.

      const subscription = await getSubscription(config, subscriptionId);
      const renewed = await renewPlan({
        subscriptionId,
        renewsAt: subscription?.billing_info?.next_billing_time ?? null,
      });
      if (!renewed) {
        throw new Error(`renewPlan failed for subscription ${subscriptionId}`);
      }
      return;
    }

    case "BILLING.SUBSCRIPTION.CANCELLED":
    case "BILLING.SUBSCRIPTION.EXPIRED":
    case "BILLING.SUBSCRIPTION.SUSPENDED": {
      const subscriptionId = resource.id;
      if (!subscriptionId) return;
      if (!(await deactivatePlan({ subscriptionId }))) {
        throw new Error(`deactivatePlan failed for subscription ${subscriptionId}`);
      }
      return;
    }

    default:
      // Anything else is acknowledged and ignored.
      return;
  }
}
