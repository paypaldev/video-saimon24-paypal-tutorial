import type { Metadata } from "next";
import { MarketingNav } from "@/components/layout/marketing-nav";
import { PlanCard } from "@/components/billing/plan-card";
import { PLANS } from "@/lib/billing/plans";
import { getPaypalConfig } from "@/lib/paypal/config";
import { getUser } from "@/lib/auth/session";
import { Button, ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Pricing — Asset Forge" };

export default async function PricingPage() {
  // When PayPal is not configured, the Pro plan stays a "Coming soon" — never
  // a checkout button that leads nowhere.
  const checkoutEnabled = getPaypalConfig() !== null;
  const user = await getUser();

  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-center text-3xl font-bold tracking-tight">Simple pricing</h1>
        <p className="mt-2 mb-10 text-center text-muted-foreground">
          Start free. Upgrade when your library outgrows it.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          <PlanCard plan={PLANS.free} period="forever">
            <ButtonLink variant="outline" className="w-full" href={user ? "/app" : "/signup"}>
              {user ? "Go to your library" : "Get started"}
            </ButtonLink>
          </PlanCard>

          <PlanCard
            plan={PLANS.pro}
            highlighted
            badge={checkoutEnabled ? "Most popular" : "Coming soon"}
          >
            {checkoutEnabled ? (
              // /app/billing is guarded, so a signed-out visitor is sent
              // through login and lands straight back on checkout.
              <ButtonLink className="w-full" href="/app/billing">
                Upgrade to Pro
              </ButtonLink>
            ) : (
              <Button className="w-full" disabled>
                Coming soon
              </Button>
            )}
          </PlanCard>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Subscriptions are billed monthly through PayPal and can be cancelled at any time.
          Generated assets stay in your library after a downgrade.
        </p>
      </main>
    </div>
  );
}
