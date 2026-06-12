import type { PostgrestError } from "@supabase/supabase-js";
import { ApiErrorCode, UIMessages } from "@/lib/contracts";

/**
 * Error thrown by every function in the data-access layer (src/lib/db).
 *
 * Carries a contracts.ts ApiErrorCode and the HTTP status a route handler
 * should respond with. Route handlers don't inspect Postgres errors directly —
 * they catch DbError (and AuthError) and hand them to handleApiError() in
 * src/lib/api/errors.ts.
 */
export class DbError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "DbError";
  }
}

/** Default HTTP status for each ApiErrorCode. */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  [ApiErrorCode.UNAUTHORIZED]: 401,
  [ApiErrorCode.FORBIDDEN]: 403,
  [ApiErrorCode.CONSENT_REQUIRED]: 403,
  [ApiErrorCode.INSUFFICIENT_CREDITS]: 402,
  [ApiErrorCode.DECK_LIMIT_REACHED]: 403,
  [ApiErrorCode.PAGE_LIMIT_EXCEEDED]: 422,
  [ApiErrorCode.FILE_TOO_LARGE]: 413,
  [ApiErrorCode.INVALID_FILE_TYPE]: 415,
  [ApiErrorCode.RATE_LIMITED]: 429,
  [ApiErrorCode.INVALID_REFERRAL_CODE]: 400,
  [ApiErrorCode.REFERRAL_CAP_REACHED]: 409,
  [ApiErrorCode.SELF_REFERRAL]: 400,
  [ApiErrorCode.INVALID_REFERENCE_NUMBER]: 400,
  [ApiErrorCode.PAYMENT_ALREADY_PENDING]: 409,
  [ApiErrorCode.REVIEW_ALREADY_SUBMITTED]: 409,
  [ApiErrorCode.AI_UNAVAILABLE]: 503,
  [ApiErrorCode.EXTRACTION_FAILED]: 422,
  [ApiErrorCode.VALIDATION_ERROR]: 400,
  [ApiErrorCode.INTERNAL_ERROR]: 500,
};

/** Build a DbError using the canonical status for its code. */
export function dbError(code: ApiErrorCode, message: string): DbError {
  return new DbError(code, STATUS_BY_CODE[code], message);
}

/**
 * Build an INTERNAL_ERROR DbError AND log the raw Postgres error server-side.
 *
 * The client only ever sees an opaque message, but a 500-class DB failure on a
 * money/credit path must leave a trace we can debug — so the original
 * PostgrestError (code + message + details) is logged here, not discarded.
 */
function internalError(error: PostgrestError, message: string): DbError {
  console.error(
    "[toDbError] Unmapped/internal database error:",
    error.code,
    error.message,
    error.details
  );
  return dbError(ApiErrorCode.INTERNAL_ERROR, message);
}

/**
 * Translate a Supabase/PostgREST error into a typed DbError.
 *
 * Handles two error sources:
 *   1. Constraint violations surfaced by PostgREST (SQLSTATE in `code`).
 *   2. RAISE EXCEPTION messages from our SECURITY DEFINER functions
 *      (deduct_credit, grant_credits, the privilege-escalation triggers).
 *      These arrive as SQLSTATE P0001 with the custom text in `message`.
 *
 * Our RAISE sentinels are matched on `error.message` only (exact prefix) — NOT
 * the combined message+details — because `details` can echo user-supplied values
 * and cause a false sentinel match. Constraint/index names are matched within the
 * SQLSTATE branches, where scanning details is safe (they're our identifiers).
 *
 * Anything unrecognised collapses to INTERNAL_ERROR and is logged (never leaked).
 */
export function toDbError(
  error: PostgrestError,
  fallbackMessage: string = UIMessages.genericError
): DbError {
  // Sentinel text from our PL/pgSQL RAISE EXCEPTIONs lives in `message` exactly.
  const msg = (error.message ?? "").trim();

  if (msg.startsWith("INSUFFICIENT_CREDITS")) {
    return dbError(
      ApiErrorCode.INSUFFICIENT_CREDITS,
      "You're out of credits. Upgrade to Pro or earn more to keep generating."
    );
  }
  if (msg.startsWith("SESSION_NOT_FOUND")) {
    // submit_quiz_result(): the session id is missing or owned by another user.
    // 404 (not the FORBIDDEN code's default 403) avoids leaking which session
    // ids exist — matching the result route's previous apiFail(FORBIDDEN, 404).
    return new DbError(ApiErrorCode.FORBIDDEN, 404, "Quiz session not found.");
  }
  if (msg.startsWith("ALREADY_SUBMITTED")) {
    // submit_quiz_result(): the session was already completed (double-submit).
    return new DbError(
      ApiErrorCode.VALIDATION_ERROR,
      409,
      "This quiz session has already been submitted."
    );
  }
  if (msg.startsWith("NO_ANSWERS")) {
    // submit_quiz_result(): empty answers array reached the DB.
    return dbError(ApiErrorCode.VALIDATION_ERROR, "At least one answer is required.");
  }
  if (msg.startsWith("FORBIDDEN:")) {
    return dbError(ApiErrorCode.FORBIDDEN, "That change isn't allowed.");
  }
  if (msg.startsWith("ALREADY_PROCESSED")) {
    // approve_payment()/reject_payment() raise this when the row is no longer
    // pending (already actioned, missing, or claimed by another admin).
    return dbError(ApiErrorCode.VALIDATION_ERROR, "This payment has already been processed.");
  }
  if (msg.startsWith("INVALID_AMOUNT")) {
    // grant_credits() rejects a non-positive amount — a caller bug, surfaced as 400.
    return dbError(ApiErrorCode.VALIDATION_ERROR, "Invalid credit amount.");
  }
  if (msg.startsWith("SELF_REFERRAL")) {
    // claim_referral(): referrer == referred.
    return dbError(ApiErrorCode.SELF_REFERRAL, "You can't use your own referral code.");
  }
  if (msg.startsWith("ALREADY_REFERRED")) {
    // claim_referral(): the referred user already has a referrer attributed.
    return dbError(ApiErrorCode.VALIDATION_ERROR, "You have already used a referral code.");
  }
  if (msg.startsWith("REFERRAL_CAP_REACHED")) {
    // claim_referral(): the referrer has hit their monthly/lifetime cap.
    return dbError(ApiErrorCode.REFERRAL_CAP_REACHED, "This referrer has reached their referral limit.");
  }
  if (msg.startsWith("USER_NOT_FOUND")) {
    // grant_credits() target row missing — a server-side inconsistency, not user error.
    return internalError(error, "Account not found.");
  }
  if (msg.startsWith("DECK_NOT_FOUND")) {
    // insert_reinforcement_cards_and_charge(): deck missing or owned by another user.
    return new DbError(ApiErrorCode.FORBIDDEN, 404, "Deck not found.");
  }
  if (msg.startsWith("NO_CARDS")) {
    // insert_reinforcement_cards_and_charge(): empty cards array reached the DB.
    return dbError(ApiErrorCode.VALIDATION_ERROR, "No reinforcement cards to insert.");
  }

  // --- SQLSTATE constraint violations ---------------------------------------
  // Constraint/index names may appear in message or details — scan both here.
  const raw = `${error.message ?? ""} ${error.details ?? ""}`;
  switch (error.code) {
    case "23505": {
      // unique_violation — disambiguate by constraint / index name
      if (raw.includes("idx_one_pending_payment_per_user")) {
        return dbError(
          ApiErrorCode.PAYMENT_ALREADY_PENDING,
          "You already have a payment awaiting verification."
        );
      }
      if (raw.includes("reference_number")) {
        return dbError(
          ApiErrorCode.VALIDATION_ERROR,
          "This GCash reference number has already been submitted."
        );
      }
      if (raw.includes("ux_referral_signup_once_per_referred")) {
        // AUDIT 2.1: duplicate signup attribution caught by the partial unique index.
        return dbError(ApiErrorCode.VALIDATION_ERROR, "You have already used a referral code.");
      }
      if (raw.includes("ux_referral_deck_share_once_per_deck")) {
        // claim_self_referral_event(): this deck already earned its one-time deck_share
        // credit. Same semantics as a cap — callers (share route) treat it as
        // "no additional credit", not a failure.
        return dbError(ApiErrorCode.REFERRAL_CAP_REACHED, "This deck has already earned a sharing reward.");
      }
      if (raw.includes("one_review_per_user")) {
        // app_reviews insert: user already has a review row (any status).
        return dbError(ApiErrorCode.REVIEW_ALREADY_SUBMITTED, "You've already submitted a review.");
      }
      return dbError(ApiErrorCode.VALIDATION_ERROR, "That record already exists.");
    }
    case "23514": {
      // check_violation
      if (raw.includes("reference_number")) {
        return dbError(
          ApiErrorCode.INVALID_REFERENCE_NUMBER,
          "GCash reference numbers must be exactly 13 digits."
        );
      }
      if (raw.includes("no_self_referral")) {
        return dbError(
          ApiErrorCode.SELF_REFERRAL,
          "You can't refer yourself."
        );
      }
      return dbError(ApiErrorCode.VALIDATION_ERROR, "A value failed a database constraint.");
    }
    case "23503":
      // foreign_key_violation — referenced row missing/deleted
      return dbError(ApiErrorCode.VALIDATION_ERROR, "A referenced record no longer exists.");
    default:
      return internalError(error, fallbackMessage);
  }
}
