import { ApiErrorCode, type ApiFailResponse } from "@/lib/contracts";

/**
 * Lightweight CSRF defense for state-changing route handlers (audit 4.1).
 *
 * Auth on these routes is cookie-based (the Supabase SSR session cookie), so a
 * cross-site request carries the victim's cookies. JSON endpoints are largely
 * shielded by the CORS preflight that Content-Type: application/json forces, but
 * the multipart /api/upload endpoint is a CORS "simple request" and is reachable
 * from a cross-site auto-submitting <form>. This check rejects any browser
 * request whose Origin (or, as a fallback, Referer) does not match the request's
 * own host.
 *
 * Behavior:
 *   - Origin present and host-mismatched  → blocked (the CSRF case).
 *   - Origin absent but Referer present   → compared instead.
 *   - Both absent (non-browser clients: curl, server-to-server) → allowed; these
 *     can't be driven by a victim's browser and never carry ambient cookies.
 *
 * Returns an ApiFailResponse (403) to return early, or null when the request is
 * same-origin / non-browser and may proceed.
 */
export function assertSameOrigin(request: Request): Response | null {
  const host = request.headers.get("host");
  if (!host) return null; // cannot determine target host — fail open for non-browser callers

  const stated = request.headers.get("origin") ?? request.headers.get("referer");
  if (!stated) return null; // no Origin/Referer → not a browser-driven cross-site POST

  let statedHost: string;
  try {
    statedHost = new URL(stated).host;
  } catch {
    // Malformed Origin/Referer — treat as hostile.
    statedHost = "";
  }

  if (statedHost === host) return null; // same-origin — allow

  const body: ApiFailResponse = {
    success: false,
    error: {
      code: ApiErrorCode.FORBIDDEN,
      message: "Request blocked: cross-origin request not allowed.",
    },
  };
  return Response.json(body, { status: 403 });
}
