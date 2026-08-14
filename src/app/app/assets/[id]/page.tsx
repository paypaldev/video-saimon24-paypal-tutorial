import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Download } from "lucide-react";
import { getAsset } from "@/lib/assets/queries";
import { createClient } from "@/lib/supabase/server";
import { createSignedUrl } from "@/lib/storage";
import { formatRelativeDate } from "@/lib/dates";
import { DeleteAssetDialog } from "@/components/assets/delete-asset-dialog";
import { ButtonAnchor } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Asset — Asset Forge" };

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) notFound();

  const supabase = await createClient();
  const [imageUrl, downloadUrl] = await Promise.all([
    createSignedUrl(supabase, asset.storage_path),
    createSignedUrl(supabase, asset.storage_path, {
      download: `${asset.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "asset"}.png`,
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/app"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{asset.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated {formatRelativeDate(asset.created_at)}
            {" · "}
            <Badge variant="secondary">{asset.model}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          {downloadUrl ? (
            <ButtonAnchor href={downloadUrl}>
              <Download className="size-4" />
              Download
            </ButtonAnchor>
          ) : null}
          <DeleteAssetDialog assetId={asset.id} />
        </div>
      </div>

      <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:24px_24px]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={asset.title}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-contain"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Image unavailable
          </div>
        )}
      </div>

      {asset.description ? (
        <p className="text-sm text-muted-foreground">{asset.description}</p>
      ) : null}

      <details className="group rounded-xl border border-border bg-card">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Prompt used
        </summary>
        <pre className="overflow-x-auto border-t border-border px-4 py-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
          {asset.prompt}
        </pre>
      </details>

      <details className="group rounded-xl border border-border bg-card">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Style used
        </summary>
        <pre className="overflow-x-auto border-t border-border px-4 py-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
          {JSON.stringify(asset.style_json, null, 2)}
        </pre>
      </details>
    </div>
  );
}
