import { type AdminStatusData, TableNames } from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/helpers";
import { createSessionClient } from "@/lib/supabase/server";
import { createDeepSeekClient, isDeepSeekConfigured } from "@/lib/deepseek/client";
import { APIError } from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();

    const [database, deepseek] = await Promise.all([
      checkDatabase(),
      checkDeepSeek(),
    ]);

    return apiSuccess<AdminStatusData>({
      app:       "up",
      database,
      deepseek,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

async function checkDatabase(): Promise<"up" | "down"> {
  try {
    const supabase = await createSessionClient();
    const { error } = await supabase
      .from(TableNames.profiles)
      .select("id")
      .limit(1);
    return error ? "down" : "up";
  } catch {
    return "down";
  }
}

async function checkDeepSeek(): Promise<"up" | "down"> {
  if (!isDeepSeekConfigured()) return "down";
  try {
    const client = createDeepSeekClient();
    await client.models.list();
    return "up";
  } catch (err) {
    // 401 = wrong key but the API is reachable — still "up"
    if (err instanceof APIError && err.status === 401) return "up";
    return "down";
  }
}
