import {
  ApiErrorCode,
  ApiPaths,
  ReferralCaps,
  ReferralEventType,
  UIMessages,
  Validation,
  toMonthKey,
  type ClaimReferralRequest,
  type ClaimReferralResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { checkRateLimit } from "@/lib/supabase/server";
import { getProfileIdByReferralCode } from "@/lib/db/profiles";
import { claimReferral } from "@/lib/db/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let body: ClaimReferralRequest;
    try {
      body = (await request.json()) as ClaimReferralRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user, profile } = await requireAuth();

    // Fast UX pre-check; claim_referral() re-checks this atomically under a row
    // lock, so this is advisory only and can't be raced into a double-award.
    if (profile.referred_by !== null) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "You have already used a referral code.", 400);
    }

    const rate = await checkRateLimit(user.id, ApiPaths.claimReferral);
    if (!rate.allowed) {
      return apiFail(ApiErrorCode.RATE_LIMITED, UIMessages.rateLimited, 429);
    }

    const code = (body.referralCode ?? "").trim().toUpperCase();
    if (code.length !== Validation.referralCode.length) {
      return apiFail(ApiErrorCode.INVALID_REFERRAL_CODE, "Invalid referral code.", 400);
    }

    const referrerId = await getProfileIdByReferralCode(code);
    if (!referrerId) {
      return apiFail(ApiErrorCode.INVALID_REFERRAL_CODE, "Invalid referral code.", 400);
    }

    const credits = ReferralCaps[ReferralEventType.SIGNUP].creditsAwarded;

    // Single atomic attribution: lock → re-check referred_by/self/cap → insert
    // ledger → credit referrer → set referred_by (schema §4.14b). Self-referral,
    // already-referred, and cap-reached all surface as typed DbErrors here.
    await claimReferral(
      user.id,
      referrerId,
      ReferralEventType.SIGNUP,
      toMonthKey(new Date()),
      credits,
    );

    // The signup referral credits the REFERRER, not the caller — so the caller's
    // own balance is unchanged. We echo it back as-is and the toast copy makes
    // clear who was credited (UIMessages.referralClaimThanks).
    return apiSuccess<ClaimReferralResult>({
      creditsAwarded: credits,
      newBalance: profile.token_balance,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
