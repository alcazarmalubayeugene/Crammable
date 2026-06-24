import { createServerClient } from "@supabase/ssr";
import { inject } from "vitest";

// Reuse the live-DB user/deck/card helpers from the integration suite — they
// already create confirmed throwaway users and clean them up. The HTTP suite
// adds cookie-session auth on top (createTestUser there returns a supabase-js
// client; here we additionally need the @supabase/ssr cookie jar so the running
// server recognises the session).
export {
  createTestUser,
  deleteTestUser,
  createDeckAs,
  createCardAs,
  adminClient,
  type TestUser,
} from "../integration/helpers";

export function baseUrl(): string {
  return inject("httpBaseUrl");
}

/**
 * Sign in via @supabase/ssr against a throwaway in-memory cookie jar and
 * serialise the resulting cookies into a `Cookie` header. These are the exact
 * chunked `sb-<ref>-auth-token` cookies the running server reads through
 * `next/headers` / the middleware client, so `getUser()` validates the session.
 *
 * Values are percent-encoded to mirror Next's cookie serialisation, since Next
 * percent-decodes request cookies on read.
 */
export async function sessionCookieHeader(
  email: string,
  password: string,
): Promise<string> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [...jar.entries()].map(([name, value]) => ({ name, value }));
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            if (value === "") jar.delete(name);
            else jar.set(name, value);
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in for cookies failed: ${error.message}`);
  if (jar.size === 0) throw new Error("no auth cookies were set after sign-in");

  return [...jar.entries()]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
}

export interface ApiResult {
  status: number;
  /** Parsed JSON body (or null if the response wasn't JSON). */
  body: { success?: boolean; error?: { code?: string; message?: string } } & Record<
    string,
    unknown
  >;
}

/**
 * POST/PATCH/DELETE/GET a JSON route on the running server. Pass `cookie` for an
 * authenticated request and `origin` to exercise the CSRF same-origin check.
 */
export async function apiFetch(
  pathname: string,
  opts: {
    method?: string;
    cookie?: string;
    origin?: string;
    json?: unknown;
  } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.origin) headers["Origin"] = opts.origin;
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${baseUrl()}${pathname}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    redirect: "manual",
  });

  let body: ApiResult["body"];
  try {
    body = (await res.json()) as ApiResult["body"];
  } catch {
    body = {} as ApiResult["body"];
  }
  return { status: res.status, body };
}
