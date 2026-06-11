/**
 * contracts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for the Crammable project.
 *
 * DROP THIS FILE IN:  src/lib/contracts.ts
 *
 * WHO USES IT
 *   Frontend (1)  — components, API calls, state management
 *   Backend  (2)  — route handlers, DB queries, validation
 *   Both devs     — never hardcode any string, number, or route that lives here
 *
 * TEAM RULES (3-MAN TEAM — READ BEFORE TOUCHING)
 *   1. Never hardcode a string/number that exists here — always import it.
 *   2. Every API request body and response must match the interfaces below.
 *   3. Schema change? Update this file FIRST — then both sides adapt.
 *   4. Wrap every route handler return with ApiResponse<YourSuccessShape>.
 *   5. Use TableNames for all Supabase table references — never raw strings.
 *   6. Use EnvKeys when reading process.env — never hardcode env var names.
 *   7. Use UIMessages for all user-facing toast / notification copy.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 0 — APP METADATA
// The single place where the app name lives. Never hardcode "Crammable"
// in a component or handler — import App.name.
// ─────────────────────────────────────────────────────────────────────────────

export const App = {
  name:         "Crammable",
  version:      "v.05",                  // bump by 0.1 on every meaningful frontend update
  tagline:      "Turn any document into a flashcard deck — in seconds.",
  supportEmail: "support@crammable.ph",  // update once domain is live
  gcashName:    "Crammable",             // name displayed in GCash payment screen
  gcashNumber:  "09691816930",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — ENUMS & CONSTANTS
// Use these everywhere instead of raw strings.
// ─────────────────────────────────────────────────────────────────────────────

/** Subscription tiers — stored in profiles.subscription_tier */
export const SubscriptionTier = {
  FREE: "free",
  PRO:  "pro",
} as const;
export type SubscriptionTier = (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

/** How a deck's source text was obtained — stored in decks.pdf_type */
export const PdfType = {
  TEXT:  "text",   // pdfjs-dist extracted text directly (fast path)
  OCR:   "ocr",    // Tesseract.js browser-side OCR path
  PASTE: "paste",  // manual paste fallback
} as const;
export type PdfType = (typeof PdfType)[keyof typeof PdfType];

/** AI generation mode — stored in decks.generation_mode */
export const GenerationMode = {
  STANDARD:  "standard",
  DEEP_DIVE: "deep_dive",
} as const;
export type GenerationMode = (typeof GenerationMode)[keyof typeof GenerationMode];

/** Quiz types — stored in quiz_sessions.quiz_type */
export const QuizType = {
  MULTIPLE_CHOICE: "multiple_choice",
  IDENTIFICATION:  "identification",
  MIXED:           "mixed",
} as const;
export type QuizType = (typeof QuizType)[keyof typeof QuizType];

/** Payment status — stored in payment_submissions.status */
export const PaymentStatus = {
  PENDING:  "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** Payment method — stored in payment_submissions.payment_method */
export const PaymentMethod = {
  GCASH: "gcash",
  CASH:  "cash",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** Admin action types — stored in admin_action_log.action */
export const AdminAction = {
  APPROVED:        "approved",
  REJECTED:        "rejected",
  CREDIT_GRANT:    "credit_grant",
  ACCOUNT_DELETED: "account_deleted",
} as const;
export type AdminAction = (typeof AdminAction)[keyof typeof AdminAction];

/** Referral / credit-earning event types — stored in referral_events.event_type */
export const ReferralEventType = {
  SIGNUP:           "signup",
  DECK_SHARE:       "deck_share",
  APP_REVIEW:       "app_review",
  PROFILE_COMPLETE: "profile_complete",
} as const;
export type ReferralEventType = (typeof ReferralEventType)[keyof typeof ReferralEventType];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — DATABASE TABLE NAMES
// Never hardcode "profiles", "decks", etc. in queries — import from here.
// If a table is renamed, change it in exactly one place.
// ─────────────────────────────────────────────────────────────────────────────

export const TableNames = {
  profiles:           "profiles",
  decks:              "decks",
  flashcards:         "flashcards",
  quizSessions:       "quiz_sessions",
  quizAnswers:        "quiz_answers",
  paymentSubmissions: "payment_submissions",
  referralEvents:     "referral_events",
  rateLimitLog:       "rate_limit_log",
  adminActionLog:     "admin_action_log",
  appReviews:         "app_reviews",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — ENVIRONMENT VARIABLE KEYS
// Use these as keys when reading process.env — never hardcode the var name.
// All 3 devs must use identical variable names in their .env.local files.
//
// .env.local template for new team members:
//
//   NEXT_PUBLIC_SUPABASE_URL=
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=
//   SUPABASE_SERVICE_ROLE_KEY=       ← NEVER use NEXT_PUBLIC_ here
//   DEEPSEEK_API_KEY=                ← NEVER use NEXT_PUBLIC_ here
//   DEEPSEEK_MODEL=deepseek-chat     ← update when V4 model string is confirmed
//   NEXT_PUBLIC_APP_URL=http://localhost:3000
// ─────────────────────────────────────────────────────────────────────────────

export const EnvKeys = {
  supabaseUrl:            "NEXT_PUBLIC_SUPABASE_URL",
  supabaseAnonKey:        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",  // server-side only — never expose to client
  deepseekApiKey:         "DEEPSEEK_API_KEY",           // server-side only
  deepseekModel:          "DEEPSEEK_MODEL",             // e.g. "deepseek-chat"
  appUrl:                 "NEXT_PUBLIC_APP_URL",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — ROUTE PATHS
// Never hardcode route strings in components or handlers — import from here.
//
// NOTE: ApiPaths is defined separately so RateLimits (Section 7) can
// reference it as keys — guaranteeing RateLimits keys always match fetch() URLs.
// ─────────────────────────────────────────────────────────────────────────────

/** Static and dynamic API endpoint paths.
 *  Use these in both fetch() calls AND as RateLimits keys. */
export const ApiPaths = {
  upload:              "/api/upload",
  generate:            "/api/generate",
  decks:               "/api/decks",
  deck:                (id: string) => `/api/decks/${id}`,
  deckShare:           (id: string) => `/api/decks/${id}/share`,
  deckExport:          (id: string) => `/api/decks/${id}/export`,
  deckFlashcards:      (id: string) => `/api/decks/${id}/flashcards`,
  flashcard:           (id: string) => `/api/flashcards/${id}`,
  publicDeck:          (id: string) => `/api/public/decks/${id}`,
  startQuiz:           (id: string) => `/api/quiz/${id}`,
  submitQuizResult:    "/api/quiz/result",
  quizHistory:         "/api/quiz/history",
  claimReferral:       "/api/referral/claim",
  submitPayment:       "/api/payment/submit",
  adminPayments:       "/api/admin/payments",
  adminApprovePayment: "/api/admin/payments/approve",
  adminRejectPayment:  "/api/admin/payments/reject",
  claimProfileComplete:  "/api/rewards/claim-profile-complete",
  submitAppReview:       "/api/rewards/submit-review",
  adminReviews:          "/api/admin/reviews",
  adminVerifyReview:     "/api/admin/reviews/verify",
  adminUsers:            "/api/admin/users",
  adminGrantCredits:     "/api/admin/users/grant-credits",
  adminAuditLog:         "/api/admin/audit-log",
  accountExport:         "/api/account/export",
  accountDelete:         "/api/account/delete",
  authSignup:             "/api/auth/signup",
  authLogin:              "/api/auth/login",
  authResendConfirmation: "/api/auth/resend-confirmation",
  authForgotPassword:     "/api/auth/forgot-password",
  authResetPassword:      "/api/auth/reset-password",
} as const;

export const Routes = {
  // Public
  home:           "/",
  signup:         "/signup",
  login:          "/login",
  forgotPassword: "/forgot-password",

  // Authenticated
  dashboard:  "/dashboard",
  newDeck:    "/decks/new",
  deck:       (id: string) => `/decks/${id}`,
  quiz:       (deckId: string) => `/quiz/${deckId}`,
  quizResult: (deckId: string) => `/quiz/${deckId}/result`,
  upgrade:    "/upgrade",
  rewards:    "/rewards",
  settings:   "/settings",

  // Public (no auth required)
  publicDeck: (id: string) => `/public/decks/${id}`,

  // Admin
  admin:      "/admin",

  // API — same object as ApiPaths; use Routes.api in components, ApiPaths in handlers
  api: ApiPaths,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — TIER LIMITS
// Backend enforces these; Frontend uses them to gate UI and show warnings.
// ─────────────────────────────────────────────────────────────────────────────

/** Max upload file size — identical for both tiers. One place to change it. */
export const MAX_UPLOAD_SIZE_MB = 10;

export const TierLimits = {
  [SubscriptionTier.FREE]: {
    startingCredits:  3,
    maxDecks:         3,
    maxCardsPerDeck:  20,
    maxUploadPages:   Infinity,   // no page cap — the 10 MB file size is the only upload limit
    maxUploadSizeMb:  MAX_UPLOAD_SIZE_MB,
    deepDive:         false,
    livingDecks:      false,
    pdfExport:        false,
  },
  [SubscriptionTier.PRO]: {
    monthlyCredits:   30,
    maxDecks:         Infinity,   // NOTE: Infinity serialises to null in JSON — compare with === Infinity in logic
    // Finite (not Infinity) on purpose: bounds DeepSeek cost/latency and the
    // O(n^2) quiz distractor selection. Still far above the free cap.
    maxCardsPerDeck:  60,
    maxUploadPages:   Infinity,   // no page cap — the 10 MB file size is the only upload limit
    maxUploadSizeMb:  MAX_UPLOAD_SIZE_MB,
    deepDive:         true,
    livingDecks:      true,
    pdfExport:        true,
  },
  /** Trigger the upsell prompt at this many credits remaining — NOT at 0 */
  upsellTriggerAt: 1,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — REFERRAL / CREDIT EARNING CAPS
// ─────────────────────────────────────────────────────────────────────────────

export const ReferralCaps = {
  [ReferralEventType.SIGNUP]: {
    creditsAwarded: 10,
    monthlyCap:     5,      // max 5 referral signups credited per calendar month
    lifetimeCap:    null,   // no lifetime cap on this event type
  },
  [ReferralEventType.DECK_SHARE]: {
    creditsAwarded: 5,
    monthlyCap:     3,
    lifetimeCap:    null,
    minCards:       10,     // deck must have ≥ 10 cards before credit is awarded
  },
  [ReferralEventType.APP_REVIEW]: {
    creditsAwarded:            15,
    monthlyCap:                null,
    lifetimeCap:               1,    // once ever — enforced by lifetimeCap, not monthlyCap
    requiresAdminVerification: true,
  },
  [ReferralEventType.PROFILE_COMPLETE]: {
    creditsAwarded: 3,
    monthlyCap:     null,
    lifetimeCap:    1,
  },
} as const;

/**
 * Generate the month_key value for a given date.
 * Stored in referral_events.month_key for monthly cap enforcement.
 * Uses UTC to avoid timezone drift across the team.
 *
 * @example toMonthKey(new Date()) // → "2026-05"
 */
export const toMonthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — RATE LIMIT CONFIGURATION
// Keys reference ApiPaths — same strings used in fetch() calls and here.
// If a route path changes, both the rate limit key and the fetch URL update
// together automatically.
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitRule {
  windowMinutes: number;
  maxRequests:   number;
}

export const RateLimits: Record<string, RateLimitRule> = {
  [ApiPaths.upload]:           { windowMinutes: 60,   maxRequests: 5   },
  [ApiPaths.generate]:         { windowMinutes: 60,   maxRequests: 2   },
  [ApiPaths.submitQuizResult]: { windowMinutes: 60,   maxRequests: 30  },
  [ApiPaths.submitPayment]:    { windowMinutes: 1440, maxRequests: 2   }, // 24-hour window
  [ApiPaths.claimReferral]:    { windowMinutes: 1440, maxRequests: 5   },
  [ApiPaths.adminPayments]:    { windowMinutes: 60,   maxRequests: 200 },
  [ApiPaths.authLogin]:        { windowMinutes: 15,   maxRequests: 10  },
  "/api/decks/[id]/share":      { windowMinutes: 1440, maxRequests: 5   }, // 24-hour window
  "/api/decks/[id]/export":     { windowMinutes: 60,   maxRequests: 10  },
  [ApiPaths.claimProfileComplete]: { windowMinutes: 1440, maxRequests: 5 }, // 24-hour window
  [ApiPaths.submitAppReview]:      { windowMinutes: 1440, maxRequests: 2 }, // 24-hour window
  "/api/decks/[id]":            { windowMinutes: 60,   maxRequests: 60  }, // rename (PATCH)
  "/api/decks/[id]/flashcards": { windowMinutes: 60,   maxRequests: 60  },
  "/api/flashcards/[id]":       { windowMinutes: 60,   maxRequests: 120 },
  [ApiPaths.adminVerifyReview]: { windowMinutes: 60,   maxRequests: 120 },
  [ApiPaths.adminUsers]:        { windowMinutes: 60,   maxRequests: 200 },
  [ApiPaths.adminGrantCredits]: { windowMinutes: 60,   maxRequests: 60  },
  [ApiPaths.adminAuditLog]:     { windowMinutes: 60,   maxRequests: 200 },
  [ApiPaths.accountExport]:     { windowMinutes: 60,   maxRequests: 5   },
  [ApiPaths.accountDelete]:     { windowMinutes: 1440, maxRequests: 3   }, // 24-hour window
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — PDF / OCR THRESHOLDS
// Both frontend and backend use these to make the same quality decisions.
// ─────────────────────────────────────────────────────────────────────────────

export const OcrThresholds = {
  /** Avg chars/page below this → treat as image PDF → trigger OCR (Layer 2) */
  minCharsPerPageForText: 100,
  /** Tesseract confidence (0–1) below this for majority of pages → trigger paste fallback (Layer 3) */
  minTesseractConfidence: 0.6,
  /** Max tokens forwarded to DeepSeek after extraction */
  maxInputTokens:         40_000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — PRICING & PAYMENT
// ─────────────────────────────────────────────────────────────────────────────

export const Pricing = {
  pro: {
    amountPhp:            150,
    gcashReferenceLength: 13,  // GCash reference numbers are always exactly 13 digits
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — ADMIN & OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const AdminConfig = {
  /** Target payment verification SLA in hours (during operating hours) */
  slaHours:       2,
  /** Operating hours in PHT (24h). Outside these, show the student an estimated wait time. */
  operatingStart: 7,   // 7 AM PHT
  operatingEnd:   23,  // 11 PM PHT
  /** Minimum number of admin accounts that must exist at all times */
  minAdmins:      2,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — VALIDATION CONSTRAINTS
// Use these in Zod schemas, HTML maxLength attributes, and server-side checks.
// Single source for all 3 devs — no more mismatched length limits.
// ─────────────────────────────────────────────────────────────────────────────

export const Validation = {
  referralCode: {
    length: 8,  // referral codes are always exactly 8 characters
  },
  referenceNumber: {
    length:  Pricing.pro.gcashReferenceLength,
    pattern: /^\d{13}$/,  // must be exactly 13 numeric digits
  },
  deck: {
    titleMaxLength:    100,
    filenameMaxLength: 255,
  },
  flashcard: {
    frontMaxLength:    500,
    backMaxLength:     1000,
    maxTags:           5,
    tagMaxLength:      30,
    categoryMaxLength: 50,
  },
  profile: {
    fullNameMaxLength: 100,
    courseMaxLength:   100,
  },
  adminNotes: {
    maxLength: 500,
  },
  adminCreditGrant: {
    minAmount: 1,
    maxAmount: 1000,  // sane ceiling on a single manual grant — fat-finger guard
  },
  appReview: {
    textMaxLength: 1000,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12 — LIVING DECK CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const LivingDeck = {
  /** Cards with difficulty_score above this are selected for reinforcement */
  weakCardThreshold:      0.7,
  /** Max weak cards sent to DeepSeek per refresh (cost control) */
  maxWeakCardsPerRefresh: 5,
  /** A quiz score below this triggers a Living Deck refresh attempt */
  scorePercentThreshold:  70,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13 — USER-FACING MESSAGES
// Import these in components — never write UI copy inline.
// All 3 devs show identical strings to users this way.
// ─────────────────────────────────────────────────────────────────────────────

export const UIMessages = {
  // Upload / OCR flow
  ocrWarning:        "This looks like a scanned document. OCR processing may take 1–2 minutes.",
  ocrFallbackPrompt: "We couldn't read this document clearly. Paste your notes below and we'll generate cards from that instead.",
  ocrProgress:       (current: number, total: number) => `Processing page ${current} of ${total} (OCR)...`,

  // Credits
  upsellPrompt:      `You have 1 generation left. Upgrade to Pro for ₱${Pricing.pro.amountPhp}/month.`,
  creditDeducted:    (remaining: number) => `1 credit used. ${remaining} remaining.`,

  // Payment
  paymentSubmitted:  "Payment submitted! You'll receive a notification once verified. Your current credits are still available.",
  paymentApproved:   "Your payment has been verified! Pro features are now unlocked.",
  paymentRejected:   (reason: string) => `Payment rejected: ${reason}. Please resubmit or contact support.`,
  verificationEta:   `Usually verified within ${AdminConfig.slaHours} hours (7am–11pm PHT).`,

  // Living Decks
  livingDeckRefreshed: (count: number) => `${count} card${count === 1 ? "" : "s"} reinforced with new angles on this topic.`,
  livingDeckUpsell:    "Upgrade to Pro to have your deck automatically adapt to your weak areas.",

  // Pro feature gating
  proFeatureLocked:    "This feature is available on Pro. Upgrade to unlock it.",

  // Referral
  referralCredited:  (name: string, credits: number) => `+${credits} credits — ${name} signed up with your link!`,
  // Shown to the person ENTERING a code: the referrer (not the claimer) is credited.
  referralClaimThanks: (credits: number) => `Thanks! Your referrer earned +${credits} credits for referring you.`,

  // AI disclaimer — REQUIRED on every generated deck page (non-negotiable)
  aiDisclaimer:      "AI-generated content may contain errors. Always verify against your official course materials and textbooks. Do not rely on these cards as your sole study source.",

  // Credits / limits
  outOfCredits:      "You don't have enough credits. Purchase more to generate another deck.",
  deckLimitReached:  "You've reached your deck limit. Upgrade to Pro for unlimited decks.",

  // Generic errors
  aiUnavailable:     "AI processing is temporarily unavailable. Your document is saved — try again in a few minutes.",
  rateLimited:       "You've reached the request limit for this action. Please wait before trying again.",
  genericError:      "Something went wrong. Please try again or contact support.",

  // Account (E5)
  accountDeleteConfirm: "This permanently deletes your account, decks, flashcards, and quiz history. This cannot be undone. Continue?",
  accountDeleted:       "Your account has been deleted. We're sorry to see you go.",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14 — DATABASE ROW TYPES
// Mirror the Supabase schema exactly. Used by both sides for typed DB access.
// ─────────────────────────────────────────────────────────────────────────────

/** Extends auth.users. Created automatically via trigger on new user registration. */
export interface Profile {
  id:                      string;            // uuid — FK → auth.users.id
  email:                   string;
  full_name:               string | null;
  course:                  string | null;
  subscription_tier:       SubscriptionTier;
  subscription_expires_at: string | null;     // ISO 8601 timestamptz; null = free or not yet set
  token_balance:           number;            // ≥ 0 enforced by CHECK constraint
  lifetime_credits_earned: number;            // running total for fraud detection
  is_admin:                boolean;
  referral_code:           string;            // unique — auto-generated on signup
  referred_by:             string | null;     // uuid FK → profiles.id
  consent_deepseek:        boolean;           // MUST be true before any PDF processing
  credits_granted_at:      string | null;     // ISO 8601 timestamptz; last Pro monthly top-up, null = never
  created_at:              string;
  updated_at:              string;
}

export interface Deck {
  id:              string;
  user_id:         string;
  title:           string;
  source_filename: string | null;
  card_count:      number;            // cached count — updated after generation and refresh
  generation_mode: GenerationMode;
  pdf_type:        PdfType;           // for analytics on parsing success rates
  is_public:       boolean;           // B5 public sharing — true exposes the deck at /public/decks/[id]
  created_at:      string;
  updated_at:      string;
}

export interface Flashcard {
  id:               string;
  deck_id:          string;
  user_id:          string;
  front:            string;
  back:             string;
  tags:             string[];
  category:         string;   // topic group; mirrors flashcards.category in the DB
  is_reinforcement: boolean;          // true = generated by Living Deck refresh, not original
  difficulty_score: number;           // 0.0–1.0; higher = student struggles more
  times_seen:       number;
  times_correct:    number;
  last_reviewed_at: string | null;
  created_at:       string;
}

export interface QuizSession {
  id:                            string;
  deck_id:                       string;
  user_id:                       string;
  quiz_type:                     QuizType;
  total_questions:               number;
  correct_count:                 number;
  score_percent:                 number | null; // null until session is submitted
  living_deck_refresh_triggered: boolean;
  completed_at:                  string | null; // null until submitted
  created_at:                    string;
}

export interface QuizAnswer {
  id:           string;
  session_id:   string;
  flashcard_id: string;
  user_answer:  string | null;
  is_correct:   boolean;
  answered_at:  string;
}

export interface PaymentSubmission {
  id:               string;
  user_id:          string;
  reference_number: string;          // 13-digit GCash reference — use Validation.referenceNumber.pattern
  amount:           number;          // expected: Pricing.pro.amountPhp (150)
  payment_method:   PaymentMethod;
  status:           PaymentStatus;
  rejection_reason: string | null;
  verified_by:      string | null;   // admin profile.id
  verified_at:      string | null;
  created_at:       string;
}

export interface ReferralEvent {
  id:              string;
  referrer_id:     string;
  referred_id:     string | null;
  event_type:      ReferralEventType;
  credits_awarded: number;
  verified:        boolean;          // admin sets true for 'app_review' events before credits issue
  month_key:       string;           // format: "YYYY-MM" — always use toMonthKey() to generate
  deck_id:         string | null;    // set for 'deck_share' events; identifies the shared deck
  created_at:      string;
}

/** A user-submitted in-app review (B4 "Write a review" earn method). */
export interface AppReview {
  id:          string;
  user_id:     string;
  rating:      number;        // 1-5
  review_text: string;        // ≤ Validation.appReview.textMaxLength
  status:      "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at:  string;
}

export interface RateLimitLog {
  id:           string;
  user_id:      string;
  endpoint:     string;              // matches a key from RateLimits / ApiPaths
  requested_at: string;
}

export interface AdminActionLog {
  id:              string;
  admin_id:        string | null;
  payment_id:      string | null;       // null for non-payment actions (credit_grant, account_deleted)
  target_user_id:  string | null;       // set for credit_grant / account_deleted
  credits_amount:  number | null;       // set for credit_grant
  action:          AdminAction;
  notes:           string | null;
  created_at:      string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15 — API REQUEST & RESPONSE SHAPES
//
// PATTERN — every route handler must follow this contract:
//
//   Success → return ApiResponse<YourResultType> where success = true
//   Failure → return ApiFailResponse               where success = false
//
//   // In a route handler:
//   const body: ApiResponse<GenerateResult> = { success: true, ...result };
//   return Response.json(body, { status: 200 });
//
//   // In a component:
//   const res: ApiResponse<GenerateResult> = await resp.json();
//   if (!res.success) { toast(res.error.message); return; }
//   router.push(Routes.deck(res.deckId));
//
// Result types (the T in ApiResponse<T>) are named *Result — they hold only
// the success payload, not the success flag itself.
// ─────────────────────────────────────────────────────────────────────────────

// ── POST /api/upload ──────────────────────────────────────────────────────────
// Request: multipart/form-data with a `file` field (PDF only)

/**
 * What the server returns from /api/upload on success.
 * TEXT  → pdfjs extracted clean text. Send directly to /api/generate.
 * OCR   → image PDF detected (chars/page < OcrThresholds.minCharsPerPageForText).
 *          Client must run Tesseract.js, then send result to /api/generate.
 *
 * NOTE: Both paths are successes — the upload worked.
 *       The discriminant is `path`, not `success`.
 */
export type UploadResult =
  | { path: typeof PdfType.TEXT; extractedText: string }
  | {
      path:             typeof PdfType.OCR;
      message:          string;            // UIMessages.ocrWarning
      partialText:      string;            // text already extracted from non-sparse pages; may be ""
      imagePageNumbers: number[];          // 1-based page numbers that need client-side OCR
    };

/**
 * Client-side extraction state after OCR is complete.
 * Not sent over the wire — used for the frontend's internal upload state machine.
 *
 * PASTE path is reached client-side when Tesseract confidence < OcrThresholds.minTesseractConfidence.
 */
export type ExtractionState =
  | { path: typeof PdfType.TEXT;  extractedText: string }  // fast path — pdfjs succeeded
  | { path: typeof PdfType.OCR;   extractedText: string }  // OCR succeeded via Tesseract
  | { path: typeof PdfType.PASTE; extractedText: string }; // user pasted text manually

// ── POST /api/generate ────────────────────────────────────────────────────────
export interface GenerateRequest {
  extractedText:    string;
  title?:           string;           // optional — AI will infer a title if omitted
  generationMode?:  GenerationMode;
  pdfType:          PdfType;          // for analytics logging in the deck record
}

export interface GeneratedCard {
  front:    string;
  back:     string;
  tags:     string[];
  category: string;  // topic group — used by Living Deck to target weak areas per category
}

export interface GenerateResult {
  deckId:           string;
  cards:            GeneratedCard[];
  creditsRemaining: number;
}

// ── GET /api/decks ────────────────────────────────────────────────────────────
export interface DecksListResult {
  decks: Deck[];
}

// ── GET /api/decks/[id] ───────────────────────────────────────────────────────
export interface DeckDetailResult {
  deck:  Deck;
  cards: Flashcard[];
}

// ── PATCH /api/decks/[id] ─────────────────────────────────────────────────────
export interface RenameDeckRequest {
  title: string;  // ≤ Validation.deck.titleMaxLength
}

export interface RenameDeckResult {
  deck: Deck;
}

// ── POST /api/decks/[id]/flashcards ───────────────────────────────────────────
export interface CreateFlashcardRequest {
  front:    string;   // ≤ Validation.flashcard.frontMaxLength
  back:     string;   // ≤ Validation.flashcard.backMaxLength
  tags?:    string[]; // ≤ Validation.flashcard.maxTags, each ≤ Validation.flashcard.tagMaxLength
  category?: string;
}

export interface CreateFlashcardResult {
  card:      Flashcard;
  cardCount: number;
}

// ── PATCH /api/flashcards/[id] ────────────────────────────────────────────────
export interface UpdateFlashcardRequest {
  front?:    string;
  back?:     string;
  tags?:     string[];
  category?: string;
}

export interface UpdateFlashcardResult {
  card: Flashcard;
}

// ── DELETE /api/flashcards/[id] ───────────────────────────────────────────────
export interface DeleteFlashcardResult {
  flashcardId: string;
  cardCount:   number;
}

// ── POST /api/quiz/[id] ───────────────────────────────────────────────────────
export interface StartQuizRequest {
  quizType: QuizType;
}

export interface QuizQuestion {
  flashcardId:   string;
  questionText:  string;
  quizType:      Extract<QuizType, "multiple_choice" | "identification">;
  options?:      string[];   // only present for multiple_choice
  correctAnswer: string;     // backend sends this; frontend hides it until the student answers
}

export interface StartQuizResult {
  sessionId: string;
  questions: QuizQuestion[];
}

// ── POST /api/quiz/result ─────────────────────────────────────────────────────
export interface SubmitQuizAnswer {
  flashcardId: string;
  userAnswer:  string | null;
  isCorrect:   boolean;
}

export interface SubmitQuizResultRequest {
  sessionId: string;
  answers:   SubmitQuizAnswer[];
}

export interface SubmitQuizResultData {
  scorePercent:               number;
  correctCount:               number;
  totalQuestions:             number;
  livingDeckRefreshTriggered: boolean;
  reinforcedCardCount?:       number;   // only present when livingDeckRefreshTriggered = true
  upsellMessage?:             string;   // shown to non-Pro users instead of a refresh
}

// ── GET /api/quiz/history ─────────────────────────────────────────────────────
/** A completed quiz session, with the deck title joined for display. */
export interface QuizHistoryRow extends QuizSession {
  deckTitle: string;
}

export interface QuizHistoryResult {
  sessions: QuizHistoryRow[];
}

// ── POST /api/referral/claim ──────────────────────────────────────────────────
export interface ClaimReferralRequest {
  referralCode: string;
}

export interface ClaimReferralResult {
  creditsAwarded: number;
  newBalance:     number;
}

// ── POST /api/payment/submit ──────────────────────────────────────────────────
export interface SubmitPaymentRequest {
  referenceNumber: string;   // must pass Validation.referenceNumber.pattern
  amount:          number;   // must equal Pricing.pro.amountPhp (150)
  paymentMethod:   PaymentMethod;
}

export interface SubmitPaymentResult {
  submissionId:                string;
  estimatedVerificationMessage:string;  // UIMessages.verificationEta
}

// ── GET /api/admin/payments ───────────────────────────────────────────────────
export interface AdminPaymentRow extends PaymentSubmission {
  userEmail:              string;   // joined from profiles
  minutesSinceSubmission: number;   // computed server-side for the admin dashboard
}

export interface AdminPaymentsListResult {
  submissions: AdminPaymentRow[];
}

// ── POST /api/admin/payments/approve ─────────────────────────────────────────
export interface ApprovePaymentRequest {
  paymentId: string;
  notes?:    string;
}

export interface ApprovePaymentResult {
  userId:  string;
  newTier: typeof SubscriptionTier.PRO;
}

// ── POST /api/admin/payments/reject ──────────────────────────────────────────
export interface RejectPaymentRequest {
  paymentId:       string;
  rejectionReason: string;  // shown to the student — keep it human-readable
  notes?:          string;
}

// (Reject success has no extra payload — { success: true } is sufficient)

// ── Rewards (B4): self-claimed + admin-verified earn methods ─────────────────
export interface ClaimRewardResult {
  creditsAwarded: number;
  newBalance:     number;
}

// ── POST /api/rewards/claim-profile-complete ──────────────────────────────────
export interface ClaimProfileCompleteRequest {
  fullName: string;
  course:   string;
}

export interface ClaimProfileCompleteResult extends ClaimRewardResult {
  fullName: string | null;
  course:   string | null;
}

// ── POST /api/decks/[id]/share ────────────────────────────────────────────────
export interface ShareDeckResult {
  isPublic:       boolean;
  creditsAwarded: number;
}

// ── POST /api/rewards/submit-review ───────────────────────────────────────────
export interface SubmitAppReviewRequest {
  rating:     number;   // 1-5
  reviewText: string;   // ≤ Validation.appReview.textMaxLength
}

// ── GET /api/admin/reviews ─────────────────────────────────────────────────────
export interface AdminAppReviewRow extends AppReview {
  userEmail: string;   // joined from profiles
}

export interface AdminReviewsListResult {
  reviews: AdminAppReviewRow[];
}

// ── POST /api/admin/reviews/verify ─────────────────────────────────────────────
export interface VerifyReviewRequest {
  reviewId: string;
  approve:  boolean;
  notes?:   string;
}

export interface VerifyReviewResult {
  userId:         string;
  creditsAwarded: number;
}

// ── GET /api/admin/users (E4) ──────────────────────────────────────────────────
/** Minimal profile fields for the admin user-management list. */
export interface AdminUserRow {
  id:                string;
  email:             string;
  full_name:         string | null;
  subscription_tier: SubscriptionTier;
  token_balance:     number;
  is_admin:          boolean;
  created_at:        string;
}

export interface AdminUsersListResult {
  users: AdminUserRow[];
}

// ── POST /api/admin/users/grant-credits (E4) ───────────────────────────────────
export interface GrantCreditsRequest {
  userId:  string;
  amount:  number;   // Validation.adminCreditGrant.minAmount..maxAmount
  notes?:  string;   // ≤ Validation.adminNotes.maxLength
}

export interface GrantCreditsResult {
  userId:     string;
  newBalance: number;
}

// ── GET /api/admin/audit-log (E4) ──────────────────────────────────────────────
export interface AdminAuditLogRow extends AdminActionLog {
  adminEmail:      string | null;   // joined from profiles via admin_id
  targetUserEmail: string | null;   // joined from profiles via target_user_id
  paymentReference: string | null;  // joined from payment_submissions via payment_id
}

export interface AdminAuditLogResult {
  actions: AdminAuditLogRow[];
}

// ── POST /api/account/delete (E5) ───────────────────────────────────────────────
// (No success payload — { success: true } is sufficient)

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16 — SHARED UTILITY TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Standard error shape returned by all API routes on failure */
export interface ApiError {
  code:    ApiErrorCode;
  message: string;   // human-readable, safe to display in UI — avoid leaking internals
}

export const ApiErrorCode = {
  // Auth
  UNAUTHORIZED:             "UNAUTHORIZED",
  FORBIDDEN:                "FORBIDDEN",
  CONSENT_REQUIRED:         "CONSENT_REQUIRED",   // consent_deepseek = false

  // Limits
  INSUFFICIENT_CREDITS:     "INSUFFICIENT_CREDITS",
  DECK_LIMIT_REACHED:       "DECK_LIMIT_REACHED",
  PAGE_LIMIT_EXCEEDED:      "PAGE_LIMIT_EXCEEDED",
  FILE_TOO_LARGE:           "FILE_TOO_LARGE",
  INVALID_FILE_TYPE:        "INVALID_FILE_TYPE",

  // Rate limiting
  RATE_LIMITED:             "RATE_LIMITED",

  // Referral
  INVALID_REFERRAL_CODE:    "INVALID_REFERRAL_CODE",
  REFERRAL_CAP_REACHED:     "REFERRAL_CAP_REACHED",
  SELF_REFERRAL:            "SELF_REFERRAL",

  // Payment
  INVALID_REFERENCE_NUMBER: "INVALID_REFERENCE_NUMBER",
  PAYMENT_ALREADY_PENDING:  "PAYMENT_ALREADY_PENDING",

  // Rewards
  REVIEW_ALREADY_SUBMITTED: "REVIEW_ALREADY_SUBMITTED",

  // AI / processing
  AI_UNAVAILABLE:           "AI_UNAVAILABLE",    // DeepSeek timeout / downtime
  EXTRACTION_FAILED:        "EXTRACTION_FAILED", // all 3 layers failed

  // Generic
  VALIDATION_ERROR:         "VALIDATION_ERROR",
  INTERNAL_ERROR:           "INTERNAL_ERROR",
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** Standard failure body. Every failed API response must match this shape. */
export interface ApiFailResponse {
  success: false;
  error:   ApiError;
}

/**
 * The return type for every route handler.
 *
 * On success: { success: true, ...T fields }
 * On failure: { success: false, error: ApiError }
 *
 * @example
 *   // Route handler (backend):
 *   const result: ApiResponse<GenerateResult> = {
 *     success: true,
 *     deckId: deck.id,
 *     cards,
 *     creditsRemaining: profile.token_balance,
 *   };
 *   return Response.json(result);
 *
 *   // Component (frontend):
 *   const res: ApiResponse<GenerateResult> = await resp.json();
 *   if (!res.success) { toast.error(res.error.message); return; }
 *   router.push(Routes.deck(res.deckId));
 */
export type ApiResponse<T> =
  | ({ success: true } & T)
  | ApiFailResponse;

/** Return type of the checkRateLimit() utility function */
export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;   // requests remaining in the current window
}
