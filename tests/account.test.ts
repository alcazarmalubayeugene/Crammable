import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSessionClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exportAccountData, deleteAccount } from "@/lib/db/account";
import { ApiErrorCode, TableNames } from "@/lib/contracts";
import { queryBuilder, type QueryResult } from "./helpers/supabase-mock";

const mockedCreateSession = vi.mocked(createSessionClient);
const mockedCreateAdmin = vi.mocked(createAdminClient);

beforeEach(() => {
  mockedCreateSession.mockReset();
  mockedCreateAdmin.mockReset();
});

/** A `from()` mock that hands back a different builder/result per table name. */
function sessionClientWithTables(resultsByTable: Record<string, QueryResult>) {
  const builders: Record<string, ReturnType<typeof queryBuilder>> = {};
  for (const [table, result] of Object.entries(resultsByTable)) {
    builders[table] = queryBuilder(result);
  }
  return {
    from: vi.fn((table: string) => builders[table]),
  };
}

describe("exportAccountData", () => {
  it("gathers every owned table into one export bundle", async () => {
    const profile = { id: "u1", email: "alice@example.com" };
    const decks = [{ id: "d1", user_id: "u1" }];
    const flashcards = [{ id: "f1", user_id: "u1" }];
    const quizSessions = [{ id: "q1", user_id: "u1" }];
    const paymentSubmissions = [{ id: "p1", user_id: "u1" }];
    const referralEvents = [{ id: "r1", referrer_id: "u1" }];
    const appReviews = [{ id: "ar1", user_id: "u1" }];

    const client = sessionClientWithTables({
      [TableNames.profiles]: { data: profile, error: null },
      [TableNames.decks]: { data: decks, error: null },
      [TableNames.flashcards]: { data: flashcards, error: null },
      [TableNames.quizSessions]: { data: quizSessions, error: null },
      [TableNames.paymentSubmissions]: { data: paymentSubmissions, error: null },
      [TableNames.referralEvents]: { data: referralEvents, error: null },
      [TableNames.appReviews]: { data: appReviews, error: null },
    });
    mockedCreateSession.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createSessionClient>>);

    const result = await exportAccountData("u1");

    expect(result.profile).toEqual(profile);
    expect(result.decks).toEqual(decks);
    expect(result.flashcards).toEqual(flashcards);
    expect(result.quizSessions).toEqual(quizSessions);
    expect(result.paymentSubmissions).toEqual(paymentSubmissions);
    expect(result.referralEvents).toEqual(referralEvents);
    expect(result.appReviews).toEqual(appReviews);
    expect(typeof result.exportedAt).toBe("string");
  });

  it("defaults missing rows to null/empty arrays", async () => {
    const client = sessionClientWithTables({
      [TableNames.profiles]: { data: null, error: null },
      [TableNames.decks]: { data: null, error: null },
      [TableNames.flashcards]: { data: null, error: null },
      [TableNames.quizSessions]: { data: null, error: null },
      [TableNames.paymentSubmissions]: { data: null, error: null },
      [TableNames.referralEvents]: { data: null, error: null },
      [TableNames.appReviews]: { data: null, error: null },
    });
    mockedCreateSession.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createSessionClient>>);

    const result = await exportAccountData("u1");

    expect(result.profile).toBeNull();
    expect(result.decks).toEqual([]);
    expect(result.flashcards).toEqual([]);
    expect(result.quizSessions).toEqual([]);
    expect(result.paymentSubmissions).toEqual([]);
    expect(result.referralEvents).toEqual([]);
    expect(result.appReviews).toEqual([]);
  });

  it("throws a DbError if any table query fails", async () => {
    const client = sessionClientWithTables({
      [TableNames.profiles]: { data: null, error: { code: "42501", message: "denied" } },
      [TableNames.decks]: { data: [], error: null },
      [TableNames.flashcards]: { data: [], error: null },
      [TableNames.quizSessions]: { data: [], error: null },
      [TableNames.paymentSubmissions]: { data: [], error: null },
      [TableNames.referralEvents]: { data: [], error: null },
      [TableNames.appReviews]: { data: [], error: null },
    });
    mockedCreateSession.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createSessionClient>>);

    await expect(exportAccountData("u1")).rejects.toThrow();
  });
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
