import { NextRequest } from "next/server";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";
import {
  ApiErrorCode,
  EnvKeys,
  Validation,
  type ApiFailResponse,
} from "@/lib/contracts";
import { validationErrorResponse, internalErrorResponse } from "@/lib/auth/errors";

const signupSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be at most 128 characters."),
  fullName: z
    .string()
    .max(Validation.profile.fullNameMaxLength, "Full name is too long.")
    .optional(),
  course: z
    .string()
    .max(Validation.profile.courseMaxLength, "Course / program is too long.")
    .optional(),
  referralCode: z
    .string()
    .length(Validation.referralCode.length, "Referral code must be 8 characters.")
    .optional(),
  consentDeepseek: z.boolean().optional(),
});

/**
 * POST /api/auth/signup
 *
 * Body: { email, password, fullName?, course?, referralCode?, consentDeepseek? }
 *
 * Always returns the same success message regardless of whether the email
 * is already registered — prevents user enumeration.
 *
 * Supabase sends a verification email; after clicking it, the user is
 * redirected to GET /api/auth/callback which finalises the session.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse("Request body must be valid JSON.");
    }

    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.issues[0].message);
    }

    const { email, password, fullName, course, referralCode, consentDeepseek } =
      parsed.data;
    const supabase = await createSessionClient();

    const appUrl = process.env[EnvKeys.appUrl] ?? "http://localhost:3000";

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl}/api/auth/callback`,
        // These land in auth.users.raw_user_meta_data and are read by the
        // handle_new_user() trigger to populate the profiles row.
        data: {
          full_name: fullName ?? null,
          course: course ?? null,
          consent_deepseek: consentDeepseek ?? false,
          referral_code_used: referralCode ?? null,
        },
      },
    });

    if (error) {
      // Log the real error server-side.
      console.error(
        "[auth/signup] Supabase signUp error:",
        error.code ?? error.status,
        error.message,
      );

      const code = error.code ?? "";
      const msg = error.message.toLowerCase();

      // Account already exists → return the same message as success to prevent
      // user enumeration. Must stay indistinguishable from a real signup.
      if (
        error.status === 422 ||
        code === "user_already_exists" ||
        code === "email_exists" ||
        msg.includes("already registered")
      ) {
        return Response.json(
          {
            success: true,
            message:
              "If this email is not already registered, you will receive a verification link shortly.",
          },
          { status: 200 }
        );
      }

      // Rate limiting from Supabase's mailer / auth endpoint.
      if (
        error.status === 429 ||
        code === "over_email_send_rate_limit" ||
        code === "over_request_rate_limit"
      ) {
        const body: ApiFailResponse = {
          success: false,
          error: {
            code: ApiErrorCode.RATE_LIMITED,
            message:
              "Too many sign-up attempts. Please wait a few minutes and try again.",
          },
        };
        return Response.json(body, { status: 429 });
      }

      // User-fixable input problems — surface a clear, non-sensitive reason
      // instead of a generic 500 so the person knows what to correct.
      if (code === "email_address_invalid" || msg.includes("email") && msg.includes("invalid")) {
        return validationErrorResponse(
          "That email address was rejected. Please use a real, valid email address.",
        );
      }
      if (code === "weak_password" || msg.includes("password")) {
        return validationErrorResponse(
          "That password was rejected. Try a longer, less common password.",
        );
      }
      if (code === "signup_disabled" || code === "email_provider_disabled") {
        return validationErrorResponse(
          "Sign-ups are currently disabled. Please contact support.",
        );
      }

      // Anything else is a genuine server/config problem — keep it generic.
      return internalErrorResponse();
    }

    return Response.json(
      {
        success: true,
        message:
          "If this email is not already registered, you will receive a verification link shortly.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[auth/signup] unexpected error:", err);
    return internalErrorResponse();
  }
}
