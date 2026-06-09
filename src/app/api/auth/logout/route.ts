import { createSessionClient } from "@/lib/supabase/server";
import { internalErrorResponse } from "@/lib/auth/errors";

/**
 * POST /api/auth/logout
 *
 * Signs the current user out and clears the session cookies.
 * Always returns 200 — even if the user was already logged out — to
 * prevent session-state probing.
 *
 * Must be POST (not GET) to prevent CSRF via <img> or <a href> tags.
 */
export async function POST() {
  try {
    const supabase = await createSessionClient();
    // signOut() clears the session cookie via @supabase/ssr
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[auth/logout] unexpected error:", err);
    // Still return success — the session is unreliable at this point anyway
    // and the client should clear its local state regardless.
  }

  return Response.json({ success: true }, { status: 200 });
}
