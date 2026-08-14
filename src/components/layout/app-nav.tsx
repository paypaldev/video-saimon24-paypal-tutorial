import Link from "next/link";
import { LogOut } from "lucide-react";
import { UsagePill } from "@/components/layout/usage-pill";
import { Button } from "@/components/ui/button";
import type { Quota } from "@/lib/billing/quota";

export function AppNav({ quota }: { quota: Quota }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/app" className="text-base font-bold tracking-tight">
          Asset<span className="text-primary">Forge</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/app" className="transition-colors hover:text-foreground">
            Library
          </Link>
          <Link
            href="/app/style"
            className="transition-colors hover:text-foreground"
          >
            Style
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <UsagePill quota={quota} />
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="sm" type="submit" title="Sign out">
              <LogOut className="size-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
