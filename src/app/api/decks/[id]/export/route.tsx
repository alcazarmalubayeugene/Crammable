import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ApiErrorCode, TierLimits, UIMessages } from "@/lib/contracts";
import { handleApiError, apiFail } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";
import { checkRateLimit } from "@/lib/supabase/server";
import { getDeckWithCards } from "@/lib/db/decks";
import { DeckPdfDocument } from "@/lib/pdf/DeckPdfDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Binary file download — not the standard ApiResponse<T> JSON envelope.
// Errors are still returned as ApiResponse<never> via apiFail/handleApiError.
export async function GET(_req: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const { user, profile } = await requireAuth();

    if (!TierLimits[profile.subscription_tier].pdfExport) {
      return apiFail(ApiErrorCode.FORBIDDEN, UIMessages.proFeatureLocked, 403);
    }

    const rate = await checkRateLimit(user.id, "/api/decks/[id]/export");
    if (!rate.allowed) {
      return apiFail(ApiErrorCode.RATE_LIMITED, UIMessages.rateLimited, 429);
    }

    const { id } = await params;
    const result = await getDeckWithCards(id);
    if (!result) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }

    const pdfBuffer = await renderToBuffer(
      <DeckPdfDocument deck={result.deck} cards={result.cards} />
    );

    const filename = `${result.deck.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || "deck"}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
