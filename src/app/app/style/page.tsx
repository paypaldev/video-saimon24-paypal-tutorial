import type { Metadata } from "next";
import { getProfile } from "@/lib/assets/queries";
import { DEFAULT_STYLE_JSON } from "@/lib/style/default";
import { StyleEditor } from "@/components/style/style-editor";

export const metadata: Metadata = { title: "Style — Asset Forge" };

export default async function StylePage() {
  const profile = await getProfile();
  const style = profile?.style_json ?? DEFAULT_STYLE_JSON;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Style</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        This JSON is folded into every prompt. Any key you add becomes a style
        directive — try{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          &quot;mood&quot;: &quot;cursed and dripping&quot;
        </code>{" "}
        and regenerate an asset.
      </p>
      <StyleEditor initialJson={JSON.stringify(style, null, 2)} />
    </div>
  );
}
