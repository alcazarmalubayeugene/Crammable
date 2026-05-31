import { NextRequest } from "next/server";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";
import {
  ApiErrorCode,
  RateLimits,
  ApiPaths,
  TableNames,
  type ApiFailResponse,
} from "@/lib/contracts";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/auth/errors";

const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
});

/**
 * POST /api/auth/login
 *
 * Body: { email, password }
 *
 * On success returns the authenticated user's id, email, and a minimal
 * profile snapshot (subscription_tier, is_admin, token_balance) so the
 * frontend can initialise its state in a single round-trip.
 *
 * Error messages are intentionally vague to prevent credential enumeration.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse("Request body must be valid JSON.");
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.issues[0].message);
    }

    const { email, password } = parsed.data;
    const supabase = await createSessionClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      console.error("[auth/login] signInWithPassword error:", error?.message);

      // Map all auth failures to the same generic message — prevents enumeration.
      const body: ApiFailResponse = {
        success: false,
        error: {
          code: ApiErrorCode.UNAUTHORIZED,
          message: "Invalid email or password.",
        },
      };
      return Response.json(body, { status: 401 });
    }

    // Apply login rate limit via DB function (service-role bypasses RLS on rate_limit_log).
    // Non-blocking: rate limit failure logs a warning but does not block a successful login.
    try {
      const admin = createAdminClient();
      const loginRule = RateLimits[ApiPaths.authLogin];
      const { data: rl } = await admin.rpc("check_rate_limit", {
        p_user_id: data.user.id,
        p_endpoint: ApiPaths.authLogin,
        p_window_minutes: loginRule.windowMinutes,
        p_max_requests: loginRule.maxRequests,
      });
      if (rl && !rl[0]?.allowed) {
        const limitBody: ApiFailResponse = {
          success: false,
          error: {
            code: ApiErrorCode.RATE_LIMITED,
            message: "Too many login attempts. Please wait before trying again.",
          },
        };
        return Response.json(limitBody, { status: 429 });
      }
    } catch (rlErr) {
      console.warn("[auth/login] rate-limit check failed:", rlErr);
    }

    // Fetch the profile for the session response.
    const { data: profileData } = await supabase
      .from(TableNames.profiles)
      .select(
        "subscription_tier, is_admin, token_balance, consent_deepseek, full_name"
      )
      .eq("id", data.user.id)
      .single();

    return Response.json(
      {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        profile: profileData ?? null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[auth/login] unexpected error:", err);
    return internalErrorResponse();
  }
}
