import {
  ApiErrorCode,
  ApiPaths,
  ReferralCaps,
  ReferralEventType,
  TableNames,
  UIMessages,
  Validation,
  toMonthKey,
  type ClaimReferralRequest,
  type ClaimReferralResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";
import { checkRateLimit } from "@/lib/supabase/server";
import { getProfileIdByReferralCode } from "@/lib/db/profiles";
import { grantCredits, checkReferralCap } from "@/lib/db/rpc";
import { logReferralEvent } from "@/lib/db/referrals";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    let body: ClaimReferralRequest;
    try {
      body = (await request.json()) as ClaimReferralRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user, profile } = await requireAuth();

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

    if (referrerId === user.id) {
      return apiFail(ApiErrorCode.SELF_REFERRAL, "You can't use your own referral code.", 400);
    }

    const monthKey = toMonthKey(new Date());
    const capAllowed = await checkReferralCap(referrerId, ReferralEventType.SIGNUP, monthKey);
    if (!capAllowed) {
      return apiFail(ApiErrorCode.REFERRAL_CAP_REACHED, "This referrer has reached their monthly referral limit.", 409);
    }

    const credits = ReferralCaps[ReferralEventType.SIGNUP].creditsAwarded;

    await Promise.all([
      grantCredits(referrerId, credits),
      createAdminClient()
        .from(TableNames.profiles)
        .update({ referred_by: referrerId })
        .eq("id", user.id),
      logReferralEvent({
        referrerId,
        referredId: user.id,
        eventType: ReferralEventType.SIGNUP,
        creditsAwarded: credits,
        monthKey,
        verified: true,
      }),
    ]);

    return apiSuccess<ClaimReferralResult>({
      creditsAwarded: credits,
      newBalance: profile.token_balance,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
