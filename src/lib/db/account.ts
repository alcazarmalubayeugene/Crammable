import { createAdminClient } from "@/lib/supabase/admin";
import { ApiErrorCode } from "@/lib/contracts";
import { dbError, toDbError } from "@/lib/db/errors";

/**
 * E5 — permanently delete a user's account.
 *
 * 1. prepare_account_deletion() (schema §4.11b, service-role): detaches the
 *    user's payment_submissions from admin_action_log (RESTRICT FK) and writes
 *    an 'account_deleted' audit row.
 * 2. auth.admin.deleteUser(): deletes the auth.users row, which cascades via FK
 *    (ON DELETE CASCADE) through profiles, decks, flashcards, quiz_sessions,
 *    quiz_answers, payment_submissions, referral_events, app_reviews, and
 *    rate_limit_log.
 *
 * Service-role only — never callable from the session client.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { error: prepError } = await admin.rpc("prepare_account_deletion", {
    p_user_id: userId,
  });
  if (prepError) throw toDbError(prepError, "Failed to delete account.");

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[deleteAccount] auth.admin.deleteUser failed:", deleteError.message);
    throw dbError(ApiErrorCode.INTERNAL_ERROR, "Failed to delete account.");
  }
}
