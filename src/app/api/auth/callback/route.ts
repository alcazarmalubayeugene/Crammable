import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getProfileIdByReferralCode } from "@/lib/db/profiles";
import { claimReferral } from "@/lib/db/rpc";
import {
  EnvKeys,
  Routes,
  ReferralCaps,
  ReferralEventType,
  toMonthKey,
} from "@/lib/contracts";

/**
 * GET /api/auth/callback
 *
 * Supabase redirects here after:
 *   - Email verification  (type = signup or email_change)
 *   - Password reset      (type = recovery)
 *
 * PKCE flow:
 *   1. Extract `code` from query params
 *   2. Exchange code for a session (writes httpOnly cookies via @supabase/ssr)
 *   3. Process referral if this was a new signup with a referral code
 *   4. Redirect to the appropriate page
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const appUrl = process.env[EnvKeys.appUrl] ?? origin;

  const code = searchParams.get("code");
  const type = searchParams.get("type"); // "signup" | "recovery" | "email_change" | null

  if (!code) {
    const url = new URL(Routes.login, appUrl);
    url.searchParams.set("error", "missing_code");
    return NextResponse.redirect(url);
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("[auth/callback] exchangeCodeForSession error:", error?.message);
    const url = new URL(Routes.login, appUrl);
    url.searchParams.set("error", "invalid_code");
    return NextResponse.redirect(url);
  }

  const user = data.user;

  // ── Password reset — go to settings with reset form ───────────────────────
  if (type === "recovery") {
    const url = new URL(Routes.settings, appUrl);
    url.searchParams.set("mode", "reset-password");
    return NextResponse.redirect(url);
  }

  // ── Email verification — process referral then go to dashboard ────────────
  const referralCodeUsed = user.user_metadata?.referral_code_used as
    | string
    | undefined;

  if (type === "signup" && referralCodeUsed) {
    await processSignupReferral(user.id, referralCodeUsed).catch((err) =>
      console.error("[auth/callback] referral processing failed (non-fatal):", err)
    );
  }

  return NextResponse.redirect(new URL(Routes.dashboard, appUrl));
}

/**
 * Records the referral relationship and awards credits to the referrer.
 * Delegates to the single atomic claim_referral() RPC (schema §4.14b) — the SAME
 * path the /api/referral/claim form uses — so the two can't double-award (audit
 * 2.1/A4). Non-fatal: errors (invalid code, self-referral, already-referred,
 * cap-reached) are caught by the caller and logged, not surfaced to the user.
 */
async function processSignupReferral(
  newUserId: string,
  referralCode: string
): Promise<void> {
  const referrerId = await getProfileIdByReferralCode(referralCode.trim().toUpperCase());
  if (!referrerId) return; // invalid code

  await claimReferral(
    newUserId,
    referrerId,
    ReferralEventType.SIGNUP,
    toMonthKey(new Date()),
    ReferralCaps[ReferralEventType.SIGNUP].creditsAwarded,
  );
}
