import { z } from "zod";

/**
 * Deliberately permissive — the point of the feature is that users can invent
 * their own keys. Anything scalar (or a string array) becomes a prompt directive.
 */
export const styleSchema = z
  .object({ prompt_hints: z.array(z.string()).optional() })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]));

export type StyleJson = z.infer<typeof styleSchema>;

export const MAX_STYLE_BYTES = 8 * 1024;

export type StyleParseResult =
  | { ok: true; value: StyleJson }
  | { ok: false; error: string };

/** Full validation: JSON parse → plain object → ≤ 8 KB → schema. */
export function parseStyleJson(raw: string): StyleParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Style must be a JSON object." };
  }
  if (new TextEncoder().encode(JSON.stringify(parsed)).length > MAX_STYLE_BYTES) {
    return { ok: false, error: "Style JSON must be 8 KB or smaller." };
  }
  const result = styleSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") || "style";
    return {
      ok: false,
      error: `Invalid value at "${path}" — values must be strings, numbers, booleans, or arrays of strings.`,
    };
  }
  return { ok: true, value: result.data };
}
