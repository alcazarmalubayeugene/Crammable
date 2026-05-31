/**
 * contracts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for the Gizmo Competitor project.
 *
 * DROP THIS FILE IN:  src/lib/contracts.ts
 *
 * WHO USES IT
 *   Frontend (1)  — import types for components, API calls, state management
 *   Backend  (2)  — import types for route handlers, DB queries, validation
 *
 * RULES
 *   1. Never hardcode a string that exists here — always import the constant.
 *   2. Every API request body and response shape must match the interfaces below.
 *   3. When the schema changes, update this file first, then both sides adapt.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — ENUMS & CONSTANTS
// Use these everywhere instead of raw strings.
// ─────────────────────────────────────────────────────────────────────────────

/** Subscription tiers stored in profiles.subscription_tier */
export const SubscriptionTier = {
  FREE: "free",
  PRO: "pro",
} as const;
export type SubscriptionTier = (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

/** How a deck's source text was obtained — stored in decks.pdf_type */
export const PdfType = {
  TEXT: "text",   // pdfjs-dist extracted text directly
  OCR: "ocr",     // Tesseract.js OCR path
  PASTE: "paste", // Manual paste fallback
} as const;
export type PdfType = (typeof PdfType)[keyof typeof PdfType];

/** AI generation mode — stored in decks.generation_mode */
export const GenerationMode = {
  STANDARD: "standard",
  DEEP_DIVE: "deep_dive",
} as const;
export type GenerationMode = (typeof GenerationMode)[keyof typeof GenerationMode];

/** Quiz types — stored in quiz_sessions.quiz_type */
export const QuizType = {
  MULTIPLE_CHOICE: "multiple_choice",
  IDENTIFICATION: "identification",
  MIXED: "mixed",
} as const;
export type QuizType = (typeof QuizType)[keyof typeof QuizType];

/** Payment status — stored in payment_submissions.status */
export const PaymentStatus = {
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** Payment method — stored in payment_submissions.payment_method */
export const PaymentMethod = {
  GCASH: "gcash",
  CASH: "cash",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** Admin action types — stored in admin_action_log.action */
export const AdminAction = {
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export type AdminAction = (typeof AdminAction)[keyof typeof AdminAction];

/** Referral / credit-earning event types — stored in referral_events.event_type */
export const ReferralEventType = {
  SIGNUP: "signup",
  DECK_SHARE: "deck_share",
  APP_REVIEW: "app_review",
  PROFILE_COMPLETE: "profile_complete",
} as const;
export type ReferralEventType = (typeof ReferralEventType)[keyof typeof ReferralEventType];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — TIER LIMITS
// Backend enforces these; Frontend uses them to gate UI and show warnings.
// ─────────────────────────────────────────────────────────────────────────────

export const TierLimits = {
  [SubscriptionTier.FREE]: {
    startingCredits: 3,
    maxDecks: 3,
    maxCardsPerDeck: 20,
    maxUploadPages: 15,
    maxUploadSizeMb: 10,
    deepDive: false,
    livingDecks: false,
    pdfExport: false,
  },
  [SubscriptionTier.PRO]: {
    monthlyCredits: 30,
    maxDecks: Infinity,
    maxCardsPerDeck: Infinity,
    maxUploadPages: 50,
    maxUploadSizeMb: 10,
    deepDive: true,
    livingDecks: true,
    pdfExport: true,
  },
  /** Show the upsell prompt when the user has this many credits left */
  upsellTriggerAt: 1,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — REFERRAL / CREDIT EARNING CAPS
// ─────────────────────────────────────────────────────────────────────────────

export const ReferralCaps = {
  [ReferralEventType.SIGNUP]: {
    creditsAwarded: 10,
    monthlyCap: 5,        // max 5 referral signups credited per month
    lifetimeCap: null,    // no lifetime cap
  },
  [ReferralEventType.DECK_SHARE]: {
    creditsAwarded: 5,
    monthlyCap: 3,
    lifetimeCap: null,
    minCards: 10,         // deck must have at least 10 cards
  },
  [ReferralEventType.APP_REVIEW]: {
    creditsAwarded: 15,
    monthlyCap: null,     // once ever — enforced by lifetimeCap
    lifetimeCap: 1,
    requiresAdminVerification: true,
  },
  [ReferralEventType.PROFILE_COMPLETE]: {
    creditsAwarded: 3,
    monthlyCap: null,
    lifetimeCap: 1,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — RATE LIMIT CONFIGURATION
// Backend reads these to configure checkRateLimit(); Frontend reads them
// to display "X requests remaining" or retry-after messaging.
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitRule {
  windowMinutes: number;
  maxRequests: number;
}

export const RateLimits: Record<string, RateLimitRule> = {
  "/api/generate":          { windowMinutes: 60,   maxRequests: 2   },
  "/api/upload":            { windowMinutes: 60,   maxRequests: 5   },
  "/api/quiz/result":       { windowMinutes: 60,   maxRequests: 30  },
  "/api/payment/submit":    { windowMinutes: 1440, maxRequests: 2   }, // 24 h
  "/api/referral/claim":    { windowMinutes: 1440, maxRequests: 5   },
  "/api/admin/payments":    { windowMinutes: 60,   maxRequests: 200 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — PDF / OCR THRESHOLDS
// Both sides need these to make the same quality decisions.
// ─────────────────────────────────────────────────────────────────────────────

export const OcrThresholds = {
  /** Avg characters per page below this → treat as image PDF, trigger OCR */
  minCharsPerPageForText: 100,
  /** Tesseract confidence score (0–1) below this for majority of pages → trigger paste fallback */
  minTesseractConfidence: 0.6,
  /** Max tokens forwarded to DeepSeek after extraction */
  maxInputTokens: 40_000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — PRICING
// ─────────────────────────────────────────────────────────────────────────────

export const Pricing = {
  pro: {
    amountPhp: 150,
    /** Expected GCash reference number length */
    gcashReferenceLength: 13,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — DATABASE ROW TYPES
// Mirror the Supabase schema exactly. Used by both sides for typed DB access.
// ─────────────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;                        // uuid — FK → auth.users.id
  email: string;
  full_name: string | null;
  course: string | null;
  subscription_tier: SubscriptionTier;
  subscription_expires_at: string | null; // ISO 8601 timestamptz
  token_balance: number;             // ≥ 0
  lifetime_credits_earned: number;
  is_admin: boolean;
  referral_code: string;             // unique
  referred_by: string | null;        // uuid FK → profiles.id
  consent_deepseek: boolean;         // MUST be true before any PDF processing
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: string;
  user_id: string;
  title: string;
  source_filename: string | null;
  card_count: number;
  generation_mode: GenerationMode;
  pdf_type: PdfType;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  user_id: string;
  front: string;
  back: string;
  tags: string[];
  is_reinforcement: boolean;         // true = generated by Living Deck refresh
  difficulty_score: number;          // 0.0 – 1.0; higher = needs more review
  times_seen: number;
  times_correct: number;
  last_reviewed_at: string | null;
  created_at: string;
}

export interface QuizSession {
  id: string;
  deck_id: string;
  user_id: string;
  quiz_type: QuizType;
  total_questions: number;
  correct_count: number;
  score_percent: number | null;      // null until session submitted
  living_deck_refresh_triggered: boolean;
  completed_at: string | null;       // null until submitted
  created_at: string;
}

export interface QuizAnswer {
  id: string;
  session_id: string;
  flashcard_id: string;
  user_answer: string | null;
  is_correct: boolean;
  answered_at: string;
}

export interface PaymentSubmission {
  id: string;
  user_id: string;
  reference_number: string;          // 13-digit GCash reference
  amount: number;                    // expected: 150.00
  payment_method: PaymentMethod;
  status: PaymentStatus;
  rejection_reason: string | null;
  verified_by: string | null;        // admin profile.id
  verified_at: string | null;
  created_at: string;
}

export interface ReferralEvent {
  id: string;
  referrer_id: string;
  referred_id: string | null;
  event_type: ReferralEventType;
  credits_awarded: number;
  verified: boolean;                 // admin sets true for 'app_review'
  month_key: string;                 // format: "YYYY-MM"
  created_at: string;
}

export interface RateLimitLog {
  id: string;
  user_id: string;
  endpoint: string;
  requested_at: string;
}

export interface AdminActionLog {
  id: string;
  admin_id: string;
  payment_id: string;
  action: AdminAction;
  notes: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — API REQUEST & RESPONSE SHAPES
// Frontend sends these; Backend validates and returns these.
// ─────────────────────────────────────────────────────────────────────────────

// ── POST /api/upload ──────────────────────────────────────────────────────────
// Request: multipart/form-data with a `file` field (PDF only)

export type UploadResponse =
  | { success: true;  extractedText: string; pdfType: PdfType.TEXT }
  | { success: false; needsOCR: true }  // client should run Tesseract.js
  | { success: false; error: ApiError };

// ── POST /api/generate ───────────────────────────────────────────────────────
export interface GenerateRequest {
  extractedText: string;
  title?: string;              // optional — AI will infer if omitted
  generationMode?: GenerationMode;
  pdfType: PdfType;            // for analytics logging in deck record
}

export interface GeneratedCard {
  front: string;
  back: string;
  tags: string[];
}

export interface GenerateResponse {
  success: true;
  deckId: string;
  cards: GeneratedCard[];
  creditsRemaining: number;
}

// ── GET /api/decks ────────────────────────────────────────────────────────────
export interface DecksListResponse {
  decks: Deck[];
}

// ── GET /api/decks/[id] ───────────────────────────────────────────────────────
export interface DeckDetailResponse {
  deck: Deck;
  cards: Flashcard[];
}

// ── POST /api/quiz/[id] ───────────────────────────────────────────────────────
export interface StartQuizRequest {
  quizType: QuizType;
}

export interface QuizQuestion {
  flashcardId: string;
  questionText: string;
  quizType: Extract<QuizType, "multiple_choice" | "identification">;
  options?: string[];            // present only for multiple_choice
  correctAnswer: string;         // Backend sends this; Frontend hides until answered
}

export interface StartQuizResponse {
  sessionId: string;
  questions: QuizQuestion[];
}

// ── POST /api/quiz/result ─────────────────────────────────────────────────────
export interface SubmitQuizAnswer {
  flashcardId: string;
  userAnswer: string | null;
  isCorrect: boolean;
}

export interface SubmitQuizResultRequest {
  sessionId: string;
  answers: SubmitQuizAnswer[];
}

export interface SubmitQuizResultResponse {
  success: true;
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  livingDeckRefreshTriggered: boolean;
  reinforcedCardCount?: number;  // only present if livingDeckRefreshTriggered = true
}

// ── POST /api/referral/claim ──────────────────────────────────────────────────
export interface ClaimReferralRequest {
  referralCode: string;
}

export interface ClaimReferralResponse {
  success: true;
  creditsAwarded: number;
  newBalance: number;
}

// ── POST /api/payment/submit ──────────────────────────────────────────────────
export interface SubmitPaymentRequest {
  referenceNumber: string;       // 13 digits
  amount: number;                // must equal Pricing.pro.amountPhp
  paymentMethod: PaymentMethod;
}

export interface SubmitPaymentResponse {
  success: true;
  submissionId: string;
  estimatedVerificationMessage: string;
}

// ── GET /api/admin/payments ───────────────────────────────────────────────────
export interface AdminPaymentRow extends PaymentSubmission {
  userEmail: string;
  minutesSinceSubmission: number;
}

export interface AdminPaymentsListResponse {
  submissions: AdminPaymentRow[];
}

// ── POST /api/admin/payments/approve ─────────────────────────────────────────
export interface ApprovePaymentRequest {
  paymentId: string;
  notes?: string;
}

export interface ApprovePaymentResponse {
  success: true;
  userId: string;
  newTier: typeof SubscriptionTier.PRO;
}

// ── POST /api/admin/payments/reject ──────────────────────────────────────────
export interface RejectPaymentRequest {
  paymentId: string;
  rejectionReason: string;
  notes?: string;
}

export interface RejectPaymentResponse {
  success: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — SHARED UTILITY TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Standard error shape returned by all API routes on failure */
export interface ApiError {
  code: ApiErrorCode;
  message: string;          // human-readable, safe to show in UI
}

export const ApiErrorCode = {
  // Auth
  UNAUTHORIZED:              "UNAUTHORIZED",
  FORBIDDEN:                 "FORBIDDEN",
  CONSENT_REQUIRED:          "CONSENT_REQUIRED",   // consent_deepseek = false

  // Limits
  INSUFFICIENT_CREDITS:      "INSUFFICIENT_CREDITS",
  DECK_LIMIT_REACHED:        "DECK_LIMIT_REACHED",
  PAGE_LIMIT_EXCEEDED:       "PAGE_LIMIT_EXCEEDED",
  FILE_TOO_LARGE:            "FILE_TOO_LARGE",
  INVALID_FILE_TYPE:         "INVALID_FILE_TYPE",

  // Rate limiting
  RATE_LIMITED:              "RATE_LIMITED",

  // Referral
  INVALID_REFERRAL_CODE:     "INVALID_REFERRAL_CODE",
  REFERRAL_CAP_REACHED:      "REFERRAL_CAP_REACHED",
  SELF_REFERRAL:             "SELF_REFERRAL",

  // Payment
  INVALID_REFERENCE_NUMBER:  "INVALID_REFERENCE_NUMBER",
  PAYMENT_ALREADY_PENDING:   "PAYMENT_ALREADY_PENDING",

  // AI / processing
  AI_UNAVAILABLE:            "AI_UNAVAILABLE",    // DeepSeek timeout / down
  EXTRACTION_FAILED:         "EXTRACTION_FAILED", // all 3 layers failed

  // Generic
  VALIDATION_ERROR:          "VALIDATION_ERROR",
  INTERNAL_ERROR:            "INTERNAL_ERROR",
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** Wrapper for every failed API response */
export interface ApiFailResponse {
  success: false;
  error: ApiError;
}

/** Return type of the checkRateLimit() utility */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;   // requests left in current window
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — ROUTE PATHS
// Never hardcode route strings in components or handlers — import from here.
// ─────────────────────────────────────────────────────────────────────────────

export const Routes = {
  // Public
  home:       "/",
  signup:     "/signup",
  login:      "/login",

  // Authenticated
  dashboard:  "/dashboard",
  newDeck:    "/decks/new",
  deck:       (id: string) => `/decks/${id}`,
  quiz:       (deckId: string) => `/quiz/${deckId}`,
  quizResult: (deckId: string) => `/quiz/${deckId}/result`,
  upgrade:    "/upgrade",
  rewards:    "/rewards",
  settings:   "/settings",

  // Admin
  admin:      "/admin",

  // API
  api: {
    upload:               "/api/upload",
    generate:             "/api/generate",
    decks:                "/api/decks",
    deck:                 (id: string) => `/api/decks/${id}`,
    startQuiz:            (id: string) => `/api/quiz/${id}`,
    submitQuizResult:     "/api/quiz/result",
    claimReferral:        "/api/referral/claim",
    submitPayment:        "/api/payment/submit",
    adminPayments:        "/api/admin/payments",
    adminApprovePayment:  "/api/admin/payments/approve",
    adminRejectPayment:   "/api/admin/payments/reject",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — LIVING DECK CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const LivingDeck = {
  /** Cards with difficulty_score above this are selected for reinforcement */
  weakCardThreshold: 0.7,
  /** Max weak cards sent to DeepSeek per refresh (cost control) */
  maxWeakCardsPerRefresh: 5,
} as const;
