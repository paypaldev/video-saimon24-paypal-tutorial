import { createClient } from "@/lib/supabase/server";
import { getPaypalConfig } from "@/lib/paypal/config";
import { createSubscription } from "@/lib/paypal/api";
import { ok, fail } from "@/lib/http";

/**
 * Creates the PayPal subscription the Web SDK v6 checkout is started with.
 *
 * v6 hands `session.start()` a promise that resolves to a subscription id, so
 * the subscription is created here instead of in the browser. That moves two
 * things server-side that the v5 button used to send from the client: the plan
 * id, and the `custom_id` that links the subscription back to an account.
 *
 * The buyer has not approved anything at this point — an unapproved
 * subscription sits in APPROVAL_PENDING and expires on its own, so an
 * abandoned checkout costs nothing. /api/paypal/confirm and the webhook still
 * re-read the subscription from PayPal before any plan is written.
 */
export async function POST() {
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

  const subscription = await createSubscription(config, user.id);
  if (!subscription) {
    return fail(502, "provider_error", "PayPal could not start the checkout. Please try again.");
  }

  return ok({ subscriptionId: subscription.id });
}
