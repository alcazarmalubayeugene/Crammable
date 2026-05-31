import {
  ApiErrorCode,
  type ApiFailResponse,
  type ApiResponse,
  UIMessages,
} from "@/lib/contracts";

export function apiFail(
  code: (typeof ApiErrorCode)[keyof typeof ApiErrorCode],
  message: string,
  status: number,
): Response {
  const body: ApiFailResponse = { success: false, error: { code, message } };
  return Response.json(body, { status });
}

export function apiSuccess<T extends Record<string, unknown>>(
  payload: T,
  status = 200,
): Response {
  const body = { success: true as const, ...payload };
  return Response.json(body, { status });
}

export function jsonResponse<T>(body: ApiResponse<T>, status: number): Response {
  return Response.json(body, { status });
}

export function genericInternalError(): Response {
  return apiFail(ApiErrorCode.INTERNAL_ERROR, UIMessages.genericError, 500);
}
