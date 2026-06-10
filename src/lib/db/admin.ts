import { createAdminClient } from "@/lib/supabase/admin";
import {
  PaymentStatus,
  SubscriptionTier,
  TableNames,
  type AdminPaymentRow,
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
