# PDF Extraction Pipeline — Multi-Upload Defect Fixes (S1–S6)

Session record for the extraction-pipeline overhaul shipped 2026-08-11 against
`origin/BackEnd` (commits d618cb1 → working tree; nothing committed yet — reviewed
as uncommitted changes).

> **One-sentence summary:** "Two or more PDFs won't scan" was not one bug — a
> defect analysis surfaced **seven distinct findings (A–G)** behind the symptom.
> This session implemented the full recommended fix sequence **S1 → S2 → S4 →
> S3b → S5 → S6** (in that order), ending with the repro matrix passing in
> simulation and all gates green.

---

## Contents

1. What the report found (findings A–G)
2. What shipped this session (S1–S6)
3. Files touched
4. Verification
5. What still stands (by design / later work)

---

## 1. What the report found

Analysis of the multi-PDF upload failure split the symptom in two:

- **"PDFs with photos won't scan"** — a hard-coded batch abort when any file
  needs OCR (**A**), fired by a scale-blind "≥ 3 sparse pages" classifier that
  misrouted ordinary documents with figures (**B**).
- **"Two PDFs won't scan at all" (eternal spinner)** — the upload call had no
  error handling (**C**), so platform-level rejections (Vercel 4.5 MB body cap
  **D**, 60 s budget + leaked pdf.js resources **E**) produced a hang, not an
  error. **F** (all-or-nothing validation, selection wiped on error) and **G**
  (tail-first truncation silently dropped later files) amplified the rest.

## 2. What shipped this session

### S1 — Fix the silent hang (frontend only)

`uploadPdfs` and `callGenerate` now:

- wrap the whole fetch + `res.json()` pipeline in `try/catch`;
- check `res.ok` **and** the `content-type` header before parsing JSON —
  non-JSON responses (413, 504, HTML error pages) map to per-status copy that
  includes the status code;
- add an `AbortController` 120 s client timeout so stalled connections surface
  instead of hanging forever.

**Effect:** every failure that previously left the UI stuck on "Reading your
PDF, hang tight…" now shows a real error card. Nothing else changed — this
made every other bug *visible* before anything else was touched.

### S2 — Fix the OCR misclassification (contracts first, then code)

**`contracts.ts`:** added `OcrThresholds.minCharsForTextPath: 500` — a document
is only routed to OCR when its *readable* (non-sparse) text is under 500 chars.
The `UploadResult` TEXT variant gained optional `imagePageNumbers` /
`partialText` so sparse pages are returned as an **optional OCR top-up**, not a
routing decision.

**`extract-text-server.ts`:** replaced the scale-blind `>= 3 sparse pages ||
> 10% sparse` rule with the text-sufficiency classifier:

```ts
const isImagePdf =
  pageCount === 0 ||
  (imagePageNumbers.length > 0 &&
    pageCharCount(partialText) < OcrThresholds.minCharsForTextPath);
```

**`upload/route.ts`:** TEXT results now carry `partialText` + `imagePageNumbers`
(the top-up fields).

**Simulated repro matrix:** 20-page PDF with 6 figure pages, 60-page chapter
with 4 figure pages, and a title+2-image-slides deck all flip `OCR → TEXT`;
genuine full scans stay `OCR`. This alone removed most "PDFs with photos" from
the batch-kill path.

### S4 — One file per request + pdf.js cleanup + rate limit (structural)

**Frontend (`PdfUploadFlow.tsx`):** `uploadPdfs` now sends **N sequential
single-file POSTs** instead of one multi-file request and merges results
client-side. Each request sits far under the platform body cap and gets its own
60 s server budget, so one large/slow file can no longer sink the batch.
Failures are recorded per-file and the rest of the batch proceeds. Per-file
progress ("Reading 2 of 3 — notes.pdf") and a client-side pre-flight total-size
check were added.

**Backend (`extract-text-server.ts`):** added `page.cleanup()` after each page's
text extraction and `await pdf.destroy()` in a `finally` — pdf.js documents,
workers and page objects are always released, even on a parse error.

**`contracts.ts` (mandatory companion):** upload rate limit raised **5/hour →
30/hour** — with one-file-per-request, the old budget would have capped a
single 5-file deck at 5 requests and left nothing for the rest of the hour.
30/hour ≈ the old 5-batch × 5-file throughput plus headroom.

### S3b — Sequential per-file OCR queue (finding A removed)

`PdfUploadFlow.tsx` only — no backend change. The batch-killing OCR block was
replaced with:

- an extracted `ocrFileToText` helper (render + Tesseract + partial-text merge);
- a **queue**: TEXT files join immediately; OCR-classified files are processed
  in order, each contributing its merged text to one final `/api/generate`
  call;
- a file whose OCR yields no usable text is **skipped and reported**, never a
  batch abort;
- OCR progress shows "OCR: file 2 of 3 — scan.pdf" plus per-page progress.

Side effect: `runClientOcr`/`ocrFileToText` were moved above `uploadPdfs`,
fixing the one pre-existing lint error (`runClientOcr` accessed before
declaration — present at HEAD line 283).

### S5 — Proportional truncation budget (silent data loss fixed)

**`src/lib/text/truncate.ts`:** new `budgetCombinedText(files)` helper. Instead
of concatenating everything and letting `/api/generate` cut the **tail** (later
PDFs silently vanished), every file now gets a share of the 160k-char budget
**proportional to its own length**, truncated at word boundaries, with
`droppedChars` / `droppedFrom` reported.

Applied at all generate entry points (multi-file merge, single-file TEXT). The
busy card shows "⚠ Some content was trimmed — …" **before** the Capycoin is
charged.

**Simulation:** five 200k-char PDFs — old behavior dropped `e.pdf` entirely;
new behavior keeps all five files with equal ~32k shares and total ≤ 160k.

### S6 — Recovery UX (selection no longer wiped)

Per-file status chips (`done` / `failed` / `reading…` / `queued`) tracked during
upload, keyed by selection index and kept consistent on file removal. The error
card now shows:

- the "Your files" list with status chips and a ✕ remove button per file;
- **"Try again"** — re-runs with the retained selection (failed files can be
  removed first — two-click recovery);
- **"Start over"** — the old full reset, now an explicit choice.

## 3. Files touched

| File | Changes |
|---|---|
| `src/components/upload/PdfUploadFlow.tsx` | S1 error handling · S4 per-file uploads · S3b OCR queue · S5 budget wiring · S6 status/recovery UI |
| `src/lib/pdf/extract-text-server.ts` | S2 text-sufficiency classifier · S4 `page.cleanup()` / `pdf.destroy()` |
| `src/lib/contracts.ts` | S2 `minCharsForTextPath` + `UploadResult` TEXT top-up fields · S4 upload rate limit 5→30 |
| `src/app/api/upload/route.ts` | S2 TEXT results carry `partialText` + `imagePageNumbers` |
| `src/lib/text/truncate.ts` | S5 `budgetCombinedText` (proportional share + drop reporting) |

## 4. Verification

- `npm run typecheck` (`tsc --noEmit`) — clean, 0 errors.
- `npm test` (Vitest) — **72/72 pass** across 11 files.
- `eslint` on touched files — **0 errors** (down from 1 pre-existing at HEAD);
  2 pre-existing warnings remain (`layer1Payload` unused, `<img>` vs
  `next/image`).
- Classifier + budget behavior verified by standalone simulations against the
  report's repro matrix rows (2, 3, 5, 6) — old vs new classification and
  truncation compared directly.

## 5. What still stands (by design)

- **Single-file paste fallback** is unchanged — per-file paste fallback for
  multi-file batches was intentionally left as "skip and report" (S3b), the
  cheaper and more predictable behavior.
- **`=== filename ===` separators** are still fed to DeepSeek as plain content —
  flagged in the original report as a deliberate decision to make; not changed
  this session.
- Nothing has been committed or pushed — the working tree holds all changes for
  review. Live reproduction of the full matrix against the deployed Vercel
  function is still the user's step.
