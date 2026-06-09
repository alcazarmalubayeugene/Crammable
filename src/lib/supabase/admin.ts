import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EnvKeys } from "@/lib/contracts";

let _admin: SupabaseClient | null = null;

/**
 * Service-role Supabase client — bypasses Row Level Security.
 * Singleton: one instance per server process.
 *
 * NEVER import this in client components or any file that could be bundled
 * for the browser. Use only in Route Handlers and Server Actions.
 *
 * Required for: deduct_credit(), grant_credits(), check_rate_limit(), admin approve/reject writes.
 */
export function createAdminClient(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env[EnvKeys.supabaseUrl];
  const key = process.env[EnvKeys.supabaseServiceRoleKey];

  if (!url || !key) {
    throw new Error(
      "Missing Supabase service-role credentials. " +
        "Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
    );
  }

  _admin = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _admin;
}
