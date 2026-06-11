import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { listUsers, grantCreditsAsAdmin, listAuditLog } from "@/lib/db/admin";
import { SubscriptionTier } from "@/lib/contracts";
import { queryBuilder, fakeClient } from "./helpers/supabase-mock";

const mockedCreateAdmin = vi.mocked(createAdminClient);

function clientWithRpc(rpc: ReturnType<typeof vi.fn>) {
  mockedCreateAdmin.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);
}

beforeEach(() => mockedCreateAdmin.mockReset());

describe("listUsers", () => {
  it("returns the user rows newest-first, capped at 50", async () => {
    const rows = [
      {
        id: "u1",
        email: "alice@example.com",
        full_name: "Alice",
        subscription_tier: SubscriptionTier.FREE,
        token_balance: 5,
        is_admin: false,
        created_at: new Date().toISOString(),
      },
    ];
    const builder = queryBuilder({ data: rows, error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);

    await expect(listUsers()).resolves.toEqual(rows);

    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(50);
    // no search term → no email filter applied
    expect(builder.ilike).not.toHaveBeenCalled();
  });

  it("filters by email substring when a search term is given", async () => {
    const builder = queryBuilder({ data: [], error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);

    await listUsers("alice");

    expect(builder.ilike).toHaveBeenCalledWith("email", "%alice%");
  });

  it("returns an empty array when there are no users", async () => {
    const builder = queryBuilder({ data: null, error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);
    await expect(listUsers()).resolves.toEqual([]);
  });
});

describe("grantCreditsAsAdmin", () => {
  it("calls admin_grant_credits RPC and returns the new balance", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 25, error: null });
    clientWithRpc(rpc);

    await expect(grantCreditsAsAdmin("admin-1", "user-9", 10, "bonus")).resolves.toBe(25);
    expect(rpc).toHaveBeenCalledWith("admin_grant_credits", {
      p_admin_id: "admin-1",
      p_target_user_id: "user-9",
      p_amount: 10,
      p_notes: "bonus",
    });
  });

  it("passes null notes when omitted", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 5, error: null });
    clientWithRpc(rpc);
    await grantCreditsAsAdmin("admin-1", "user-9", 5);
    expect(rpc).toHaveBeenCalledWith("admin_grant_credits", {
      p_admin_id: "admin-1",
      p_target_user_id: "user-9",
      p_amount: 5,
      p_notes: null,
    });
  });

  it("propagates a DbError when the RPC fails", async () => {
    clientWithRpc(vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "boom" } }));
    await expect(grantCreditsAsAdmin("admin-1", "user-9", 5)).rejects.toThrow();
  });
});

describe("listAuditLog", () => {
  it("flattens the joined admin/target/payment fields", async () => {
    const row = {
      id: "log-1",
      admin_id: "admin-1",
      payment_id: "pay-1",
      target_user_id: "user-9",
      credits_amount: 10,
      action: "credit_grant",
      notes: "bonus",
      created_at: new Date().toISOString(),
      admin: { email: "admin@example.com" },
      target: { email: "user@example.com" },
      payment: { reference_number: "1234567890123" },
    };
    const builder = queryBuilder({ data: [row], error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);

    const result = await listAuditLog();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "log-1",
      adminEmail: "admin@example.com",
      targetUserEmail: "user@example.com",
      paymentReference: "1234567890123",
    });
    expect("admin" in result[0]).toBe(false);
    expect("target" in result[0]).toBe(false);
    expect("payment" in result[0]).toBe(false);
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(50);
  });

  it("nulls out joined fields when there's no related row", async () => {
    const row = {
      id: "log-2",
      admin_id: null,
      payment_id: null,
      target_user_id: "user-9",
      credits_amount: null,
      action: "account_deleted",
      notes: "Self-service account deletion",
      created_at: new Date().toISOString(),
      admin: null,
      target: { email: "user@example.com" },
      payment: null,
    };
    const builder = queryBuilder({ data: [row], error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);

    const result = await listAuditLog();

    expect(result[0]).toMatchObject({
      adminEmail: null,
      targetUserEmail: "user@example.com",
      paymentReference: null,
    });
  });

  it("returns an empty array when there are no actions", async () => {
    const builder = queryBuilder({ data: null, error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);
    await expect(listAuditLog()).resolves.toEqual([]);
  });
});
