import { createSessionClient } from "@/lib/supabase/server";
import {
  TableNames,
  type PaymentMethod,
  type PaymentSubmission,
} from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * Payment submission reads/writes for the STUDENT side (session client, RLS:
 * own rows). The admin verify/reject side lives in src/lib/db/admin.ts and uses
 * the service-role client.
 */

export interface NewPaymentInput {
  userId: string;
  referenceNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
}

/**
 * Submit a GCash/cash payment for verification.
 *
 * Two DB guards surface as DbError via toDbError():
 *   - one pending submission per user (idx_one_pending_payment_per_user)
 *       → PAYMENT_ALREADY_PENDING
 *   - reference_number unique + 13-digit CHECK
 *       → VALIDATION_ERROR / INVALID_REFERENCE_NUMBER
 */
export async function createPaymentSubmission(
  input: NewPaymentInput
): Promise<PaymentSubmission> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.paymentSubmissions)
    .insert({
      user_id: input.userId,
      reference_number: input.referenceNumber,
      amount: input.amount,
      payment_method: input.paymentMethod,
    })
    .select("*")
    .single();
  if (error) throw toDbError(error, "Failed to submit payment.");
  return data as PaymentSubmission;
}

/** A user's own payment history, newest first. */
export async function listUserPayments(
  userId: string
): Promise<PaymentSubmission[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.paymentSubmissions)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw toDbError(error, "Failed to load payments.");
  return (data as PaymentSubmission[]) ?? [];
}
