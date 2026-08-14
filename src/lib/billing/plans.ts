export const PLANS = {
  free: { id: "free", name: "Free", generations: 5, priceUsd: 0, paypalPlanId: null },
  pro: {
    id: "pro",
    name: "Pro",
    generations: 200,
    priceUsd: 12,
    paypalPlanId: process.env.PAYPAL_PLAN_ID_PRO ?? null,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}
