import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { deductCredit, grantCredits, checkReferralCap } from "@/lib/db/rpc";
import { DbError } from "@/lib/db/errors";
import { ApiErrorCode, ReferralEventType } from "@/lib/contracts";

const mockedCreateAdmin = vi.mocked(createAdminClient);

function clientWithRpc(rpc: ReturnType<typeof vi.fn>) {
  mockedCreateAdmin.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);
}

beforeEach(() => mockedCreateAdmin.mockReset());

describe("deductCredit", () => {
  it("calls deduct_credit and returns the new balance", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    clientWithRpc(rpc);
    await expect(deductCredit("u1")).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith("deduct_credit", { p_user_id: "u1" });
  });

  it("translates an INSUFFICIENT_CREDITS RAISE into a typed DbError", async () => {
    clientWithRpc(
      vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "INSUFFICIENT_CREDITS" } })
    );
    await expect(deductCredit("u1")).rejects.toMatchObject({
      code: ApiErrorCode.INSUFFICIENT_CREDITS,
      status: 402,
    });
  });
});

describe("grantCredits", () => {
  it("calls grant_credits with the amount and returns the new balance", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 13, error: null });
    clientWithRpc(rpc);
    await expect(grantCredits("u1", 10)).resolves.toBe(13);
    expect(rpc).toHaveBeenCalledWith("grant_credits", { p_user_id: "u1", p_amount: 10 });
  });

  it("surfaces RPC errors as DbError", async () => {
    clientWithRpc(vi.fn().mockResolvedValue({ data: null, error: { code: "XX000", message: "x" } }));
    await expect(grantCredits("u1", 10)).rejects.toBeInstanceOf(DbError);
  });
});

describe("checkReferralCap", () => {
  it("calls check_referral_cap and returns the boolean result", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    clientWithRpc(rpc);
    await expect(checkReferralCap("ref1", ReferralEventType.SIGNUP, "2026-05")).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith("check_referral_cap", {
      p_referrer_id: "ref1",
      p_event_type: ReferralEventType.SIGNUP,
      p_month_key: "2026-05",
    });
  });
});
