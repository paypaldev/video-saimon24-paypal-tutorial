import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPaypalConfig } from "@/lib/paypal/config";
import { getSubscription } from "@/lib/paypal/api";
import { activatePlan } from "@/lib/billing/activate";
import { ok, fail } from "@/lib/http";

/**
 * Called by the checkout button right after the buyer approves, so the account
 * flips to Pro immediately instead of waiting on webhook delivery (which does
 * not reach localhost at all without a tunnel).
 *
 * This does not trust the client: the subscription id is looked up against
 * PayPal, and it only activates if PayPal says the subscription is ACTIVE, is
 * on our plan, and carries this user's id in `custom_id`. The webhook remains
 * the source of truth for renewals and cancellations.
 */

const bodySchema = z.object({ subscriptionId: z.string().min(1).max(64) });

export async function POST(request: Request) {
  const config = getPaypalConfig();
  if (!config) {
    return fail(503, "billing_unavailable", "PayPal is not configured on this deployment.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "You must be signed in to upgrade.");
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail(422, "invalid_input", "Request body must be JSON.");
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) {
    return fail(422, "invalid_input", "A subscription id is required.");
  }

  // Already activated with this exact subscription (by an earlier confirm or
  // the webhook): do nothing. activatePlan() zeroes generations_used, so
  // replaying this request would otherwise be a free usage reset.
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, paypal_subscription_id")
    .single();
  if (
    profile?.plan === "pro" &&
    profile.paypal_subscription_id === body.data.subscriptionId
  ) {
    return ok({ status: "active" });
  }

  const subscription = await getSubscription(config, body.data.subscriptionId);
  if (!subscription) {
    return fail(404, "not_found", "That subscription could not be found at PayPal.");
  }

  // custom_id is set at checkout and is the only trustworthy link back to an
  // account. Without this check, anyone could claim any subscription id.
  if (subscription.customId !== user.id) {
    return fail(403, "unauthorized", "That subscription belongs to another account.");
  }
  if (subscription.planId && subscription.planId !== config.planId) {
    return fail(403, "unauthorized", "That subscription is not for this plan.");
  }

  if (subscription.status !== "ACTIVE") {
    // APPROVAL_PENDING / APPROVED — PayPal has not started it yet. The webhook
    // will finish the job when it does.
    return ok({ status: "pending" });
  }

  const activated = await activatePlan({
    userId: user.id,
    // The SDK types `id` as optional; PayPal always returns it, and we
    // looked the subscription up by that id in the first place.
    subscriptionId: subscription.id ?? body.data.subscriptionId,
    renewsAt: subscription.billingInfo?.nextBillingTime ?? null,
  });
  if (!activated) {
    return fail(500, "storage_error", "Your payment went through but the upgrade failed to save.");
  }

  revalidatePath("/app", "layout");
  return ok({ status: "active" });
}
