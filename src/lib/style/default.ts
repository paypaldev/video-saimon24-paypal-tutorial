import type { StyleJson } from "@/lib/style/schema";

export const DEFAULT_STYLE_JSON: StyleJson = {
  version: 1,
  art_direction: "stylized hand-painted fantasy game icon",
  composition: "single object centered, clean silhouette, 3/4 view",
  lighting: "soft painterly shading with warm highlights",
  palette: "vibrant saturated fantasy colors",
  detail: "high",
  background: "transparent",
  prompt_hints: [
    "polished mobile-game quality art",
    "no text, no watermark, no border",
    "consistent scale and framing across assets",
  ],
};
