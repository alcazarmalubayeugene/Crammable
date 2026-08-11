import { OcrThresholds } from "@/lib/contracts";

// ~4 chars/token holds for English Latin text. Mixed Tagalog/English or
// code-heavy content can run 2–3 chars/token, so at the 40k-token cap this
// estimate may over-send by up to ~50%. Acceptable given the hard server-side
// content cap, but worth revisiting if DeepSeek starts rejecting large inputs.
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

// ─────────────────────────────────────────────────────────────────────────────
// S5 — proportional text budget across multiple files.
//
// The old flow concatenated every file into ONE blob and let /api/generate
// truncate the tail at maxInputTokens — so the LAST files uploaded silently
// contributed nothing (finding G). budgetCombinedText instead gives each file
// a share of the token budget proportional to its own length, so every PDF
// contributes, and reports exactly how much was cut so the UI can warn the
// user BEFORE a Capycoin is charged.
// ─────────────────────────────────────────────────────────────────────────────

export interface BudgetedFileText {
  filename: string;
  text:     string;
}

export interface TextBudgetResult {
  combinedText: string;
  droppedChars: number;        // 0 when everything fit
  droppedFrom:  string[];      // filenames whose content was cut
}

export function budgetCombinedText(files: BudgetedFileText[]): TextBudgetResult {
  const maxChars = OcrThresholds.maxInputTokens * CHARS_PER_TOKEN;
  const overhead = files.reduce(function (sum, f) {
    // "=== filename ===\n" header plus the "\n\n" joiner between entries.
    return sum + "=== ".length + f.filename.length + " ===\n".length + 2;
  }, 0);
  const textBudget = Math.max(0, maxChars - overhead);
  const totalChars = files.reduce(function (sum, f) { return sum + f.text.length; }, 0);

  if (totalChars <= textBudget) {
    return {
      combinedText: files
        .map((f) => "=== ".concat(f.filename, " ===\n", f.text))
        .join("\n\n")
        .trim(),
      droppedChars: 0,
      droppedFrom:  [],
    };
  }

  const parts: string[] = [];
  let droppedChars = 0;
  const droppedFrom: string[] = [];

  for (const f of files) {
    // Proportional share: the file's fraction of total length, applied to the
    // whole text budget. Longer files get more room; every file gets some.
    const share = Math.floor(textBudget * (f.text.length / Math.max(1, totalChars)));
    if (f.text.length <= share) {
      parts.push("=== ".concat(f.filename, " ===\n", f.text));
      continue;
    }
    const hard = f.text.slice(0, share);
    const lastSpace = hard.lastIndexOf(" ");
    const cut = lastSpace > 0 ? hard.slice(0, lastSpace) : hard;
    droppedChars += f.text.length - cut.length;
    droppedFrom.push(f.filename);
    parts.push("=== ".concat(f.filename, " ===\n", cut));
  }

  return {
    combinedText: parts.join("\n\n").trim(),
    droppedChars,
    droppedFrom,
  };
}
