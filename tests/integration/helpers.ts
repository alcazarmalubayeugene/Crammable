import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { TableNames } from "@/lib/contracts";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

const NO_PERSIST = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

/** Service-role client — bypasses RLS. Used only for setup/teardown/assertions. */
export function adminClient(): SupabaseClient {
  return createClient(url(), serviceKey(), NO_PERSIST);
}

/** Unauthenticated anon-key client — RLS applies as the `anon` role. */
export function anonClient(): SupabaseClient {
  return createClient(url(), anonKey(), NO_PERSIST);
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** Anon-key client signed in AS this user — RLS applies as `authenticated`/this uid. */
  client: SupabaseClient;
}

/**
 * Create a confirmed throwaway auth user (admin API, no email sent), wait for
 * the handle_new_user trigger to provision its profile, and return a client
 * already signed in as that user. Always pair with deleteTestUser() in afterAll.
 */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `inttest+${label}-${randomUUID().slice(0, 8)}@crammable-inttest.dev`;
  const password = `Pw-${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const id = data.user.id;

  await waitForProfile(admin, id);

  const client = createClient(url(), anonKey(), NO_PERSIST);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signInWithPassword failed: ${signInError.message}`);

  return { id, email, password, client };
}

/** Delete a test user (cascades through profiles → decks → flashcards → …). */
export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  try {
    await adminClient().auth.admin.deleteUser(user.id);
  } catch {
    /* best-effort cleanup */
  }
}

async function waitForProfile(admin: SupabaseClient, id: string, tries = 30): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const { data } = await admin.from(TableNames.profiles).select("id").eq("id", id).maybeSingle();
    if (data) return;
    await sleep(150);
  }
  throw new Error(`profile was not provisioned for user ${id} (handle_new_user trigger?)`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Insert a deck as `user` (session client, RLS). Returns the created row. */
export async function createDeckAs(
  user: TestUser,
  title: string,
  isPublic = false,
): Promise<{ id: string; title: string; is_public: boolean; user_id: string }> {
  const { data, error } = await user.client
    .from(TableNames.decks)
    .insert({ user_id: user.id, title, generation_mode: "standard", pdf_type: "text", is_public: isPublic })
    .select("id, title, is_public, user_id")
    .single();
  if (error || !data) throw new Error(`createDeckAs failed: ${error?.message}`);
  return data as { id: string; title: string; is_public: boolean; user_id: string };
}

/** Insert a flashcard as `user` into one of their own decks. */
export async function createCardAs(
  user: TestUser,
  deckId: string,
  front = "Q",
  back = "A",
): Promise<{ id: string }> {
  const { data, error } = await user.client
    .from(TableNames.flashcards)
    .insert({ deck_id: deckId, user_id: user.id, front, back })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createCardAs failed: ${error?.message}`);
  return data as { id: string };
}
