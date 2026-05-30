import { describe, it, expect, vi, afterEach } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { DbError, dbError, toDbError } from "@/lib/db/errors";
import { ApiErrorCode } from "@/lib/contracts";

/** Build a PostgrestError-shaped object for the mapper. */
function pgError(partial: Partial<PostgrestError>): PostgrestError {
  return {
    name: "PostgrestError",
    message: "",
    details: "",
    hint: "",
    code: "",
    ...partial,
  } as PostgrestError;
}

describe("dbError", () => {
  it("assigns the canonical status for a code", () => {
    expect(dbError(ApiErrorCode.RATE_LIMITED, "slow down")).toMatchObject({
      code: ApiErrorCode.RATE_LIMITED,
      status: 429,
      message: "slow down",
    });
  });
});

describe("toDbError", () => {
  it("maps the INSUFFICIENT_CREDITS RAISE EXCEPTION to 402", () => {
    const err = toDbError(pgError({ code: "P0001", message: "INSUFFICIENT_CREDITS" }));
    expect(err).toBeInstanceOf(DbError);
    expect(err.code).toBe(ApiErrorCode.INSUFFICIENT_CREDITS);
    expect(err.status).toBe(402);
  });

  it("maps FORBIDDEN: trigger exceptions to 403", () => {
    const err = toDbError(
      pgError({ code: "P0001", message: "FORBIDDEN: is_admin cannot be changed through this route" })
    );
    expect(err.code).toBe(ApiErrorCode.FORBIDDEN);
    expect(err.status).toBe(403);
  });

  it("maps the ALREADY_PROCESSED RAISE (approve/reject_payment) to a validation error", () => {
    const err = toDbError(pgError({ code: "P0001", message: "ALREADY_PROCESSED" }));
    expect(err.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/already been processed/i);
  });

  it("maps the one-pending-payment unique index to PAYMENT_ALREADY_PENDING", () => {
    const err = toDbError(
      pgError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "idx_one_pending_payment_per_user"',
      })
    );
    expect(err.code).toBe(ApiErrorCode.PAYMENT_ALREADY_PENDING);
    expect(err.status).toBe(409);
  });

  it("maps a duplicate reference_number (23505) to a validation error", () => {
    const err = toDbError(
      pgError({ code: "23505", message: "duplicate key", details: "Key (reference_number)=(1234567890123) already exists." })
    );
    expect(err.code).toBe(ApiErrorCode.VALIDATION_ERROR);
  });

  it("maps a reference_number CHECK violation (23514) to INVALID_REFERENCE_NUMBER", () => {
    const err = toDbError(
      pgError({ code: "23514", message: 'new row violates check constraint on "reference_number"' })
    );
    expect(err.code).toBe(ApiErrorCode.INVALID_REFERENCE_NUMBER);
    expect(err.status).toBe(400);
  });

  it("maps the no_self_referral CHECK to SELF_REFERRAL", () => {
    const err = toDbError(pgError({ code: "23514", message: 'violates check constraint "no_self_referral"' }));
    expect(err.code).toBe(ApiErrorCode.SELF_REFERRAL);
  });

  it("maps a foreign_key_violation (23503) to a validation error", () => {
    const err = toDbError(pgError({ code: "23503", message: "FK violation" }));
    expect(err.code).toBe(ApiErrorCode.VALIDATION_ERROR);
  });

  it("collapses unknown Postgres errors to INTERNAL_ERROR (500)", () => {
    const err = toDbError(pgError({ code: "XX000", message: "internal pg detail leak" }));
    expect(err.code).toBe(ApiErrorCode.INTERNAL_ERROR);
    expect(err.status).toBe(500);
    // raw message must NOT leak into the client-facing message
    expect(err.message).not.toContain("internal pg detail leak");
  });

  // --- M1: sentinels are matched on `message` only, never `details` ----------
  it("does NOT mis-map when a sentinel only appears in the error details (M1)", () => {
    // A normal unique violation whose details happen to echo a sentinel-looking
    // value must still map by SQLSTATE — not to the ALREADY_PROCESSED message.
    const err = toDbError(
      pgError({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key (note)=(ALREADY_PROCESSED) already exists.",
      })
    );
    expect(err.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(err.message).not.toMatch(/already been processed/i);
  });
});

// --- H1: 500-class DB failures are logged server-side ------------------------
describe("toDbError logging (H1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the raw Postgres error on the unknown/default branch", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    toDbError(pgError({ code: "XX000", message: "boom", details: "stack" }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it("logs the raw error for USER_NOT_FOUND (maps to INTERNAL_ERROR)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = toDbError(pgError({ code: "P0001", message: "USER_NOT_FOUND: no profile with id x" }));
    expect(err.code).toBe(ApiErrorCode.INTERNAL_ERROR);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("does NOT log expected 4xx mappings", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    toDbError(pgError({ code: "P0001", message: "INSUFFICIENT_CREDITS" }));
    toDbError(pgError({ code: "23505", message: "dup", details: "reference_number" }));
    expect(spy).not.toHaveBeenCalled();
  });
});
