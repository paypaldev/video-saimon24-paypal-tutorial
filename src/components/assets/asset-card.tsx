import Link from "next/link";
import Image from "next/image";
import { formatRelativeDate } from "@/lib/dates";

export type AssetCardData = {
  id: string;
  title: string;
  createdAt: string;
  imageUrl: string | null;
};

export function AssetCard({ asset }: { asset: AssetCardData }) {
  return (
    <Link
      href={`/app/assets/${asset.id}`}
      className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
    >
      <div className="relative aspect-square bg-muted/40">
        {asset.imageUrl ? (
          <Image
            src={asset.imageUrl}
            alt={asset.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-3 transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Image unavailable
          </div>
        )}
      </div>
      <div className="border-t border-border px-3 py-2">
        <p className="truncate text-sm font-medium">{asset.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeDate(asset.createdAt)}
        </p>
      </div>
    </Link>
  );
}
