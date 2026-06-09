import { NextRequest } from "next/server";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";
import { EnvKeys } from "@/lib/contracts";
import { validationErrorResponse, internalErrorResponse } from "@/lib/auth/errors";

const forgotSchema = z.object({
  email: z.string().email("Invalid email address."),
});

/** The response body is identical for existing and non-existing emails. */
const SAFE_RESPONSE = {
  success: true,
  message:
    "If an account with that email exists, you will receive a password reset link shortly.",
} as const;

/**
 * POST /api/auth/forgot-password
 *
 * Body: { email }
 *
 * Triggers Supabase's password reset email flow.
 * Supabase sends an email with a link to /api/auth/callback?type=recovery.
 *
 * Returns identical responses for registered and unregistered emails
 * to prevent account enumeration.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse("Request body must be valid JSON.");
    }

    const parsed = forgotSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.issues[0].message);
    }

    const { email } = parsed.data;
    const supabase = await createSessionClient();
    const appUrl = process.env[EnvKeys.appUrl] ?? "http://localhost:3000";

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/api/auth/callback?type=recovery`,
    });

    if (error) {
      // Log real error but return the safe response regardless.
      console.error("[auth/forgot-password] resetPasswordForEmail error:", error.message);
    }

    // Always return the same message — prevents enumeration.
    return Response.json(SAFE_RESPONSE, { status: 200 });
  } catch (err) {
    console.error("[auth/forgot-password] unexpected error:", err);
    return internalErrorResponse();
  }
}
