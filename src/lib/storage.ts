import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const ASSETS_BUCKET = "assets";
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

type Client = SupabaseClient<Database>;

export async function uploadAssetImage(
  supabase: Client,
  storagePath: string,
  png: Buffer,
) {
  const { error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(storagePath, png, { contentType: "image/png", upsert: false });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

/** Batch-create signed URLs; returns a map of storage_path → signed URL. */
export async function createSignedUrlMap(
  supabase: Client,
  storagePaths: string[],
): Promise<Record<string, string>> {
  if (storagePaths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const entry of data) {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  }
  return map;
}

export async function createSignedUrl(
  supabase: Client,
  storagePath: string,
  options?: { download?: string | boolean },
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, options);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteAssetObject(supabase: Client, storagePath: string) {
  const { error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .remove([storagePath]);
  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}
