import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  EnvKeys,
  SubscriptionTier,
  TableNames,
  TierLimits,
  type Profile,
} from "@/lib/contracts";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    requireEnv(EnvKeys.supabaseUrl),
    requireEnv(EnvKeys.supabaseServiceRoleKey),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function getUserFromRequest(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function getProfileForUser(userId: string): Promise<Profile | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TableNames.profiles)
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Profile;
}

export async function checkRateLimit(
  userId: string,
  endpoint: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_user_id: userId,
    p_endpoint: endpoint,
  });

  if (error) {
    console.error("check_rate_limit RPC failed:", error.message);
    return { allowed: true, remaining: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed ?? true),
    remaining: Number(row?.remaining ?? 0),
  };
}

export function getMaxUploadPages(tier: SubscriptionTier): number {
  return TierLimits[tier].maxUploadPages;
}
