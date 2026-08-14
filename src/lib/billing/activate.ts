import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The only place a plan is ever written.
 *
 * Both callers (the PayPal webhook and the post-approval confirm route) have
 * already verified the subscription against PayPal before getting here, so
 * these functions do no trust checks of their own.
 *
 * Uses the service-role client: `profiles.plan`, `plan_renews_at`,
 * `generations_used` and `paypal_subscription_id` are blocked for the
 * `authenticated` role by the guard trigger in 0002_quota.sql.
 */

/** Subscription started (or restarted): upgrade to Pro and reset the counter. */
export async function activatePlan(params: {
  userId: string;
  subscriptionId: string;
  renewsAt: string | null;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      plan: "pro",
      paypal_subscription_id: params.subscriptionId,
      plan_renews_at: params.renewsAt,
      generations_used: 0,
    })
    .eq("id", params.userId);

  if (error) {
    console.error("[billing] activatePlan failed", error.message);
    return false;
  }
  return true;
}

/** Recurring payment cleared: keep Pro, reset usage, roll the renewal date. */
export async function renewPlan(params: {
  subscriptionId: string;
  renewsAt: string | null;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      plan: "pro",
      plan_renews_at: params.renewsAt,
      generations_used: 0,
    })
    .eq("paypal_subscription_id", params.subscriptionId);

  if (error) {
    console.error("[billing] renewPlan failed", error.message);
    return false;
  }
  return true;
}

/**
 * Cancelled / expired / suspended: back to Free. Assets are never deleted,
 * and `paypal_subscription_id` is kept so the row still points at the PayPal
 * subscription it came from.
 */
export async function deactivatePlan(params: {
  subscriptionId: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ plan: "free", plan_renews_at: null })
    .eq("paypal_subscription_id", params.subscriptionId);

  if (error) {
    console.error("[billing] deactivatePlan failed", error.message);
    return false;
  }
  return true;
}
