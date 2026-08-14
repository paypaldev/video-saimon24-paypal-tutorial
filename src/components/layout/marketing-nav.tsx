import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export function MarketingNav() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="text-base font-bold tracking-tight">
          Asset<span className="text-primary">Forge</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/pricing" className="transition-colors hover:text-foreground">
            Pricing
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink variant="ghost" size="sm" href="/login">
            Sign in
          </ButtonLink>
          <ButtonLink size="sm" href="/signup">
            Get started
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
