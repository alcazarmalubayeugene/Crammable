import {
  ApiErrorCode,
  ApiPaths,
  ReferralCaps,
  ReferralEventType,
  toMonthKey,
  type ClaimProfileCompleteRequest,
  type ClaimProfileCompleteResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { updateOwnProfile, claimSelfReferralEvent, DbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let body: ClaimProfileCompleteRequest;
    try {
      body = (await request.json()) as ClaimProfileCompleteRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user, profile } = await requireAuth();

    await enforceRateLimit(user.id, ApiPaths.claimProfileComplete);

    const fullName = (body.fullName ?? "").trim();
    const course = (body.course ?? "").trim();

    // Was the profile incomplete BEFORE this save? Re-derive from the current
    // row, never trust the client — that's the only thing that decides whether
    // a reward is claimable.
    const wasIncomplete = !profile.full_name || !profile.course;

    const updated = await updateOwnProfile(user.id, {
      full_name: fullName || null,
      course: course || null,
    });

    let creditsAwarded = 0;
    let newBalance = updated.token_balance;

    if (wasIncomplete && fullName && course) {
      try {
        newBalance = await claimSelfReferralEvent(
          user.id,
          ReferralEventType.PROFILE_COMPLETE,
          ReferralCaps[ReferralEventType.PROFILE_COMPLETE].creditsAwarded,
          toMonthKey(new Date())
        );
        creditsAwarded = ReferralCaps[ReferralEventType.PROFILE_COMPLETE].creditsAwarded;
      } catch (err) {
        // Lifetime cap already reached (already claimed before) — profile save
        // still succeeds, just no additional credit.
        if (!(err instanceof DbError && err.code === ApiErrorCode.REFERRAL_CAP_REACHED)) {
          throw err;
        }
      }
    }

    return apiSuccess<ClaimProfileCompleteResult>({
      creditsAwarded,
      newBalance,
      fullName: updated.full_name,
      course: updated.course,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
