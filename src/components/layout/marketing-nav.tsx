import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/user-menu";
import { getUser } from "@/lib/auth/session";

function avatarUrlFromMetadata(metadata: Record<string, unknown> | undefined) {
  const url = metadata?.avatar_url ?? metadata?.picture;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

export async function MarketingNav() {
  const user = await getUser();

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
          {user ? (
            <UserMenu
              email={user.email ?? ""}
              avatarUrl={avatarUrlFromMetadata(user.user_metadata)}
            />
          ) : (
            <>
              <ButtonLink variant="ghost" size="sm" href="/login">
                Sign in
              </ButtonLink>
              <ButtonLink size="sm" href="/signup">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
