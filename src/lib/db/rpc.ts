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
 * Returns the post-decrement balance (use for GenerateResult.creditsRemaining).
 *
 * @throws {DbError} INSUFFICIENT_CREDITS (402) when the balance is already 0.
 *
 * ORDERING NOTE — supabase-js issues one HTTP request per call, so a deck
 * insert + flashcard insert + deductCredit() are three separate transactions,
 * not one. To keep "DeepSeek failure → no credit charged", call deductCredit()
 * LAST, after the deck and its cards have persisted successfully. If a later
 * step can still fail, compensate by deleting the deck (see
 * decks.createDeckWithCards). For true single-transaction atomicity, move the
 * whole sequence into a dedicated SECURITY DEFINER function.
 *
 * TODO(#5 generate): replace the deduct-last + compensating-delete pattern with
 * a single create_deck_with_cards_and_charge() SECURITY DEFINER RPC so the deck
 * insert, flashcard inserts, and credit deduction commit atomically.
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
