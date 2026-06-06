import { NextRequest } from "next/server";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";
import { EnvKeys } from "@/lib/contracts";
import { validationErrorResponse, internalErrorResponse } from "@/lib/auth/errors";

const resendSchema = z.object({
  email: z.string().email("Invalid email address."),
});

/** The response body is identical for existing and non-existing emails. */
const SAFE_RESPONSE = {
  success: true,
  message:
    "If an account with that email needs confirming, we've sent a new verification link. Please check your inbox (and spam folder).",
} as const;

/**
 * POST /api/auth/resend-confirmation
 *
 * Body: { email }
 *
 * Re-sends the signup confirmation email for an unconfirmed account. Mirrors the
 * forgot-password flow: returns one identical response for every email (registered,
 * unregistered, already-confirmed) to prevent account enumeration.
 *
 * Supabase's auth.resend() is a no-op (or returns an error we swallow) for emails
 * that are already confirmed or don't exist; it only sends for genuine unconfirmed
 * accounts, and its own per-email rate limiting applies.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse("Request body must be valid JSON.");
    }

    const parsed = resendSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.issues[0].message);
    }

    const { email } = parsed.data;
    const supabase = await createSessionClient();
    const appUrl = process.env[EnvKeys.appUrl] ?? "http://localhost:3000";

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${appUrl}/api/auth/callback`,
      },
    });

    if (error) {
      // Log the real error but return the safe response regardless — never reveal
      // whether the email exists or its confirmation state.
      console.error(
        "[auth/resend-confirmation] resend error:",
        error.code ?? error.status,
        error.message
      );
    }

    return Response.json(SAFE_RESPONSE, { status: 200 });
  } catch (err) {
    console.error("[auth/resend-confirmation] unexpected error:", err);
    return internalErrorResponse();
  }
}
