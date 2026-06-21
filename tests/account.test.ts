import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccount } from "@/lib/db/account";
import { ApiErrorCode } from "@/lib/contracts";
import type { QueryResult } from "./helpers/supabase-mock";

const mockedCreateAdmin = vi.mocked(createAdminClient);

beforeEach(() => {
  mockedCreateAdmin.mockReset();
});

describe("deleteAccount", () => {
  function clientWithRpcAndAuth(
    rpcResult: QueryResult,
    deleteUserResult: { error: { message: string } | null }
  ) {
    const rpc = vi.fn().mockResolvedValue(rpcResult);
    const deleteUser = vi.fn().mockResolvedValue(deleteUserResult);
    mockedCreateAdmin.mockReturnValue({
      rpc,
      auth: { admin: { deleteUser } },
    } as unknown as ReturnType<typeof createAdminClient>);
    return { rpc, deleteUser };
  }

  it("calls prepare_account_deletion then auth.admin.deleteUser", async () => {
    const { rpc, deleteUser } = clientWithRpcAndAuth({ data: null, error: null }, { error: null });

    await deleteAccount("u1");

    expect(rpc).toHaveBeenCalledWith("prepare_account_deletion", { p_user_id: "u1" });
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("throws a DbError when prepare_account_deletion fails", async () => {
    clientWithRpcAndAuth({ data: null, error: { code: "P0001", message: "boom" } }, { error: null });
    await expect(deleteAccount("u1")).rejects.toThrow();
  });

  it("throws an INTERNAL_ERROR DbError when auth.admin.deleteUser fails", async () => {
    clientWithRpcAndAuth({ data: null, error: null }, { error: { message: "auth boom" } });
    await expect(deleteAccount("u1")).rejects.toMatchObject({
      code: ApiErrorCode.INTERNAL_ERROR,
    });
  });
});
