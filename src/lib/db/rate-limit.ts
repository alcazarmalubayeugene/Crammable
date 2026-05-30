import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApiErrorCode,
  RateLimits,
  UIMessages,
  type RateLimitResult,
} from "@/lib/contracts";
import { dbError, toDbError } from "@/lib/db/errors";

/**
 * Rate limiting via the check_rate_limit() SECURITY DEFINER function
 * (schema.sql §4.9). The function is serialised with an advisory lock, so two
 * concurrent requests for the same user+endpoint can't both slip past the cap.
 *
 * Runs through the service-role client — rate_limit_log has RLS enabled with no
 * policies (deny-all for the authenticated role); only the SECURITY DEFINER
 * function may touch it.
 *
 * `endpoint` is an ApiPaths value (the same string used as a RateLimits key and
 * as the fetch() URL). Endpoints with no RateLimits rule are unlimited.
 */

/**
 * Check (and consume) one request against the endpoint's window.
 * Returns { allowed, remaining }. Blocked requests are NOT logged, so they
 * don't count toward — or extend — the window.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string
): Promise<RateLimitResult> {
  const rule = RateLimits[endpoint];
  // No rule configured → not rate limited. Use MAX_SAFE_INTEGER rather than
  // Infinity: RateLimitResult.remaining is serialized to JSON, and Infinity
  // becomes null there.
  if (!rule) return { allowed: true, remaining: Number.MAX_SAFE_INTEGER };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_window_minutes: rule.windowMinutes,
    p_max_requests: rule.maxRequests,
  });
  if (error) throw toDbError(error, "Rate limit check failed.");

  // check_rate_limit RETURNS TABLE(...) → PostgREST yields an array of rows.
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: Boolean(row?.allowed), remaining: Number(row?.remaining ?? 0) };
}

/**
 * Same as checkRateLimit but throws DbError(RATE_LIMITED, 429) when the cap is
 * exceeded — for handlers that just want the request to abort. Returns the
 * number of requests remaining in the window on success.
 *
 *   await enforceRateLimit(user.id, ApiPaths.generate);
 */
export async function enforceRateLimit(
  userId: string,
  endpoint: string
): Promise<number> {
  const { allowed, remaining } = await checkRateLimit(userId, endpoint);
  if (!allowed) {
    throw dbError(ApiErrorCode.RATE_LIMITED, UIMessages.rateLimited);
  }
  return remaining;
}
