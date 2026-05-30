import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import { handleApiError, apiSuccess, failResponse } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/errors";
import { dbError } from "@/lib/db/errors";
import { ApiErrorCode } from "@/lib/contracts";

async function body(res: Response) {
  return (await res.json()) as Record<string, unknown> & {
    success: boolean;
    error?: { code: string; message: string };
  };
}

describe("handleApiError", () => {
  it("maps AuthError(UNAUTHORIZED) to a 401 fail body", async () => {
    const res = handleApiError(new AuthError("UNAUTHORIZED", 401));
    expect(res.status).toBe(401);
    const b = await body(res);
    expect(b.success).toBe(false);
    expect(b.error?.code).toBe(ApiErrorCode.UNAUTHORIZED);
  });

  it("maps AuthError(FORBIDDEN) to 403", async () => {
    const res = handleApiError(new AuthError("FORBIDDEN", 403));
    expect(res.status).toBe(403);
    expect((await body(res)).error?.code).toBe(ApiErrorCode.FORBIDDEN);
  });

  it("maps a DbError to its carried code and status", async () => {
    const res = handleApiError(dbError(ApiErrorCode.INSUFFICIENT_CREDITS, "no credits"));
    expect(res.status).toBe(402);
    const b = await body(res);
    expect(b.error?.code).toBe(ApiErrorCode.INSUFFICIENT_CREDITS);
    expect(b.error?.message).toBe("no credits");
  });

  it("maps a ZodError to 400 VALIDATION_ERROR using the first issue message", async () => {
    let zErr: ZodError;
    try {
      z.object({ referenceNumber: z.string() }).parse({});
      throw new Error("schema should have thrown");
    } catch (e) {
      zErr = e as ZodError;
    }
    const res = handleApiError(zErr);
    expect(res.status).toBe(400);
    const b = await body(res);
    expect(b.error?.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(b.error?.message).toBe(zErr.issues[0]?.message);
  });

  it("collapses unknown throwables to an opaque 500", async () => {
    const res = handleApiError(new Error("kaboom with secret stack"));
    expect(res.status).toBe(500);
    const b = await body(res);
    expect(b.error?.code).toBe(ApiErrorCode.INTERNAL_ERROR);
    expect(b.error?.message).not.toContain("secret");
  });
});

describe("apiSuccess", () => {
  it("spreads the payload next to success:true (ApiResponse<T> shape)", async () => {
    const res = apiSuccess({ deckId: "d1", creditsRemaining: 2 });
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b).toEqual({ success: true, deckId: "d1", creditsRemaining: 2 });
  });

  it("honors a custom status code", async () => {
    const res = apiSuccess({ submissionId: "s1" }, 201);
    expect(res.status).toBe(201);
  });
});

describe("failResponse", () => {
  it("builds the standard ApiFailResponse body", async () => {
    const res = failResponse(ApiErrorCode.RATE_LIMITED, "slow down", 429);
    expect(res.status).toBe(429);
    expect(await body(res)).toEqual({
      success: false,
      error: { code: ApiErrorCode.RATE_LIMITED, message: "slow down" },
    });
  });
});
