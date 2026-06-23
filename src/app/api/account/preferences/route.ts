import { z } from "zod";
import {
  ApiPaths,
  ThemeModes,
  FontSizeKeys,
  FontPairKeys,
} from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { updateOwnProfile } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Validate against the contracts domain arrays (single source of truth, mirrors
// the ThemeProvider union types) — an out-of-domain value is a VALIDATION_ERROR
// via handleApiError, never written to the row.
const prefsSchema = z.object({
  theme:    z.enum(ThemeModes),
  fontSize: z.enum(FontSizeKeys),
  fontPair: z.enum(FontPairKeys),
});

/**
 * POST /api/account/preferences — persist the caller's theme/font preferences so
 * they sync across devices. Writes only the three preference columns through
 * updateOwnProfile's allow-list (RLS confines it to the caller's own row).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user } = await requireAuth();
    await enforceRateLimit(user.id, ApiPaths.updatePreferences);

    const { theme, fontSize, fontPair } = prefsSchema.parse(await request.json());

    await updateOwnProfile(user.id, {
      theme_preference: theme,
      font_size_preference: fontSize,
      font_pair_preference: fontPair,
    });

    return apiSuccess({});
  } catch (err) {
    return handleApiError(err);
  }
}
