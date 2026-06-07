import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import {
  ApiErrorCode,
  EnvKeys,
  TableNames,
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
  referralCode: z
    .string()
    .length(Validation.referralCode.length, "Referral code must be 8 characters.")
    .optional(),
  consentDeeseek: z.boolean().optional(),
});

/**
 * POST /api/auth/signup
 *
 * Body: { email, password, fullName?, referralCode?, consentDeeseek? }
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

    const { email, password, fullName, referralCode, consentDeeseek } = parsed.data;
    const supabase = await createSessionClient();

    const appUrl = process.env[EnvKeys.appUrl] ?? "http://localhost:3000";

    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl}/api/auth/callback`,
        data: {
          full_name: fullName ?? null,
          referral_code_used: referralCode ?? null,
        },
      },
    });

    // Save consent immediately — profile is created by DB trigger on signUp
    if (!error && signUpData.user && consentDeeseek) {
      const serviceClient = createServiceClient();
      await serviceClient
        .from(TableNames.profiles)
        .update({ consent_deepseek: true })
        .eq("id", signUpData.user.id);
    }

    if (error) {
      // Log the real error server-side but never expose it.
      console.error("[auth/signup] Supabase signUp error:", error.message);

      // 422 / user_already_exists → return the same message as success to
      // prevent enumeration. All other errors are internal.
      if (
        error.status === 422 ||
        error.code === "user_already_exists" ||
        error.message.toLowerCase().includes("already registered")
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
