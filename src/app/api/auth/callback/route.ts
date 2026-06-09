import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EnvKeys,
  Routes,
  TableNames,
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

  // ── Email verification — write profile fields + process referral ─────────
  const referralCodeUsed = user.user_metadata?.referral_code_used as
    | string
    | undefined;

  if (type === "signup") {
    const admin = createAdminClient();

    // Write fields that the handle_new_user() trigger doesn't set.
    // These values were stored in user_metadata at signup time.
    const profilePatch: Record<string, unknown> = {};
    if (user.user_metadata?.full_name)
      profilePatch.full_name = user.user_metadata.full_name;
    if (user.user_metadata?.course)
      profilePatch.course = user.user_metadata.course;
    if (typeof user.user_metadata?.consent_deepseek === "boolean")
      profilePatch.consent_deepseek = user.user_metadata.consent_deepseek;

    if (Object.keys(profilePatch).length > 0) {
      await admin
        .from(TableNames.profiles)
        .update(profilePatch)
        .eq("id", user.id)
        .catch((err) =>
          console.error("[auth/callback] profile patch failed (non-fatal):", err)
        );
    }

    if (referralCodeUsed) {
      await processSignupReferral(user.id, referralCodeUsed).catch((err) =>
        console.error("[auth/callback] referral processing failed (non-fatal):", err)
      );
    }
  }

  return NextResponse.redirect(new URL(Routes.dashboard, appUrl));
}

/**
 * Records the referral relationship and awards credits to the referrer.
 * All writes use the service-role client (bypasses RLS for cross-user updates).
 * Non-fatal: errors are caught by the caller and logged, not surfaced to user.
 */
async function processSignupReferral(
  newUserId: string,
  referralCode: string
): Promise<void> {
  const admin = createAdminClient();

  // 1. Resolve referral code → referrer profile id
  const { data: referrer } = await admin
    .from(TableNames.profiles)
    .select("id")
    .eq("referral_code", referralCode)
    .single();

  if (!referrer || referrer.id === newUserId) return; // invalid code or self-referral

  const monthKey = toMonthKey(new Date());

  // 2. Check monthly cap (mirrors check_referral_cap DB function)
  const { data: capAllowed } = await admin.rpc("check_referral_cap", {
    p_referrer_id: referrer.id,
    p_event_type: ReferralEventType.SIGNUP,
    p_month_key: monthKey,
  });

  if (!capAllowed) return;

  const credits = ReferralCaps[ReferralEventType.SIGNUP].creditsAwarded;

  // 3. Set referred_by on the new user's profile
  await admin
    .from(TableNames.profiles)
    .update({ referred_by: referrer.id })
    .eq("id", newUserId);

  // 4. Award credits atomically and log the event in parallel.
  // grant_credits() is a SECURITY DEFINER function that increments both
  // token_balance and lifetime_credits_earned in a single UPDATE — no race condition.
  await Promise.all([
    admin.rpc("grant_credits", {
      p_user_id: referrer.id,
      p_amount: credits,
    }),

    admin.from(TableNames.referralEvents).insert({
      referrer_id: referrer.id,
      referred_id: newUserId,
      event_type: ReferralEventType.SIGNUP,
      credits_awarded: credits,
      verified: true,
      month_key: monthKey,
    }),
  ]);
}
