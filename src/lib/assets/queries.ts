import { createClient } from "@/lib/supabase/server";
import type { Asset, Profile } from "@/types/database";

/** Loads the current user's profile. RLS scopes the query to auth.uid(). */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").single();
  return data;
}

export async function listAssets(): Promise<Asset[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getAsset(id: string): Promise<Asset | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("assets").select("*").eq("id", id).single();
  return data;
}
