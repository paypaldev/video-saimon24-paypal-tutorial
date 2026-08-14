import type { Metadata } from "next";
import { GenerateForm } from "@/components/assets/generate-form";

export const metadata: Metadata = { title: "New asset — Asset Forge" };

export default function NewAssetPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight">New asset</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Describe the asset. Your style JSON shapes the rest — edit it under{" "}
        <span className="text-foreground">Style</span>.
      </p>
      <GenerateForm />
    </div>
  );
}
