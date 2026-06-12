import { OcrThresholds } from "@/lib/contracts";

/** Rough token estimate: ~4 chars per token for Latin text. */
const CHARS_PER_TOKEN = 4;

export function truncateToMaxInputTokens(text: string): string {
  const maxChars = OcrThresholds.maxInputTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  // Cut back to the last whitespace boundary so we don't ship a half-word (which
  // wastes a token and can confuse extraction). Fall back to a hard slice if the
  // window has no whitespace (e.g. one giant token).
  const hard = text.slice(0, maxChars);
  const lastSpace = hard.lastIndexOf(" ");
  return lastSpace > 0 ? hard.slice(0, lastSpace) : hard;
}

export function isExtractedTextEmpty(text: string): boolean {
  return text.replace(/\s+/g, "").length === 0;
}
