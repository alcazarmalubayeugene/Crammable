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
 * Translate a Supabase/PostgREST error into a typed DbError.
 *
 * Handles two error sources:
 *   1. Constraint violations surfaced by PostgREST (SQLSTATE in `code`).
 *   2. RAISE EXCEPTION messages from our SECURITY DEFINER functions
 *      (deduct_credit, grant_credits, the privilege-escalation triggers).
 *      These arrive as SQLSTATE P0001 with the custom text in `message`.
 *
 * Anything unrecognised collapses to INTERNAL_ERROR so we never leak raw
 * Postgres internals to the client (the original message is preserved on the
 * Error for server-side logging).
 */
export function toDbError(
  error: PostgrestError,
  fallbackMessage: string = UIMessages.genericError
): DbError {
  const raw = `${error.message ?? ""} ${error.details ?? ""}`;

  // --- Custom RAISE EXCEPTION text from our PL/pgSQL functions ---------------
  if (raw.includes("INSUFFICIENT_CREDITS")) {
    return dbError(
      ApiErrorCode.INSUFFICIENT_CREDITS,
      "You're out of credits. Upgrade to Pro or earn more to keep generating."
    );
  }
  if (raw.includes("FORBIDDEN:")) {
    return dbError(ApiErrorCode.FORBIDDEN, "That change isn't allowed.");
  }
  if (raw.includes("ALREADY_PROCESSED")) {
    // approve_payment()/reject_payment() raise this when the row is no longer
    // pending (already actioned, missing, or claimed by another admin).
    return dbError(ApiErrorCode.VALIDATION_ERROR, "This payment has already been processed.");
  }

  // --- SQLSTATE constraint violations ---------------------------------------
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
      return dbError(ApiErrorCode.INTERNAL_ERROR, fallbackMessage);
  }
}
