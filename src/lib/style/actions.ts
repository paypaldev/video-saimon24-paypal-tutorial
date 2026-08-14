"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseStyleJson } from "@/lib/style/schema";

export type StyleActionState = { error: string | null; saved: boolean };

export async function updateStyle(
  _prev: StyleActionState,
  formData: FormData,
): Promise<StyleActionState> {
  const user = await requireUser();
  const raw = formData.get("style_json");
  if (typeof raw !== "string") {
    return { error: "Missing style JSON.", saved: false };
  }

  const result = parseStyleJson(raw);
  if (!result.ok) {
    return { error: result.error, saved: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ style_json: result.value })
    .eq("id", user.id);

  if (error) {
    return { error: "Could not save your style. Try again.", saved: false };
  }

  revalidatePath("/app/style");
  return { error: null, saved: true };
}
