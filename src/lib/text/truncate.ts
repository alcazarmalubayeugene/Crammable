import { OcrThresholds } from "@/lib/contracts";

/** Rough token estimate: ~4 chars per token for Latin text. */
const CHARS_PER_TOKEN = 4;

export function truncateToMaxInputTokens(text: string): string {
  const maxChars = OcrThresholds.maxInputTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export function isExtractedTextEmpty(text: string): boolean {
  return text.replace(/\s+/g, "").length === 0;
}
