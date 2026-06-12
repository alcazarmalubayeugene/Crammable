import { createSessionClient } from "@/lib/supabase/server";
import { TableNames, type AppReview } from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * In-app review submissions (B4 "Write a review" earn method). RLS lets a
 * user insert/read only their own row; `one_review_per_user` (schema §1.10)
 * caps it to one ever — a repeat insert raises REVIEW_ALREADY_SUBMITTED
 * (mapped in toDbError).
 */

export async function createAppReview(
  userId: string,
  rating: number,
  reviewText: string
): Promise<AppReview> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.appReviews)
    .insert({ user_id: userId, rating, review_text: reviewText })
    .select("*")
    .single();
  if (error) throw toDbError(error, "Failed to submit review.");
  return data as AppReview;
}

/** The current user's review, if any — used to show its status on /rewards. */
export async function getOwnAppReview(): Promise<AppReview | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.appReviews)
    .select("*")
    .maybeSingle();
  if (error) throw toDbError(error, "Failed to load review status.");
  return (data as AppReview | null) ?? null;
}
