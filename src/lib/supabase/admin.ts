import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env/client";
import { serverEnv } from "@/lib/env/server";
import type { Database } from "@/types/database";

/**
 * Service-role client — bypasses RLS.
 *
 * This exists for exactly one caller: the PayPal webhook, which has no user
 * session and must write `profiles.plan` (a column the guard trigger in
 * 0002_quota.sql blocks for the `authenticated` role). Never import this from
 * a Client Component; `server-only` makes that a build error.
 */
export function createAdminClient() {
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — it is required for the PayPal webhook.",
    );
  }

  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
