import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiErrorCode, QuizType, TableNames } from "@/lib/contracts";
import {
  adminClient,
  apiFetch,
  createCardAs,
  createDeckAs,
  createTestUser,
  deleteTestUser,
  sessionCookieHeader,
  type TestUser,
} from "./helpers";

/**
 * HTTP-level route tests against the REAL Supabase project + a running Next
 * production server (`npm run test:http`). These cover the security properties
 * enforced at the ROUTE layer — which neither the Supabase-mocked unit suite nor
 * the RLS-focused integration suite (`test:int`) can verify:
 *
 *   - The IDOR fix: a deck's flashcards WITH CHECK only validates
 *     `user_id = auth.uid()`, so the DB alone would let user B attach a card to
 *     user A's deck. It's the owner-scoped `getDeckById(id, user.id)` in the
 *     handlers that blocks this — only an authenticated HTTP request proves it.
 *   - The CSRF same-origin check (`assertSameOrigin`).
 *   - The `ApiResponse<T>` envelope + real `ApiErrorCode` on success and failure.
 *
 * Like the integration suite, this creates and deletes its own throwaway users
 * and never touches real data.
 */

const admin = adminClient();

let userA: TestUser;
let userB: TestUser;
let cookieA: string;
let cookieB: string;
let deckId: string;

async function cardCount(deck: string): Promise<number> {
  const { count } = await admin
    .from(TableNames.flashcards)
    .select("id", { count: "exact", head: true })
    .eq("deck_id", deck);
  return count ?? 0;
}

beforeAll(async () => {
  [userA, userB] = await Promise.all([createTestUser("http-a"), createTestUser("http-b")]);
  [cookieA, cookieB] = await Promise.all([
    sessionCookieHeader(userA.email, userA.password),
    sessionCookieHeader(userB.email, userB.password),
  ]);

  const deck = await createDeckAs(userA, "A's HTTP-test deck");
  deckId = deck.id;
  // A few cards so quiz-start has something to build from (it never gets that far
  // for B, but keeps the deck realistic).
  await Promise.all([
    createCardAs(userA, deckId, "Q1", "A1"),
    createCardAs(userA, deckId, "Q2", "A2"),
    createCardAs(userA, deckId, "Q3", "A3"),
    createCardAs(userA, deckId, "Q4", "A4"),
  ]);
});

afterAll(async () => {
  await Promise.all([deleteTestUser(userA), deleteTestUser(userB)]);
});

describe("auth gate", () => {
  it("an unauthenticated request to a protected API route returns 401 UNAUTHORIZED", async () => {
    const res = await apiFetch(`/api/decks/${deckId}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe(ApiErrorCode.UNAUTHORIZED);
  });
});

describe("IDOR — route-layer ownership guards (not enforced by RLS alone)", () => {
  it("user B cannot add a flashcard to user A's deck", async () => {
    const before = await cardCount(deckId);

    const res = await apiFetch(`/api/decks/${deckId}/flashcards`, {
      method: "POST",
      cookie: cookieB,
      json: { front: "injected", back: "by B" },
    });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe(ApiErrorCode.FORBIDDEN);
    // The guard's whole point: no row was created on A's deck.
    expect(await cardCount(deckId)).toBe(before);
  });

  it("user B cannot start a quiz on user A's deck", async () => {
    const res = await apiFetch(`/api/quiz/${deckId}`, {
      method: "POST",
      cookie: cookieB,
      json: { quizType: QuizType.MIXED },
    });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe(ApiErrorCode.FORBIDDEN);
  });

  it("user B cannot make user A's deck public (share)", async () => {
    const res = await apiFetch(`/api/decks/${deckId}/share`, {
      method: "POST",
      cookie: cookieB,
    });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe(ApiErrorCode.FORBIDDEN);

    const { data } = await admin
      .from(TableNames.decks)
      .select("is_public")
      .eq("id", deckId)
      .single();
    expect(data?.is_public).toBe(false); // still private
  });

  it("user B cannot rename user A's deck", async () => {
    const res = await apiFetch(`/api/decks/${deckId}`, {
      method: "PATCH",
      cookie: cookieB,
      json: { title: "hacked by B" },
    });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe(ApiErrorCode.FORBIDDEN);

    const { data } = await admin
      .from(TableNames.decks)
      .select("title")
      .eq("id", deckId)
      .single();
    expect(data?.title).toBe("A's HTTP-test deck"); // unchanged
  });

  it("user B cannot delete user A's deck", async () => {
    const res = await apiFetch(`/api/decks/${deckId}`, {
      method: "DELETE",
      cookie: cookieB,
    });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe(ApiErrorCode.FORBIDDEN);

    const { data } = await admin
      .from(TableNames.decks)
      .select("id")
      .eq("id", deckId)
      .maybeSingle();
    expect(data?.id).toBe(deckId); // still exists
  });
});

describe("CSRF — cross-origin mutating request is blocked before the handler runs", () => {
  it("a cross-origin POST is rejected with 403 FORBIDDEN, even with a valid session", async () => {
    const before = await cardCount(deckId);

    // A's OWN deck + A's valid cookies, but a foreign Origin — the only thing
    // under test is assertSameOrigin, which runs first.
    const res = await apiFetch(`/api/decks/${deckId}/flashcards`, {
      method: "POST",
      cookie: cookieA,
      origin: "http://evil.example.com",
      json: { front: "csrf", back: "attempt" },
    });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe(ApiErrorCode.FORBIDDEN);
    expect(await cardCount(deckId)).toBe(before); // nothing written
  });
});

describe("ApiResponse envelope conformance", () => {
  it("a successful authenticated GET returns { success: true, ... }", async () => {
    const res = await apiFetch(`/api/decks/${deckId}`, { cookie: cookieA });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeUndefined();
  });
});
