import { NextRequest } from "next/server";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";
import { ApiErrorCode, type ApiFailResponse } from "@/lib/contracts";
import {
  validationErrorResponse,
  internalErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/errors";

const resetSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be at most 128 characters."),
});

/**
 * POST /api/auth/reset-password
 *
 * Body: { newPassword }
 *
 * Called by the frontend AFTER the user has clicked the reset link in their
 * email and the browser has landed on /api/auth/callback?type=recovery, which
 * exchanges the recovery token for a session cookie.
 *
 * At this point the user is authenticated via that session, so we can call
 * supabase.auth.updateUser() to set the new password.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse("Request body must be valid JSON.");
    }

    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.issues[0].message);
    }

    const { newPassword } = parsed.data;
    const supabase = await createSessionClient();

    // Verify there is an active session (the recovery token was exchanged).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return unauthorizedResponse();
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error("[auth/reset-password] updateUser error:", error.message);

      if (error.status === 422) {
        const body: ApiFailResponse = {
          success: false,
          error: {
            code: ApiErrorCode.VALIDATION_ERROR,
            message:
              "New password must be different from your current password.",
          },
        };
        return Response.json(body, { status: 422 });
      }

      return internalErrorResponse();
    }

    return Response.json(
      { success: true, message: "Password updated successfully." },
      { status: 200 }
    );
  } catch (err) {
    console.error("[auth/reset-password] unexpected error:", err);
    return internalErrorResponse();
  }
}
