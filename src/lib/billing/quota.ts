import { PLANS, isPlanId, type PlanId } from "@/lib/billing/plans";

export type Quota = {
  used: number;
  limit: number;
  remaining: number;
  plan: PlanId;
};

/**
 * The only thing the UI and the generate route consult for quota.
 * Nothing outside lib/billing hardcodes a generation limit.
 */
export function getQuota(profile: {
  plan: string;
  generations_used: number;
}): Quota {
  const planId: PlanId = isPlanId(profile.plan) ? profile.plan : "free";
  const limit = PLANS[planId].generations;
  const used = profile.generations_used;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    plan: planId,
  };
}
