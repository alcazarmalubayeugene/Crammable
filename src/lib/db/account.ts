import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApiErrorCode,
  TableNames,
  type AppReview,
  type Deck,
  type Flashcard,
  type PaymentSubmission,
  type Profile,
  type QuizSession,
  type ReferralEvent,
} from "@/lib/contracts";
import { dbError, toDbError } from "@/lib/db/errors";

/** Everything E5's data-export endpoint hands back as a downloadable JSON file. */
export interface AccountExportData {
  exportedAt:      string;
  profile:         Profile | null;
  decks:           Deck[];
  flashcards:      Flashcard[];
  quizSessions:    QuizSession[];
  paymentSubmissions: PaymentSubmission[];
  referralEvents:  ReferralEvent[];
  appReviews:      AppReview[];
}

/**
 * E5 — gather every row the user owns for the "export my data" download.
 * Session client throughout, so RLS scopes each query to the caller's own
 * rows — no service-role access needed for a self-export.
 */
export async function exportAccountData(userId: string): Promise<AccountExportData> {
  const supabase = await createSessionClient();

  const [profile, decks, flashcards, quizSessions, paymentSubmissions, referralEvents, appReviews] =
    await Promise.all([
      supabase.from(TableNames.profiles).select("*").eq("id", userId).maybeSingle(),
      supabase.from(TableNames.decks).select("*").eq("user_id", userId),
      supabase.from(TableNames.flashcards).select("*").eq("user_id", userId),
      supabase.from(TableNames.quizSessions).select("*").eq("user_id", userId),
      supabase.from(TableNames.paymentSubmissions).select("*").eq("user_id", userId),
      supabase.from(TableNames.referralEvents).select("*").eq("referrer_id", userId),
      supabase.from(TableNames.appReviews).select("*").eq("user_id", userId),
    ]);

  for (const result of [profile, decks, flashcards, quizSessions, paymentSubmissions, referralEvents, appReviews]) {
    if (result.error) throw toDbError(result.error, "Failed to export account data.");
  }

  return {
    exportedAt: new Date().toISOString(),
    profile: (profile.data as Profile) ?? null,
    decks: (decks.data as Deck[]) ?? [],
    flashcards: (flashcards.data as Flashcard[]) ?? [],
    quizSessions: (quizSessions.data as QuizSession[]) ?? [],
    paymentSubmissions: (paymentSubmissions.data as PaymentSubmission[]) ?? [],
    referralEvents: (referralEvents.data as ReferralEvent[]) ?? [],
    appReviews: (appReviews.data as AppReview[]) ?? [],
  };
}

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
