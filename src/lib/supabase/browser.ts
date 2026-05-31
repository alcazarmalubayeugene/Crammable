"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EnvKeys } from "@/lib/contracts";

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;

  const url = process.env[EnvKeys.supabaseUrl];
  const anonKey = process.env[EnvKeys.supabaseAnonKey];
  if (!url || !anonKey) {
    throw new Error("Supabase browser env vars are not configured");
  }

  client = createClient(url, anonKey);
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
