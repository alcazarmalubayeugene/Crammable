import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TableNames,
  type ReferralEvent,
  type ReferralEventType,
} from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * referral_events has NO INSERT policy (schema §5, fix C2) — an open policy was
 * a fraud vector. All writes therefore go through the service-role client here,
 * AFTER the caller has validated eligibility (checkReferralCap + grantCredits in
 * src/lib/db/rpc.ts). Reads use the session client (RLS: referrer or referred).
 */

export interface NewReferralEventInput {
  referrerId: string;
  referredId: string | null;
  eventType: ReferralEventType;
  /** Must be one of the ReferralCaps credit values; CHECK enforces (3,5,10,15). */
  creditsAwarded: number;
  /** "YYYY-MM" — always from contracts.toMonthKey(). */
  monthKey: string;
  /** app_review events start unverified until an admin confirms. */
  verified?: boolean;
}

/**
 * Log a referral/credit-earning event. This records the event only — actually
 * crediting the referrer is a separate grantCredits() call. Keep both in the
 * same logical flow so the ledger and the balance stay consistent.
 */
export async function logReferralEvent(
  input: NewReferralEventInput
): Promise<ReferralEvent> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TableNames.referralEvents)
    .insert({
      referrer_id: input.referrerId,
      referred_id: input.referredId,
      event_type: input.eventType,
      credits_awarded: input.creditsAwarded,
      month_key: input.monthKey,
      verified: input.verified ?? false,
    })
    .select("*")
    .single();
  if (error) throw toDbError(error, "Failed to record referral event.");
  return data as ReferralEvent;
}

/**
 * Events where the current user is the referrer or the referred party (rewards
 * page). The referral_events SELECT RLS policy is exactly
 * `referrer_id = auth.uid() OR referred_id = auth.uid()`, so a plain select
 * through the session client already returns precisely those rows — no explicit
 * filter (and no string interpolation) needed.
 */
export async function listReferralEventsForCurrentUser(): Promise<ReferralEvent[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.referralEvents)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw toDbError(error, "Failed to load referral history.");
  return (data as ReferralEvent[]) ?? [];
}
