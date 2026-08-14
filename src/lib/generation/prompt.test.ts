import { describe, expect, test } from "bun:test";
import { buildPrompt } from "./prompt";
import { DEFAULT_STYLE_JSON } from "@/lib/style/default";

describe("buildPrompt", () => {
  test("default style produces the full prompt shape", () => {
    const prompt = buildPrompt({
      title: "Health potion",
      description: "A round bottle with glowing red liquid",
      style: DEFAULT_STYLE_JSON,
    });

    expect(prompt).toContain("Generate a single game asset image: Health potion.");
    expect(prompt).toContain("Details: A round bottle with glowing red liquid");
    expect(prompt).toContain("Art direction: stylized hand-painted fantasy game icon");
    expect(prompt).toContain("Style directives:");
    expect(prompt).toContain("composition: single object centered, clean silhouette, 3/4 view");
    expect(prompt).toContain(
      "Additional notes: polished mobile-game quality art; no text, no watermark, no border; consistent scale and framing across assets",
    );
    expect(prompt).toContain(
      "Output a single standalone asset image on a transparent background. No text or watermarks.",
    );
    // version and prompt_hints must not leak into style directives
    expect(prompt).not.toContain("version: 1");
  });

  test("missing description omits the Details line", () => {
    const prompt = buildPrompt({ title: "Iron sword", style: DEFAULT_STYLE_JSON });
    expect(prompt).not.toContain("Details:");
  });

  test("custom user-invented keys are folded into style directives", () => {
    const prompt = buildPrompt({
      title: "Cursed skull",
      style: { mood: "cursed and dripping", glow_intensity: 3, gritty: true },
    });
    expect(prompt).toContain("mood: cursed and dripping");
    expect(prompt).toContain("glow_intensity: 3");
    expect(prompt).toContain("gritty: true");
  });

  test("string-array custom keys are joined with commas", () => {
    const prompt = buildPrompt({
      title: "Shield",
      style: { materials: ["oak", "iron", "leather"] },
    });
    expect(prompt).toContain("materials: oak, iron, leather");
  });

  test("empty style still produces title and output lines", () => {
    const prompt = buildPrompt({ title: "Coin", style: {} });
    expect(prompt.startsWith("Generate a single game asset image: Coin.")).toBe(true);
    expect(prompt).not.toContain("Style directives:");
    expect(prompt).not.toContain("Additional notes:");
  });
});
