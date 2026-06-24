"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase browser env vars are not configured");
  }

  // createBrowserClient (from @supabase/ssr) uses cookie storage —
  // the same storage the server-side login route writes to.
  // createClient (plain supabase-js) uses localStorage and can't
  // see the server-set session, which is why the dashboard got stuck.
  client = createBrowserClient(url, anonKey);
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Start the Google OAuth (PKCE) flow.
 *
 * createBrowserClient stores the PKCE code-verifier in a cookie, which is what
 * lets GET /api/auth/callback complete exchangeCodeForSession() server-side.
 *
 * Intent is carried across the round-trip via query params on redirectTo
 * (Supabase preserves them):
 *   - consent=1  → user ticked the DeepSeek consent box before a signup-mode
 *                  click; the callback persists consent_deepseek = true.
 *   - flow       → which button was used (advisory only; new-vs-returning is
 *                  decided server-side from profile completeness).
 */
export async function signInWithGoogle(opts: {
  consent: boolean;
  flow: "login" | "signup";
}) {
  const supabase = getSupabaseBrowserClient();
  const params = new URLSearchParams();
  if (opts.consent) params.set("consent", "1");
  params.set("flow", opts.flow);
  const redirectTo = `${window.location.origin}/api/auth/callback?${params.toString()}`;
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}
