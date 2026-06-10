import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TableNames, Validation, type Profile } from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";
import { ensureMaxLength } from "@/lib/db/validate";

/**
 * Profile reads/writes.
 *
 * getCurrentProfile()/requireAuth() in src/lib/auth/helpers.ts already fetch the
 * caller's own profile — use those in handlers. The helpers here cover the
 * cross-user and service-role cases the auth helpers don't:
 *   - looking up a referrer by their public referral code (referral claim flow)
 *   - writing the immutable referred_by column (service-role only)
 *
 * Columns blocked for the authenticated role by the schema triggers
 * (is_admin, subscription_tier, referral_code, lifetime_credits_earned,
 * referred_by) must never be passed to updateOwnProfile — they're typed out.
 */

/** Fields a user is allowed to change on their own profile. */
export type EditableProfileFields = Partial<
  Pick<Profile, "full_name" | "course" | "consent_deepseek">
>;

/** Update the caller's own profile (editable columns only). Returns the new row. */
export async function updateOwnProfile(
  userId: string,
  fields: EditableProfileFields
): Promise<Profile> {
  ensureMaxLength(fields.full_name, Validation.profile.fullNameMaxLength, "Full name");
  ensureMaxLength(fields.course, Validation.profile.courseMaxLength, "Course");

  // Build the payload from an explicit allow-list rather than forwarding
  // `fields` — defense in depth so a route that passes an unvalidated body can
  // never reach a privileged column (e.g. token_balance) through this helper.
  const payload: EditableProfileFields = {};
  if (fields.full_name !== undefined) payload.full_name = fields.full_name;
  if (fields.course !== undefined) payload.course = fields.course;
  if (fields.consent_deepseek !== undefined) payload.consent_deepseek = fields.consent_deepseek;

  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.profiles)
    .update(payload)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw toDbError(error, "Failed to update profile.");
  return data as Profile;
}

/**
 * Resolve a referral code to the owning user's id (and nothing else).
 *
 * Uses the service-role client because the referrer is a different user — RLS
 * would hide their row. Returns ONLY the id: the referrer's profile holds PII
 * (email) and balances, so we never hand the whole row back to a caller that
 * just needs to attribute a referral. Returns null when the code matches no one.
 */
export async function getProfileIdByReferralCode(
  referralCode: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TableNames.profiles)
    .select("id")
    .eq("referral_code", referralCode)
    .maybeSingle();
  if (error) throw toDbError(error, "Failed to look up referral code.");
  return (data as { id: string } | null)?.id ?? null;
}
