import { ApiErrorCode } from "@/lib/contracts";
import { dbError } from "@/lib/db/errors";

/**
 * Lightweight write-path guards for the data-access layer.
 *
 * These enforce the length/count limits from contracts.Validation as a
 * defense-in-depth backstop: routes will also validate with Zod (#4+), but the
 * layer is the last gate before the DB and the live schema carries no matching
 * CHECK constraints. Call them BEFORE creating a Supabase client so they fail
 * fast (and stay trivially unit-testable without a client mock).
 *
 * Both throw DbError(VALIDATION_ERROR, 400) so they flow through handleApiError
 * like every other layer error.
 */

/** Reject when a (non-null) string exceeds `max` characters. */
export function ensureMaxLength(
  value: string | null | undefined,
  max: number,
  field: string
): void {
  if (value != null && value.length > max) {
    throw dbError(
      ApiErrorCode.VALIDATION_ERROR,
      `${field} must be ${max} characters or fewer.`
    );
  }
}

/** Reject when an array has more than `max` items. */
export function ensureMaxItems(
  items: readonly unknown[],
  max: number,
  field: string
): void {
  if (items.length > max) {
    throw dbError(
      ApiErrorCode.VALIDATION_ERROR,
      `${field} must have ${max} or fewer items.`
    );
  }
}
