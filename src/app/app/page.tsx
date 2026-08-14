import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listAssets } from "@/lib/assets/queries";
import { createClient } from "@/lib/supabase/server";
import { createSignedUrlMap } from "@/lib/storage";
import { AssetGrid } from "@/components/assets/asset-grid";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Library — Asset Forge" };

export default async function LibraryPage() {
  const assets = await listAssets();
  const supabase = await createClient();
  const urlMap = await createSignedUrlMap(
    supabase,
    assets.map((a) => a.storage_path),
  );

  const cards = assets.map((asset) => ({
    id: asset.id,
    title: asset.title,
    createdAt: asset.created_at,
    imageUrl: urlMap[asset.storage_path] ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <ButtonLink href="/app/new">
          <Plus className="size-4" />
          New asset
        </ButtonLink>
      </div>
      <AssetGrid assets={cards} />
    </div>
  );
}
