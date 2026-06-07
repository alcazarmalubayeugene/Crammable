import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware-client";
import { Routes, TableNames } from "@/lib/contracts";

/**
 * Page-level route prefixes that require an active session.
 * API routes protect themselves via requireAuth() / requireAdmin().
 */
const PROTECTED_PREFIXES = [
  Routes.dashboard,  // /dashboard
  "/decks",          // /decks and /decks/new, /decks/[id]
  "/quiz",           // /quiz/[deckId] and /quiz/[deckId]/result
  Routes.upgrade,    // /upgrade
  Routes.rewards,    // /rewards
  Routes.settings,   // /settings
  Routes.admin,      // /admin
] as const;

/** Pages that should redirect to /dashboard when the user IS logged in. */
const AUTH_ONLY_PAGES = [Routes.login, Routes.signup] as const;

export async function proxy(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);

  // getUser() validates the JWT against the Supabase auth server.
  // This also triggers the @supabase/ssr session refresh cycle — the refreshed
  // cookies are written into `response` via the cookie handler above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Unauthenticated user hitting a protected page ──────────────────────────
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (isProtected && !user) {
    const loginUrl = new URL(Routes.login, request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Authenticated user hitting login / signup ──────────────────────────────
  const isAuthOnlyPage = (AUTH_ONLY_PAGES as readonly string[]).includes(pathname);
  if (isAuthOnlyPage && user) {
    return NextResponse.redirect(new URL(Routes.dashboard, request.url));
  }

  // ── Admin route — verify is_admin from DB ─────────────────────────────────
  // Only runs for authenticated users on /admin/* paths.
  // DB query is acceptable here — /admin is low-traffic by design.
  if (pathname.startsWith(Routes.admin) && user) {
    const { data: profile } = await supabase
      .from(TableNames.profiles)
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.redirect(new URL(Routes.dashboard, request.url));
    }
  }

  // IMPORTANT: return `response` (not NextResponse.next()) to propagate the
  // refreshed session cookies back to the browser.
  return response;
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
