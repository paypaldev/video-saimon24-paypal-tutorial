export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    generations: 5,
    priceUsd: 0,
    paypalPlanId: null,
    tagline: "For trying the loop end to end.",
    features: [
      "5 generations",
      "Your own style JSON",
      "Private asset library",
      "Transparent PNG downloads",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    generations: 200,
    priceUsd: 12,
    // Checkout reads the validated config from lib/paypal/config.ts, which
    // also requires the secret and webhook id. This is here so anything that
    // only needs the plan id can read it from the plan.
    paypalPlanId: process.env.PAYPAL_PLAN_ID_PRO ?? null,
    tagline: "For shipping a real game.",
    features: [
      "200 generations per month",
      "Everything in Free",
      "Usage resets every billing period",
      "Cancel anytime from PayPal",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanId];

export function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}
