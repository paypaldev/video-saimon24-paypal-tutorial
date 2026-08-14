import { ImagePlus } from "lucide-react";
import { AssetCard, type AssetCardData } from "@/components/assets/asset-card";
import { ButtonLink } from "@/components/ui/button";

export function AssetGrid({ assets }: { assets: AssetCardData[] }) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center">
        <ImagePlus className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">No assets yet</p>
          <p className="text-sm text-muted-foreground">
            Generate your first game asset — it takes about 20 seconds.
          </p>
        </div>
        <ButtonLink href="/app/new">New asset</ButtonLink>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => (
        <AssetCard key={asset.id} asset={asset} />
      ))}
    </div>
  );
}
