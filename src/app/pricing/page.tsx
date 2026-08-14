import type { Metadata } from "next";
import { Check } from "lucide-react";
import { MarketingNav } from "@/components/layout/marketing-nav";
import { PLANS } from "@/lib/billing/plans";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Pricing — Asset Forge" };

const FREE_FEATURES = [
  `${PLANS.free.generations} generations`,
  "Your own style JSON",
  "Private asset library",
  "Transparent PNG downloads",
];

const PRO_FEATURES = [
  `${PLANS.pro.generations} generations per month`,
  "Everything in Free",
  "Priority generation",
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-center text-3xl font-bold tracking-tight">
          Simple pricing
        </h1>
        <p className="mt-2 mb-10 text-center text-muted-foreground">
          Start free. Upgrade when your library outgrows it.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{PLANS.free.name}</CardTitle>
              <CardDescription>For trying the loop end to end.</CardDescription>
              <p className="text-3xl font-bold">
                ${PLANS.free.priceUsd}
                <span className="text-sm font-normal text-muted-foreground">
                  /forever
                </span>
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm">
                {FREE_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <ButtonLink
                variant="outline"
                className="mt-auto"
                href="/signup"
              >
                Get started
              </ButtonLink>
            </CardContent>
          </Card>

          <Card className="border-primary/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{PLANS.pro.name}</CardTitle>
                <Badge>Coming soon</Badge>
              </div>
              <CardDescription>For shipping a real game.</CardDescription>
              <p className="text-3xl font-bold">
                ${PLANS.pro.priceUsd}
                <span className="text-sm font-normal text-muted-foreground">
                  /month
                </span>
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button className="mt-auto" disabled>
                Coming soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
