import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, enforceRateLimit } from "@/lib/db/rate-limit";
import { DbError } from "@/lib/db/errors";
import { ApiErrorCode, ApiPaths, RateLimits } from "@/lib/contracts";

const mockedCreateAdmin = vi.mocked(createAdminClient);

function clientWithRpc(rpc: ReturnType<typeof vi.fn>) {
  mockedCreateAdmin.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);
}

beforeEach(() => {
  mockedCreateAdmin.mockReset();
});

describe("checkRateLimit", () => {
  it("short-circuits to unlimited when the endpoint has no rule", async () => {
    const result = await checkRateLimit("u1", "/api/no-such-endpoint");
    // MAX_SAFE_INTEGER, not Infinity — Infinity serializes to null in JSON.
    expect(result).toEqual({ allowed: true, remaining: Number.MAX_SAFE_INTEGER });
    expect(Number.isFinite(result.remaining)).toBe(true);
    expect(mockedCreateAdmin).not.toHaveBeenCalled();
  });

  it("calls check_rate_limit with the endpoint's RateLimits rule and unwraps the row", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ allowed: true, remaining: 1 }], error: null });
    clientWithRpc(rpc);

    const result = await checkRateLimit("u1", ApiPaths.generate);

    expect(result).toEqual({ allowed: true, remaining: 1 });
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_user_id: "u1",
      p_endpoint: ApiPaths.generate,
      p_window_minutes: RateLimits[ApiPaths.generate].windowMinutes,
      p_max_requests: RateLimits[ApiPaths.generate].maxRequests,
    });
  });

  it("throws a DbError when the RPC errors", async () => {
    clientWithRpc(vi.fn().mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } }));
    await expect(checkRateLimit("u1", ApiPaths.generate)).rejects.toBeInstanceOf(DbError);
  });
});

describe("enforceRateLimit", () => {
  it("returns remaining when allowed", async () => {
    clientWithRpc(vi.fn().mockResolvedValue({ data: [{ allowed: true, remaining: 3 }], error: null }));
    await expect(enforceRateLimit("u1", ApiPaths.generate)).resolves.toBe(3);
  });

  it("throws RATE_LIMITED (429) when the cap is exceeded", async () => {
    clientWithRpc(vi.fn().mockResolvedValue({ data: [{ allowed: false, remaining: 0 }], error: null }));
    await expect(enforceRateLimit("u1", ApiPaths.generate)).rejects.toMatchObject({
      code: ApiErrorCode.RATE_LIMITED,
      status: 429,
    });
  });
});
