import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { listPendingPayments, approvePayment, rejectPayment } from "@/lib/db/admin";
import { ApiErrorCode, PaymentStatus, SubscriptionTier } from "@/lib/contracts";
import { queryBuilder, fakeClient } from "./helpers/supabase-mock";

const mockedCreateAdmin = vi.mocked(createAdminClient);

function clientWithRpc(rpc: ReturnType<typeof vi.fn>) {
  mockedCreateAdmin.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);
}

beforeEach(() => mockedCreateAdmin.mockReset());

describe("listPendingPayments", () => {
  it("flattens the joined email and computes minutesSinceSubmission", async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const row = {
      id: "pay-1",
      user_id: "u1",
      reference_number: "1234567890123",
      amount: 150,
      payment_method: "gcash",
      status: PaymentStatus.PENDING,
      created_at: tenMinAgo,
      user: { email: "student@example.com" },
    };
    const builder = queryBuilder({ data: [row], error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);

    const result = await listPendingPayments();

    expect(result).toHaveLength(1);
    expect(result[0].userEmail).toBe("student@example.com");
    expect(result[0].minutesSinceSubmission).toBeGreaterThanOrEqual(9);
    expect(result[0].minutesSinceSubmission).toBeLessThanOrEqual(11);
    // the nested `user` join object must be stripped from the flattened row
    expect("user" in result[0]).toBe(false);
    // only pending rows are requested
    expect(builder.eq).toHaveBeenCalledWith("status", PaymentStatus.PENDING);
  });

  it("returns an empty array when there are no pending payments", async () => {
    const builder = queryBuilder({ data: [], error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);
    await expect(listPendingPayments()).resolves.toEqual([]);
  });
});

describe("approvePayment", () => {
  it("calls approve_payment RPC and returns the upgraded user id + Pro tier", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "user-9", error: null });
    clientWithRpc(rpc);

    await expect(approvePayment("admin-1", "pay-1", "looks good")).resolves.toEqual({
      userId: "user-9",
      newTier: SubscriptionTier.PRO,
    });
    expect(rpc).toHaveBeenCalledWith("approve_payment", {
      p_admin_id: "admin-1",
      p_payment_id: "pay-1",
      p_notes: "looks good",
    });
  });

  it("passes null notes when omitted", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "user-9", error: null });
    clientWithRpc(rpc);
    await approvePayment("admin-1", "pay-1");
    expect(rpc).toHaveBeenCalledWith("approve_payment", {
      p_admin_id: "admin-1",
      p_payment_id: "pay-1",
      p_notes: null,
    });
  });

  it("maps the ALREADY_PROCESSED RAISE to a validation error", async () => {
    clientWithRpc(vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "ALREADY_PROCESSED" } }));
    await expect(approvePayment("admin-1", "pay-1")).rejects.toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
      status: 400,
    });
  });
});

describe("rejectPayment", () => {
  it("calls reject_payment RPC with the reason and returns the user id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "user-9", error: null });
    clientWithRpc(rpc);

    await expect(rejectPayment("admin-1", "pay-1", "blurry screenshot")).resolves.toEqual({
      userId: "user-9",
    });
    expect(rpc).toHaveBeenCalledWith("reject_payment", {
      p_admin_id: "admin-1",
      p_payment_id: "pay-1",
      p_reason: "blurry screenshot",
      p_notes: null,
    });
  });
});
