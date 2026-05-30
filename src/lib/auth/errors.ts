import { ApiErrorCode, type ApiFailResponse, UIMessages } from "@/lib/contracts";

/**
 * Thrown by requireAuth() and requireAdmin().
 * Caught in route handlers to produce the correct HTTP response.
 */
export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHORIZED" | "FORBIDDEN",
    public readonly status: 401 | 403
  ) {
    super(code);
    this.name = "AuthError";
  }
}

export function unauthorizedResponse(): Response {
  const body: ApiFailResponse = {
    success: false,
    error: {
      code: ApiErrorCode.UNAUTHORIZED,
      message: "Authentication required.",
    },
  };
  return Response.json(body, { status: 401 });
}

export function forbiddenResponse(): Response {
  const body: ApiFailResponse = {
    success: false,
    error: {
      code: ApiErrorCode.FORBIDDEN,
      message: "Insufficient permissions.",
    },
  };
  return Response.json(body, { status: 403 });
}

export function validationErrorResponse(message: string): Response {
  const body: ApiFailResponse = {
    success: false,
    error: {
      code: ApiErrorCode.VALIDATION_ERROR,
      message,
    },
  };
  return Response.json(body, { status: 400 });
}

export function internalErrorResponse(): Response {
  const body: ApiFailResponse = {
    success: false,
    error: {
      code: ApiErrorCode.INTERNAL_ERROR,
      message: UIMessages.genericError,
    },
  };
  return Response.json(body, { status: 500 });
}

/** Map an AuthError to the correct error Response. */
export function authErrorResponse(err: AuthError): Response {
  return err.status === 401 ? unauthorizedResponse() : forbiddenResponse();
}
