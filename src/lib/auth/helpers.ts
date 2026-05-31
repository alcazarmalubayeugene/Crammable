import type { User } from "@supabase/supabase-js";
import { createSessionClient } from "@/lib/supabase/server";
import { TableNames, type Profile } from "@/lib/contracts";
import { AuthError } from "@/lib/auth/errors";

/**
 * Returns the verified auth.users record for the current request, or null.
 *
 * Uses getUser() — NOT getSession(). getUser() sends the JWT to the Supabase
 * auth server for verification on every call, making it immune to forged or
 * expired tokens stored in cookies.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Returns the public.profiles row for the current user, or null.
 * Fetches via the session client so RLS applies automatically.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.profiles)
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

/**
 * Asserts the current request is authenticated and has a valid profile.
 *
 * @throws {AuthError} UNAUTHORIZED (401) if not logged in or profile missing
 *
 * Usage:
 *   const { user, profile } = await requireAuth();
 */
export async function requireAuth(): Promise<{ user: User; profile: Profile }> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHORIZED", 401);

  const supabase = await createSessionClient();
  const { data: profile, error } = await supabase
    .from(TableNames.profiles)
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) throw new AuthError("UNAUTHORIZED", 401);
  return { user, profile: profile as Profile };
}

/**
 * Asserts the current request is authenticated AND is_admin = true.
 *
 * @throws {AuthError} UNAUTHORIZED (401) if not logged in
 * @throws {AuthError} FORBIDDEN (403) if logged in but not an admin
 *
 * Usage:
 *   const { user, profile } = await requireAdmin();
 */
export async function requireAdmin(): Promise<{ user: User; profile: Profile }> {
  const { user, profile } = await requireAuth();
  if (!profile.is_admin) throw new AuthError("FORBIDDEN", 403);
  return { user, profile };
}
