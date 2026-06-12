import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SubscriptionTier, TableNames } from "@/lib/contracts";
import {
  adminClient,
  anonClient,
  createCardAs,
  createDeckAs,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

/**
 * Integration tests against the REAL Supabase project (`npm run test:int`).
 *
 * These verify the security properties enforced by the DATABASE — RLS policies,
 * the privilege/immutable triggers, and the EXECUTE lockdown on privileged
 * functions — which the Supabase-mocked unit tests cannot cover.
 *
 * Scope note: the IDOR fix on the share / flashcard-create / quiz-start routes is
 * enforced at the *route* layer (the owner-scoped `getDeckById`), not by RLS — a
 * raw client CAN attach a B-owned flashcard to A's deck because the flashcards
 * WITH CHECK only validates `user_id = auth.uid()`. That route behaviour needs an
 * HTTP-level test (a running server); it is intentionally out of scope here.
 * These tests cover everything the DB itself guarantees.
 */

const admin = adminClient();
const anon = anonClient();

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
  [userA, userB] = await Promise.all([createTestUser("a"), createTestUser("b")]);
});

afterAll(async () => {
  await Promise.all([deleteTestUser(userA), deleteTestUser(userB)]);
});

describe("provisioning (handle_new_user trigger)", () => {
  it("auto-creates a profile with starting credits, a referral code, free tier, non-admin", async () => {
    const { data, error } = await admin
      .from(TableNames.profiles)
      .select("token_balance, referral_code, subscription_tier, is_admin")
      .eq("id", userA.id)
      .single();

    expect(error).toBeNull();
    expect(data!.token_balance).toBeGreaterThan(0);
    expect(String(data!.referral_code)).toHaveLength(8);
    expect(data!.subscription_tier).toBe(SubscriptionTier.FREE);
    expect(data!.is_admin).toBe(false);
  });
});

describe("RLS: deck ownership isolation", () => {
  it("a user cannot read another user's private deck (and anon cannot either)", async () => {
    const deck = await createDeckAs(userA, "A private deck");

    // Owner sees it.
    const own = await userA.client.from(TableNames.decks).select("id").eq("id", deck.id).maybeSingle();
    expect(own.data?.id).toBe(deck.id);

    // Other user does NOT.
    const cross = await userB.client.from(TableNames.decks).select("id").eq("id", deck.id).maybeSingle();
    expect(cross.data).toBeNull();

    // Anon does NOT.
    const pub = await anon.from(TableNames.decks).select("id").eq("id", deck.id).maybeSingle();
    expect(pub.data).toBeNull();
  });
});

describe("RLS: public decks (B5) are cross-user READABLE but still owner-WRITABLE only", () => {
  it("anyone can read a public deck; only the owner can rename / unpublish / delete it", async () => {
    const deck = await createDeckAs(userA, "A public deck", true);

    // Cross-user + anon can now read it.
    const crossRead = await userB.client.from(TableNames.decks).select("id, title").eq("id", deck.id).maybeSingle();
    expect(crossRead.data?.id).toBe(deck.id);
    const anonRead = await anon.from(TableNames.decks).select("id").eq("id", deck.id).maybeSingle();
    expect(anonRead.data?.id).toBe(deck.id);

    // B cannot rename A's public deck (RLS UPDATE is owner-only → 0 rows).
    await userB.client.from(TableNames.decks).update({ title: "hacked" }).eq("id", deck.id);
    // B cannot unpublish it.
    await userB.client.from(TableNames.decks).update({ is_public: false }).eq("id", deck.id);
    // B cannot delete it.
    await userB.client.from(TableNames.decks).delete().eq("id", deck.id);

    // Verify (service role) nothing changed.
    const after = await admin
      .from(TableNames.decks)
      .select("title, is_public")
      .eq("id", deck.id)
      .single();
    expect(after.error).toBeNull();
    expect(after.data!.title).toBe("A public deck");
    expect(after.data!.is_public).toBe(true);
  });

  it("flashcards of a public deck are readable cross-user but not editable/deletable cross-user", async () => {
    const deck = await createDeckAs(userA, "A public deck w/ cards", true);
    const card = await createCardAs(userA, deck.id, "front-A", "back-A");

    // B can read the card (public-deck flashcard policy).
    const read = await userB.client.from(TableNames.flashcards).select("id, front").eq("id", card.id).maybeSingle();
    expect(read.data?.id).toBe(card.id);

    // B cannot edit or delete A's card.
    await userB.client.from(TableNames.flashcards).update({ front: "tampered" }).eq("id", card.id);
    await userB.client.from(TableNames.flashcards).delete().eq("id", card.id);

    const after = await admin.from(TableNames.flashcards).select("front").eq("id", card.id).single();
    expect(after.error).toBeNull();
    expect(after.data!.front).toBe("front-A");
  });

  it("a user cannot read flashcards of another user's PRIVATE deck", async () => {
    const deck = await createDeckAs(userA, "A private deck w/ cards", false);
    const card = await createCardAs(userA, deck.id);

    const cross = await userB.client.from(TableNames.flashcards).select("id").eq("id", card.id).maybeSingle();
    expect(cross.data).toBeNull();
  });
});

describe("triggers: privilege escalation + immutable profile fields are blocked", () => {
  it("a user cannot grant themselves admin or Pro", async () => {
    const adminAttempt = await userA.client
      .from(TableNames.profiles)
      .update({ is_admin: true })
      .eq("id", userA.id);
    expect(adminAttempt.error).not.toBeNull();

    const proAttempt = await userA.client
      .from(TableNames.profiles)
      .update({ subscription_tier: SubscriptionTier.PRO })
      .eq("id", userA.id);
    expect(proAttempt.error).not.toBeNull();

    const check = await admin
      .from(TableNames.profiles)
      .select("is_admin, subscription_tier")
      .eq("id", userA.id)
      .single();
    expect(check.data!.is_admin).toBe(false);
    expect(check.data!.subscription_tier).toBe(SubscriptionTier.FREE);
  });

  it("a user cannot inflate their own token_balance or change referral_code", async () => {
    const balanceAttempt = await userA.client
      .from(TableNames.profiles)
      .update({ token_balance: 999999 })
      .eq("id", userA.id);
    expect(balanceAttempt.error).not.toBeNull();

    const codeAttempt = await userA.client
      .from(TableNames.profiles)
      .update({ referral_code: "HACKHACK" })
      .eq("id", userA.id);
    expect(codeAttempt.error).not.toBeNull();
  });
});

describe("EXECUTE lockdown: privileged SECURITY DEFINER functions reject authenticated callers", () => {
  it("authenticated cannot call grant_credits / deduct_credit / approve_payment directly", async () => {
    const grant = await userA.client.rpc("grant_credits", { p_user_id: userA.id, p_amount: 999999 });
    expect(grant.error).not.toBeNull();

    const deduct = await userA.client.rpc("deduct_credit", { p_user_id: userB.id });
    expect(deduct.error).not.toBeNull();

    const approve = await userA.client.rpc("approve_payment", {
      p_payment_id: userA.id, // any uuid — call must be rejected before it runs
      p_admin_id: userA.id,
      p_notes: null,
    });
    expect(approve.error).not.toBeNull();

    // Balance unchanged by the rejected grant.
    const bal = await admin.from(TableNames.profiles).select("token_balance").eq("id", userA.id).single();
    expect(bal.data!.token_balance).toBeLessThanOrEqual(3);
  });
});

describe("atomic credit economy (create_deck_with_cards_and_charge)", () => {
  it("debits exactly one credit on success and refuses when the balance is 0", async () => {
    // Reset A's balance to a known value via service role (bypasses the immutable trigger).
    await admin.from(TableNames.profiles).update({ token_balance: 2 }).eq("id", userA.id);

    const ok = await userA.client.rpc("create_deck_with_cards_and_charge", {
      p_user_id: userA.id,
      p_title: "Charged deck",
      p_source_filename: null,
      p_generation_mode: "standard",
      p_pdf_type: "text",
      p_cards: [{ front: "f", back: "b", tags: [], category: "General" }],
    });
    expect(ok.error).toBeNull();
    const row = Array.isArray(ok.data) ? ok.data[0] : ok.data;
    expect(Number(row.credits_remaining)).toBe(1);

    const afterCharge = await admin
      .from(TableNames.profiles)
      .select("token_balance")
      .eq("id", userA.id)
      .single();
    expect(afterCharge.data!.token_balance).toBe(1);

    // Drain to 0, then the next charge must fail (and create no deck).
    await admin.from(TableNames.profiles).update({ token_balance: 0 }).eq("id", userA.id);
    const decksBefore = await admin
      .from(TableNames.decks)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userA.id);

    const broke = await userA.client.rpc("create_deck_with_cards_and_charge", {
      p_user_id: userA.id,
      p_title: "Should not persist",
      p_source_filename: null,
      p_generation_mode: "standard",
      p_pdf_type: "text",
      p_cards: [{ front: "f", back: "b", tags: [], category: "General" }],
    });
    expect(broke.error).not.toBeNull();

    const decksAfter = await admin
      .from(TableNames.decks)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userA.id);
    expect(decksAfter.count).toBe(decksBefore.count); // rolled back — no orphan deck
  });
});

describe("RLS: payment submissions are private to the submitter", () => {
  it("one pending submission per user is enforced and B cannot read A's payment", async () => {
    const first = await userA.client
      .from(TableNames.paymentSubmissions)
      .insert({ user_id: userA.id, reference_number: "1234567890123", amount: 150, payment_method: "gcash" })
      .select("id")
      .single();
    expect(first.error).toBeNull();

    // Second pending submission for the same user is blocked by the unique partial index.
    const second = await userA.client
      .from(TableNames.paymentSubmissions)
      .insert({ user_id: userA.id, reference_number: "1234567890999", amount: 150, payment_method: "gcash" })
      .select("id")
      .single();
    expect(second.error).not.toBeNull();

    // B cannot read A's submission.
    const cross = await userB.client
      .from(TableNames.paymentSubmissions)
      .select("id")
      .eq("id", first.data!.id)
      .maybeSingle();
    expect(cross.data).toBeNull();
  });
});
