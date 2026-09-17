import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuota } from "@/lib/billing/quota";
import { styleSchema } from "@/lib/style/schema";
import { DEFAULT_STYLE_JSON } from "@/lib/style/default";
import { buildPrompt } from "@/lib/generation/prompt";
import { generateImage, ProviderError } from "@/lib/generation/openai";
import { uploadAssetImage, deleteAssetObject } from "@/lib/storage";
import { ok, fail } from "@/lib/http";

export const maxDuration = 60;

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();

  // 1. Resolve the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "You must be signed in to generate assets.");
  }

  // 2. Validate the body.
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail(422, "invalid_input", "Request body must be JSON.");
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) {
    return fail(422, "invalid_input", "Title is required (max 120 chars); description max 2000 chars.");
  }
  const { title, description } = body.data;

  // 3. Load the profile → plan + style.
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, generations_used, style_json")
    .single();
  if (!profile) {
    return fail(401, "unauthorized", "No profile found for this account.");
  }
  const quota = getQuota(profile);
  const styleParsed = styleSchema.safeParse(profile.style_json);
  const style = styleParsed.success ? styleParsed.data : DEFAULT_STYLE_JSON;

  // 4. Atomically consume a credit.
  const { data: remaining, error: quotaError } = await supabase.rpc(
    "consume_generation_credit",
    { p_limit: quota.limit },
  );
  if (quotaError) {
    if (quotaError.message.includes("quota_exceeded")) {
      return fail(402, "quota_exceeded", "You have used all your generations.", {
        plan: quota.plan,
        limit: quota.limit,
      });
    }
    return fail(500, "storage_error", "Could not reserve a generation credit.");
  }

  // 5. Build the prompt and call the model.
  const prompt = buildPrompt({ title, description, style });
  let image;
  try {
    image = await generateImage(prompt);
  } catch (error) {
    // 6. Provider failure: refund the credit, no asset row is written.
    await refundCredit(user.id);
    const message =
      error instanceof ProviderError
        ? error.message
        : "Image generation failed. Please try again.";
    return fail(502, "provider_error", message);
  }

  // 7. Upload the PNG.
  const assetId = crypto.randomUUID();
  const storagePath = `${user.id}/${assetId}.png`;
  try {
    await uploadAssetImage(supabase, storagePath, image.png);
  } catch {
    return fail(500, "storage_error", "The image could not be saved. Please try again.");
  }

  // 8. Insert the asset row with the final prompt and the style snapshot.
  const { error: insertError } = await supabase.from("assets").insert({
    id: assetId,
    user_id: user.id,
    title,
    description: description || null,
    prompt,
    style_json: style,
    model: image.model,
    storage_path: storagePath,
    width: image.width,
    height: image.height,
  });
  if (insertError) {
    await deleteAssetObject(supabase, storagePath).catch(() => {});
    return fail(500, "storage_error", "The asset could not be saved. Please try again.");
  }

  // 9. Refresh the library (and the usage pill in the app shell).
  revalidatePath("/app", "layout");
  return ok({ id: assetId, remaining });
}

/**
 * Gives back the credit consumed in step 4. The refund function is executable
 * by the service role only (0004_refund_guard.sql) — if a signed-in user could
 * call it, they could reset their own usage from the browser. The id always
 * comes from the verified session, never from the request.
 */
async function refundCredit(userId: string): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("refund_generation_credit", {
      p_user_id: userId,
    });
    if (error) console.error("[generate] credit refund failed", error.message);
  } catch (error) {
    // No SUPABASE_SERVICE_ROLE_KEY: the credit stays spent, the request still
    // fails with the provider error below.
    console.error("[generate] credit refund skipped", error);
  }
}
