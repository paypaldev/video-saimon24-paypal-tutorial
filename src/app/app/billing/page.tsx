import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/assets/queries";
import { getQuota } from "@/lib/billing/quota";
import { PLANS } from "@/lib/billing/plans";
import { getPaypalConfig, missingPaypalEnvVars } from "@/lib/paypal/config";
import { subscriptionManagementUrl } from "@/lib/paypal/api";
import { PlanCard } from "@/components/billing/plan-card";
import { PaypalSubscribeButton } from "@/components/billing/paypal-subscribe-button";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";

export const metadata: Metadata = { title: "Billing — Asset Forge" };

const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function BillingPage() {
  // Gates the page; the id is no longer needed here — checkout derives it server-side.
  await requireUser();
  const profile = await getProfile();
  const quota = getQuota(profile ?? { plan: "free", generations_used: 0 });

  const config = getPaypalConfig();
  const isPro = quota.plan === "pro";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Your plan, your usage, and where to change them.
        </p>
      </div>

      {/* ── Current plan ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Current plan</CardTitle>
            <Badge>{PLANS[quota.plan].name}</Badge>
          </div>
          <CardDescription>
            {isPro && profile?.plan_renews_at
              ? `Renews on ${dateFormatter.format(new Date(profile.plan_renews_at))}.`
              : `${PLANS[quota.plan].generations} generations included.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={Math.min(quota.used, quota.limit)} max={quota.limit}>
            <ProgressLabel>Generations used</ProgressLabel>
            <ProgressValue>{`${quota.used} / ${quota.limit}`}</ProgressValue>
          </Progress>
          <p className="text-xs text-muted-foreground">
            {quota.remaining > 0
              ? `${quota.remaining} left in this period. Deleting an asset does not give a generation back — the image was already paid for.`
              : "You have used every generation in this period."}
          </p>

          {isPro && config ? (
            <ButtonAnchor
              variant="outline"
              size="sm"
              className="self-start"
              href={subscriptionManagementUrl(config.env)}
              target="_blank"
              rel="noreferrer noopener"
            >
              Manage subscription on PayPal
              <ExternalLink className="size-3.5" />
            </ButtonAnchor>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Plans ──────────────────────────────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2">
        <PlanCard plan={PLANS.free} period="forever" badge={isPro ? undefined : "Current"}>
          <ButtonLink variant="outline" className="w-full" href="/app/new">
            New asset
          </ButtonLink>
        </PlanCard>

        <PlanCard plan={PLANS.pro} highlighted badge={isPro ? "Current" : undefined}>
          {isPro ? (
            <Button className="w-full" disabled>
              You&apos;re on Pro
            </Button>
          ) : config ? (
            <PaypalSubscribeButton clientId={config.clientId} env={config.env} />
          ) : (
            <Button className="w-full" disabled>
              Coming soon
            </Button>
          )}
        </PlanCard>
      </div>

      {!config && process.env.NODE_ENV !== "production" ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-warning">Checkout is disabled.</span> Set{" "}
          <code className="font-mono">{missingPaypalEnvVars().join(", ")}</code> in{" "}
          <code className="font-mono">.env.local</code> and restart the dev server — see the
          PayPal section of the README.
        </p>
      ) : null}

      {config?.env === "sandbox" ? (
        <p className="text-xs text-muted-foreground">
          PayPal is running in <span className="font-medium">sandbox</span> mode — use a sandbox
          buyer account to test. No real money moves.
        </p>
      ) : null}
    </div>
  );
}
