import {
  TableNames,
  type ReferralEvent,
  type ReferralHistoryItem,
  type ReferralHistoryResult,
} from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { user } = await requireAuth();

    const supabase = await createSessionClient();

    const { data: rows, error } = await supabase
      .from(TableNames.referralEvents)
      .select("*")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const events = (rows ?? []) as ReferralEvent[];

    // Collect distinct referred_ids that are non-null (signup events)
    const referredIds = [
      ...new Set(
        events
          .filter((e) => e.referred_id !== null)
          .map((e) => e.referred_id as string),
      ),
    ];

    // Look up names via service-role client (RLS on profiles is self-only)
    const nameMap: Record<string, string | null> = {};
    if (referredIds.length > 0) {
      const admin = createAdminClient();
      const { data: profiles } = await admin
        .from(TableNames.profiles)
        .select("id, full_name")
        .in("id", referredIds);

      for (const p of profiles ?? []) {
        // Return first name only for privacy
        const firstName = (p.full_name as string | null)?.split(" ")[0] ?? null;
        nameMap[p.id as string] = firstName;
      }
    }

    const enriched: ReferralHistoryItem[] = events.map((e) => ({
      ...e,
      referredName: e.referred_id ? (nameMap[e.referred_id] ?? null) : null,
    }));

    return apiSuccess<ReferralHistoryResult>({ events: enriched });
  } catch (err) {
    return handleApiError(err);
  }
}
