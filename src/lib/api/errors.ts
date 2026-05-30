import { ZodError } from "zod";
import { ApiErrorCode, type ApiFailResponse, UIMessages } from "@/lib/contracts";
import { AuthError, authErrorResponse } from "@/lib/auth/errors";
import { DbError } from "@/lib/db/errors";

/**
 * Single catch-all for route handlers.
 *
 * Every handler in routes 4–12 should be shaped:
 *
 *   export async function POST(request: Request) {
 *     try {
 *       const { user, profile } = await requireAuth();
 *       // ...data-access layer calls...
 *       return apiSuccess<GenerateResult>({ deckId, cards, creditsRemaining });
 *     } catch (err) {
 *       return handleApiError(err);
 *     }
 *   }
 *
 * Recognised error types:
 *   - AuthError  → 401 / 403 via the existing auth response builders
 *   - DbError    → its carried ApiErrorCode + status
 *   - ZodError   → 400 VALIDATION_ERROR with the first issue's message
 *   - anything else → 500 INTERNAL_ERROR (raw cause logged, never leaked)
 */
export function handleApiError(err: unknown): Response {
  if (err instanceof AuthError) {
    return authErrorResponse(err);
  }

  if (err instanceof DbError) {
    // 5xx-class DbErrors are server faults — log them (toDbError also logs the
    // raw Postgres cause). 4xx are expected client errors and stay quiet.
    if (err.status >= 500) {
      console.error("[handleApiError] DbError 5xx:", err.code, err.message);
    }
    return failResponse(err.code, err.message, err.status);
  }

  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "Invalid request.";
    return failResponse(ApiErrorCode.VALIDATION_ERROR, message, 400);
  }

  // Unknown / unexpected — log server-side, return an opaque 500.
  console.error("[handleApiError] Unhandled error:", err);
  return failResponse(ApiErrorCode.INTERNAL_ERROR, UIMessages.genericError, 500);
}

/** Build the standard ApiFailResponse body with the correct status code. */
export function failResponse(
  code: ApiErrorCode,
  message: string,
  status: number
): Response {
  const body: ApiFailResponse = { success: false, error: { code, message } };
  return Response.json(body, { status });
}

/**
 * Build a success response matching ApiResponse<T>.
 *
 * The result payload `T` is spread alongside `success: true`, exactly as the
 * contracts.ts ApiResponse<T> shape requires — so the client reads response
 * fields directly (e.g. `res.deckId`), not a nested `data` object.
 */
export function apiSuccess<T extends object>(data: T, status: number = 200): Response {
  return Response.json({ success: true, ...data }, { status });
}
