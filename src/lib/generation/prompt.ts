import type { StyleJson } from "@/lib/style/schema";

export type BuildPromptInput = {
  title: string;
  description?: string | null;
  style: StyleJson;
};

/**
 * Pure function that turns title + description + style JSON into the final
 * prompt sent to the image model. Unknown keys the user invents are folded
 * into "Style directives" automatically.
 */
export function buildPrompt({ title, description, style }: BuildPromptInput): string {
  const lines: string[] = [];

  lines.push(`Generate a single game asset image: ${title.trim()}.`);

  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    lines.push(`Details: ${trimmedDescription}`);
  }

  const artDirection = style.art_direction;
  if (typeof artDirection === "string" && artDirection.trim()) {
    lines.push(`Art direction: ${artDirection.trim()}`);
  }

  const directives = Object.entries(style)
    .filter(([key]) => !["version", "prompt_hints", "art_direction"].includes(key))
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
      return `${key}: ${String(value)}`;
    });
  if (directives.length > 0) {
    lines.push(`Style directives: ${directives.join(", ")}`);
  }

  const hints = style.prompt_hints ?? [];
  if (hints.length > 0) {
    lines.push(`Additional notes: ${hints.join("; ")}`);
  }

  lines.push(
    "Output a single standalone asset image on a transparent background. No text or watermarks.",
  );

  return lines.join("\n");
}
