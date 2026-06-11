import { createAdminClient } from "@/lib/supabase/admin";
import {
  PaymentStatus,
  SubscriptionTier,
  TableNames,
  type AdminActionLog,
  type AdminAppReviewRow,
  type AdminAuditLogRow,
  type AdminPaymentRow,
  type AdminUserRow,
  type AppReview,
  type PaymentSubmission,
} from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * Admin payment-verification flow. Service-role client throughout:
 *   - reading every user's submissions (RLS would hide other users' rows)
 *   - flipping subscription_tier (blocked for the authenticated role by the
 *     prevent_privilege_escalation trigger)
 *   - writing admin_action_log
 *
 * Callers MUST gate these behind requireAdmin() first — the service-role client
 * does no authorization of its own.
 *
 * ATOMICITY: approve/reject delegate to the approve_payment()/reject_payment()
 * SECURITY DEFINER functions (schema §4.10–4.11) so the claim → tier → audit
 * writes commit (or roll back) as one transaction. The status='pending' guard
 * inside those functions is the concurrency guard — a second admin acting on the
 * same submission gets ALREADY_PROCESSED, mapped to a clear validation error.
 */

/** Pending submissions joined with the submitter's email, oldest first (FIFO). */
export async function listPendingPayments(): Promise<AdminPaymentRow[]> {
  const admin = createAdminClient();
  // FK hint `!user_id` disambiguates the two profiles FKs (user_id, verified_by).
  const { data, error } = await admin
    .from(TableNames.paymentSubmissions)
    .select(`*, user:${TableNames.profiles}!user_id(email)`)
    .eq("status", PaymentStatus.PENDING)
    .order("created_at", { ascending: true });
  if (error) throw toDbError(error, "Failed to load pending payments.");

  const now = Date.now();
  return ((data as Array<PaymentSubmission & { user: { email: string } | null }>) ?? []).map(
    (row) => {
      const { user, ...submission } = row;
      return {
        ...submission,
        userEmail: user?.email ?? "",
        minutesSinceSubmission: Math.floor(
          (now - new Date(submission.created_at).getTime()) / 60_000
        ),
      } satisfies AdminPaymentRow;
    }
  );
}

/**
 * Approve a payment atomically via approve_payment() (schema §4.10): marks it
 * verified, upgrades the submitter to Pro (extending any remaining Pro time),
 * and writes the audit log — all in one transaction. Returns the upgraded user id.
 *
 * @throws {DbError} VALIDATION_ERROR if the submission isn't pending (already
 *                   approved/rejected, missing, or claimed by another admin).
 */
export async function approvePayment(
  adminId: string,
  paymentId: string,
  notes?: string
): Promise<{ userId: string; newTier: typeof SubscriptionTier.PRO }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("approve_payment", {
    p_admin_id: adminId,
    p_payment_id: paymentId,
    p_notes: notes ?? null,
  });
  if (error) throw toDbError(error, "Failed to approve payment.");
  return { userId: data as string, newTier: SubscriptionTier.PRO };
}

/**
 * Reject a payment atomically via reject_payment() (schema §4.11) with a
 * student-facing reason. Returns the affected user id.
 *
 * @throws {DbError} VALIDATION_ERROR if the submission isn't pending.
 */
export async function rejectPayment(
  adminId: string,
  paymentId: string,
  rejectionReason: string,
  notes?: string
): Promise<{ userId: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reject_payment", {
    p_admin_id: adminId,
    p_payment_id: paymentId,
    p_reason: rejectionReason,
    p_notes: notes ?? null,
  });
  if (error) throw toDbError(error, "Failed to reject payment.");
  return { userId: data as string };
}

/**
 * E4 — user list for the admin dashboard, optionally filtered by an email
 * substring. Service-role client (RLS would otherwise hide every row but the
 * admin's own profile). Capped at 50 rows, newest accounts first.
 */
export async function listUsers(search?: string): Promise<AdminUserRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from(TableNames.profiles)
    .select("id, email, full_name, subscription_tier, token_balance, is_admin, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (search) {
    // Escape LIKE metacharacters so a search containing % or _ is matched
    // literally rather than as a wildcard (the value is already parameterised by
    // PostgREST, so this is about correct matching, not SQL injection). \ first.
    const escaped = search.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    query = query.ilike("email", `%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) throw toDbError(error, "Failed to load users.");
  return (data as AdminUserRow[]) ?? [];
}

/**
 * E4 — manually grant credits to a user via admin_grant_credits() (schema
 * §4.7a): atomic grant_credits() + admin_action_log insert
 * (action='credit_grant'), so the balance change and audit row commit together.
 */
export async function grantCreditsAsAdmin(
  adminId: string,
  targetUserId: string,
  amount: number,
  notes?: string
): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_grant_credits", {
    p_admin_id: adminId,
    p_target_user_id: targetUserId,
    p_amount: amount,
    p_notes: notes ?? null,
  });
  if (error) throw toDbError(error, "Failed to grant credits.");
  return data as number;
}

/**
 * E4 — recent admin actions (approvals, rejections, credit grants, account
 * deletions) joined with the admin's email, the affected user's email, and the
 * related payment's reference number where applicable. Newest first.
 */
export async function listAuditLog(limit: number = 50): Promise<AdminAuditLogRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TableNames.adminActionLog)
    .select(
      `*, admin:${TableNames.profiles}!admin_id(email), target:${TableNames.profiles}!target_user_id(email), payment:${TableNames.paymentSubmissions}!payment_id(reference_number)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw toDbError(error, "Failed to load audit log.");

  return (
    (data as Array<
      AdminActionLog & {
        admin: { email: string } | null;
        target: { email: string } | null;
        payment: { reference_number: string } | null;
      }
    >) ?? []
  ).map(({ admin: adminUser, target, payment, ...row }) => ({
    ...row,
    adminEmail: adminUser?.email ?? null,
    targetUserEmail: target?.email ?? null,
    paymentReference: payment?.reference_number ?? null,
  }));
}

/** Pending app reviews (B4) joined with the submitter's email, oldest first (FIFO). */
export async function listPendingAppReviews(): Promise<AdminAppReviewRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TableNames.appReviews)
    .select(`*, user:${TableNames.profiles}!user_id(email)`)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw toDbError(error, "Failed to load pending reviews.");

  return ((data as Array<AppReview & { user: { email: string } | null }>) ?? []).map((row) => {
    const { user, ...review } = row;
    return { ...review, userEmail: user?.email ?? "" } satisfies AdminAppReviewRow;
  });
}

/**
 * Approve or reject an app review atomically via verify_app_review() (schema
 * §4.16): claims the row (status='pending' guard), and on approve also inserts
 * the referral_events ledger row + grants credits — all in one transaction.
 * Returns the reviewed user's id and the credits awarded (0 on reject).
 *
 * @throws {DbError} VALIDATION_ERROR if the review isn't pending.
 */
export async function verifyAppReview(
  adminId: string,
  reviewId: string,
  approve: boolean,
  credits: number,
  notes?: string
): Promise<{ userId: string; creditsAwarded: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("verify_app_review", {
    p_admin_id: adminId,
    p_review_id: reviewId,
    p_approve: approve,
    p_credits: credits,
    p_notes: notes ?? null,
  });
  if (error) throw toDbError(error, "Failed to verify review.");
  return { userId: data as string, creditsAwarded: approve ? credits : 0 };
}
