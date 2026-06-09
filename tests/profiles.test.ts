import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSessionClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateOwnProfile, getProfileIdByReferralCode } from "@/lib/db/profiles";
import { queryBuilder, fakeClient } from "./helpers/supabase-mock";

const mockedCreateSession = vi.mocked(createSessionClient);
const mockedCreateAdmin = vi.mocked(createAdminClient);

beforeEach(() => {
  mockedCreateSession.mockReset();
  mockedCreateAdmin.mockReset();
});

describe("updateOwnProfile (C1 whitelist)", () => {
  it("forwards only whitelisted columns and drops privileged keys like token_balance", async () => {
    const builder = queryBuilder({ data: { id: "u1", full_name: "Ada" }, error: null });
    mockedCreateSession.mockResolvedValue(
      fakeClient(builder) as unknown as Awaited<ReturnType<typeof createSessionClient>>
    );

    // Simulate a careless route forwarding an unvalidated body (cast past the
    // type guard) — token_balance / is_admin must NOT reach the DB.
    await updateOwnProfile("u1", {
      full_name: "Ada",
      token_balance: 999999,
      is_admin: true,
    } as unknown as Parameters<typeof updateOwnProfile>[1]);

    expect(builder.update).toHaveBeenCalledTimes(1);
    expect(builder.update).toHaveBeenCalledWith({ full_name: "Ada" });
    const payload = builder.update.mock.calls[0][0];
    expect(payload).not.toHaveProperty("token_balance");
    expect(payload).not.toHaveProperty("is_admin");
  });

  it("omits undefined fields entirely", async () => {
    const builder = queryBuilder({ data: { id: "u1" }, error: null });
    mockedCreateSession.mockResolvedValue(
      fakeClient(builder) as unknown as Awaited<ReturnType<typeof createSessionClient>>
    );

    await updateOwnProfile("u1", { consent_deepseek: true });
    expect(builder.update).toHaveBeenCalledWith({ consent_deepseek: true });
  });
});

describe("getProfileIdByReferralCode (C2 PII)", () => {
  it("selects only the id column and returns just the id", async () => {
    const builder = queryBuilder({ data: { id: "referrer-1" }, error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);

    await expect(getProfileIdByReferralCode("ABCD1234")).resolves.toBe("referrer-1");
    expect(builder.select).toHaveBeenCalledWith("id");
  });

  it("returns null when the code matches no one", async () => {
    const builder = queryBuilder({ data: null, error: null });
    mockedCreateAdmin.mockReturnValue(fakeClient(builder) as unknown as ReturnType<typeof createAdminClient>);
    await expect(getProfileIdByReferralCode("NOPE0000")).resolves.toBeNull();
  });
});
