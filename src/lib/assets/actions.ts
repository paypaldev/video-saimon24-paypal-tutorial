"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { deleteAssetObject } from "@/lib/storage";

/**
 * Deletes the storage object, then the row (RLS scopes both).
 * Deleting an asset does not refund a credit; the API call was already paid for.
 */
export async function deleteAsset(id: string) {
  await requireUser();
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("assets")
    .select("id, storage_path")
    .eq("id", id)
    .single();

  if (!asset) {
    return { error: "Asset not found." };
  }

  try {
    await deleteAssetObject(supabase, asset.storage_path);
  } catch {
    return { error: "Could not delete the image file. Try again." };
  }

  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) {
    return { error: "Could not delete the asset. Try again." };
  }

  revalidatePath("/app", "layout");
  redirect("/app");
}
