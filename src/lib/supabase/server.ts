import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { EnvKeys, SubscriptionTier, TierLimits } from "@/lib/contracts";

/**
 * Session-aware Supabase client for Server Components and Route Handlers.
 * Reads and writes auth cookies via next/headers.
 * The setAll try/catch is intentional — Server Components are read-only cookie
 * contexts; Route Handlers can write. The catch silences the SC case safely.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env[EnvKeys.supabaseUrl]!,
    process.env[EnvKeys.supabaseAnonKey]!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Read-only cookie context (Server Component) — safe to ignore
          }
        },
      },
    }
  );
}

// Rate limiting lives in its canonical, tested home (schema.sql §4.9 needs all
// four args: p_user_id, p_endpoint, p_window_minutes, p_max_requests). Re-export
// it here so existing route imports keep resolving — do NOT reimplement it.
export { checkRateLimit, enforceRateLimit } from "@/lib/db/rate-limit";

export function getMaxUploadPages(tier: SubscriptionTier): number {
  return TierLimits[tier].maxUploadPages;
}
