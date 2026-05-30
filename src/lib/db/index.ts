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
export { deductCredit, grantCredits, checkReferralCap } from "@/lib/db/rpc";

// Rate limiting
export { checkRateLimit, enforceRateLimit } from "@/lib/db/rate-limit";

// Profiles
export {
  getProfileById,
  updateOwnProfile,
  getProfileIdByReferralCode,
  setReferredBy,
  type EditableProfileFields,
} from "@/lib/db/profiles";

// Decks
export {
  createDeck,
  listDecksForUser,
  getDeckById,
  getDeckWithCards,
  countDecksForUser,
  updateDeckCardCount,
  deleteDeck,
  createDeckWithCards,
  type NewDeckInput,
} from "@/lib/db/decks";

// Flashcards
export {
  insertFlashcards,
  getFlashcardsForDeck,
  getWeakCardsForDeck,
  applyCardReview,
} from "@/lib/db/flashcards";

// Quiz
export {
  createQuizSession,
  getQuizSessionById,
  insertQuizAnswers,
  completeQuizSession,
  type NewQuizSessionInput,
} from "@/lib/db/quiz";

// Payments (student side)
export {
  createPaymentSubmission,
  listUserPayments,
  type NewPaymentInput,
} from "@/lib/db/payments";

// Referrals
export {
  logReferralEvent,
  listReferralEventsForUser,
  type NewReferralEventInput,
} from "@/lib/db/referrals";

// Admin payment verification
export {
  listPendingPayments,
  getPaymentById,
  approvePayment,
  rejectPayment,
} from "@/lib/db/admin";
