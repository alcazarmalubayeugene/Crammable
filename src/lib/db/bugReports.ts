import { createSessionClient } from "@/lib/supabase/server";
import { TableNames, type BugReport, type BugReportSeverity } from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * User-submitted bug reports ("Report a bug" earn method, BackEnd). RLS lets a
 * user insert/read only their own rows. Unlike app_reviews there's no
 * one-per-user constraint — a user can file as many reports as they find
 * real bugs; only the reward (via verify_bug_report(), schema §4.16b) is
 * capped monthly.
 */

export async function createBugReport(
  userId: string,
  title: string,
  description: string,
  severity: BugReportSeverity,
  pageUrl: string | null
): Promise<BugReport> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.bugReports)
    .insert({ user_id: userId, title, description, severity, page_url: pageUrl })
    .select("*")
    .single();
  if (error) throw toDbError(error, "Failed to submit bug report.");
  return data as BugReport;
}

/** The current user's own bug reports, newest first — for a "my reports" view. */
export async function listOwnBugReports(userId: string): Promise<BugReport[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.bugReports)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw toDbError(error, "Failed to load your bug reports.");
  return (data as BugReport[]) ?? [];
}
