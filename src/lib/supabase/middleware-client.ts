import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { EnvKeys } from "@/lib/contracts";

/**
 * Supabase client factory for use exclusively inside src/middleware.ts.
 *
 * Returns { supabase, response } where `response` is a NextResponse that has
 * already had the refreshed session cookies written to it.
 *
 * The caller MUST return `response` (not a fresh NextResponse.next()) so that
 * the session cookies are forwarded to the browser.
 */
export function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env[EnvKeys.supabaseUrl]!,
    process.env[EnvKeys.supabaseAnonKey]!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write updated cookies back to both the request (for downstream
          // middleware) and the response (for the browser).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return { supabase, response };
}
