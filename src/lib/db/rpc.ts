import { createAdminClient } from "@/lib/supabase/admin";
import { ReferralEventType } from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * Wrappers around the SECURITY DEFINER credit/referral functions defined in
 * schema.sql §4. All of these MUST run through the service-role client — they
 * write to columns (token_balance, lifetime_credits_earned) that RLS and the
 * privilege-escalation triggers block for the authenticated role.
 *
 * Each function is atomic on its own (single UPDATE … RETURNING inside the
 * Postgres function). Composing several of them is NOT atomic across HTTP
 * calls — see the deductCredit note below.
 */

/**
 * deduct_credit(p_user_id): atomically decrement token_balance by 1.
 * Returns the post-decrement balance.
 *
 * @throws {DbError} INSUFFICIENT_CREDITS (402) when the balance is already 0.
 *
 * Standalone service-role primitive. The generation path no longer calls this
 * directly — deck insert + card inserts + credit deduction now commit in ONE
 * transaction via create_deck_with_cards_and_charge() (schema §4.14, wrapped by
 * decks.createDeckWithCardsAndCharge), so a failed persist can't charge and a
 * failed charge can't leave an orphan deck. Kept here for any future
 * single-credit deduction that isn't bundled with a deck create. EXECUTE on
 * deduct_credit is revoked from anon/authenticated (schema §4.15), so it must
 * run through the service-role client.
 */
export async function deductCredit(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("deduct_credit", {
    p_user_id: userId,
  });
  if (error) throw toDbError(error, "Failed to deduct credit.");
  return data as number;
}

/**
 * grant_credits(p_user_id, p_amount): atomically add credits and bump
 * lifetime_credits_earned. Returns the new token_balance.
 * Used by referral payouts, admin grants, and monthly Pro top-ups.
 */
export async function grantCredits(userId: string, amount: number): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_credits", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) throw toDbError(error, "Failed to grant credits.");
  return data as number;
}

/**
 * check_referral_cap(p_referrer_id, p_event_type, p_month_key): returns true
 * when the referrer is still allowed to earn for this event type, false once a
 * monthly/lifetime cap (per ReferralCaps) has been hit.
 *
 * Pass month_key from contracts.toMonthKey(new Date()).
 */
export async function checkReferralCap(
  referrerId: string,
  eventType: ReferralEventType,
  monthKey: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("check_referral_cap", {
    p_referrer_id: referrerId,
    p_event_type: eventType,
    p_month_key: monthKey,
  });
  if (error) throw toDbError(error, "Failed to check referral cap.");
  return data as boolean;
}

/**
 * claim_referral(): atomic, single-source referral attribution (schema §4.14b).
 * Locks the referred profile, re-checks referred_by/self/cap, inserts the ledger
 * event, credits the referrer, and stamps referred_by — all in one transaction.
 * Both referral paths (the /api/referral/claim route and the auth/callback
 * auto-process) MUST go through this so they can't double-award (audit 2.1).
 *
 * @throws {DbError} SELF_REFERRAL (400) · VALIDATION_ERROR (400, ALREADY_REFERRED)
 *                   · REFERRAL_CAP_REACHED (409) · INTERNAL_ERROR (USER_NOT_FOUND)
 */
export async function claimReferral(
  referredId: string,
  referrerId: string,
  eventType: ReferralEventType,
  monthKey: string,
  credits: number
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("claim_referral", {
    p_referred_id: referredId,
    p_referrer_id: referrerId,
    p_event_type: eventType,
    p_month_key: monthKey,
    p_credits: credits,
  });
  if (error) throw toDbError(error, "Failed to claim referral.");
}
