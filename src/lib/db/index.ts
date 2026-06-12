/**
 * Crammable data-access layer (integration layer #3).
 *
 * Typed helpers over Supabase that every route handler in features 4–12 builds
 * on. Import from "@/lib/db" rather than reaching for a Supabase client and
 * raw table strings in a handler.
 *
 * Client selection is handled inside each helper:
 *   - session client (RLS applies) for user-scoped reads/writes
 *   - service-role client (bypasses RLS) for the credit/rate-limit RPCs,
 *     referral_events inserts, and the admin verification flow
 *
 * Errors: every helper throws DbError (see ./errors). In a route handler, wrap
 * the body in try/catch and return handleApiError(err) from "@/lib/api/errors".
 */

// Errors
export { DbError, dbError, toDbError } from "@/lib/db/errors";

// Credit / referral RPCs
export { deductCredit, grantCredits, checkReferralCap, claimReferral, claimSelfReferralEvent } from "@/lib/db/rpc";

// Rate limiting
export { checkRateLimit, enforceRateLimit } from "@/lib/db/rate-limit";

// Profiles
export {
  updateOwnProfile,
  getProfileIdByReferralCode,
  type EditableProfileFields,
} from "@/lib/db/profiles";

// Decks
export {
  createDeck,
  listDecksForUser,
  getDeckById,
  getDeckWithCards,
  countDecksForUser,
  deleteDeck,
  renameDeck,
  createDeckWithCardsAndCharge,
  setDeckPublic,
  getPublicDeckWithCards,
  type NewDeckInput,
} from "@/lib/db/decks";

// Flashcards
export {
  insertFlashcards,
  getFlashcardsForDeck,
  getWeakCardsForDeck,
  applyCardReview,
  insertReinforcementCardsAndCharge,
  createFlashcard,
  updateFlashcard,
  deleteFlashcard,
  recomputeDeckCardCount,
  type NewFlashcardInput,
  type FlashcardEdits,
} from "@/lib/db/flashcards";

// Quiz
export {
  createQuizSession,
  submitQuizResult,
  getQuizSession,
  markLivingDeckRefreshTriggered,
  listQuizSessionsForUser,
  type NewQuizSessionInput,
} from "@/lib/db/quiz";

// Payments (student side)
export {
  createPaymentSubmission,
  type NewPaymentInput,
} from "@/lib/db/payments";

// Referrals
export {
  listReferralEventsForCurrentUser,
} from "@/lib/db/referrals";

// App reviews (B4)
export {
  createAppReview,
  getOwnAppReview,
} from "@/lib/db/reviews";

// Admin payment verification + user management (E4)
export {
  listPendingPayments,
  approvePayment,
  rejectPayment,
  listPendingAppReviews,
  verifyAppReview,
  listUsers,
  grantCreditsAsAdmin,
  listAuditLog,
} from "@/lib/db/admin";

// Account export / deletion (E5)
export {
  exportAccountData,
  deleteAccount,
  type AccountExportData,
} from "@/lib/db/account";
