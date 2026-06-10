import { createSessionClient } from "@/lib/supabase/server";
import { TableNames, type ReferralEvent } from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * referral_events has NO INSERT policy (schema §5, fix C2) — an open policy was
 * a fraud vector. All writes go through the atomic claim_referral() RPC (schema
 * §4.14b, wrapped by rpc.claimReferral). Reads use the session client (RLS:
 * referrer or referred).
 */

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
