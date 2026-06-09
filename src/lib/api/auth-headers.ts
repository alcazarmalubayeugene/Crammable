"use client";

import { getAccessToken } from "@/lib/supabase/browser";

export async function authHeaders(
  extra?: HeadersInit,
): Promise<HeadersInit> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    ...(extra as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
