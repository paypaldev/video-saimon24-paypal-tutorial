import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PlanShape = {
  name: string;
  priceUsd: number;
  tagline: string;
  features: readonly string[];
};

/**
 * One plan column. Shared by /pricing and /app/billing so the two pages can
 * never drift apart — the CTA is passed in as children because that is the
 * only part that differs.
 */
export function PlanCard({
  plan,
  highlighted = false,
  badge,
  period = "month",
  children,
}: {
  plan: PlanShape;
  highlighted?: boolean;
  badge?: string;
  period?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn(highlighted && "border-primary/50")}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{plan.name}</CardTitle>
          {badge ? <Badge>{badge}</Badge> : null}
        </div>
        <CardDescription>{plan.tagline}</CardDescription>
        <p className="text-3xl font-bold">
          ${plan.priceUsd}
          <span className="text-sm font-normal text-muted-foreground">/{period}</span>
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="flex flex-col gap-2 text-sm">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="size-4 text-success" />
              {feature}
            </li>
          ))}
        </ul>
        <div className="mt-auto">{children}</div>
      </CardContent>
    </Card>
  );
}
