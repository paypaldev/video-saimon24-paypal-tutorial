import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/assets/queries";
import { getQuota } from "@/lib/billing/quota";
import { AppNav } from "@/components/layout/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const profile = await getProfile();
  const quota = getQuota(profile ?? { plan: "free", generations_used: 0 });

  return (
    <div className="min-h-screen">
      <AppNav quota={quota} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
