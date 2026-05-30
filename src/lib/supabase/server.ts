import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { EnvKeys } from "@/lib/contracts";

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
