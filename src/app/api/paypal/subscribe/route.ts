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
 *
 * An account that is already Pro is refused: a second approved subscription
 * would bill the buyer twice and overwrite `paypal_subscription_id`, orphaning
 * the first one. The billing page hides the button for Pro accounts, but this
 * route is what actually enforces it.
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

  const { data: profile } = await supabase.from("profiles").select("plan").single();
  if (!profile) {
    return fail(401, "unauthorized", "No profile found for this account.");
  }
  if (profile.plan === "pro") {
    return fail(409, "already_subscribed", "This account already has an active Pro subscription.");
  }

  const subscription = await createSubscription(config, user.id);
  if (!subscription) {
    return fail(502, "provider_error", "PayPal could not start the checkout. Please try again.");
  }

  return ok({ subscriptionId: subscription.id });
}
