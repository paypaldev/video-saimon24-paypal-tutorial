import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Quota } from "@/lib/billing/quota";

/**
 * Usage meter in the app shell. Turns amber at the limit and links to
 * pricing (the upgrade CTA lives there until PayPal lands in Phase 2).
 */
export function UsagePill({ quota }: { quota: Quota }) {
  const atLimit = quota.remaining === 0;

  return (
    <Link
      href="/pricing"
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors",
        atLimit
          ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
      )}
      title={atLimit ? "You have used all your generations" : "Your usage"}
    >
      {quota.used} / {quota.limit} generations
    </Link>
  );
}
