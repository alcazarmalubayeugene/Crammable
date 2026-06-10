"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { authHeaders } from "@/lib/api/auth-headers";
import {
  AdminConfig,
  App,
  ApiPaths,
  MAX_UPLOAD_SIZE_MB,
  PaymentMethod,
  PaymentStatus,
  Pricing,
  Routes,
  SubscriptionTier,
  TableNames,
  TierLimits,
  UIMessages,
  Validation,
  type ApiResponse,
  type SubmitPaymentResult,
} from "@/lib/contracts";

// ── types ─────────────────────────────────────────────────────────────────────

type Phase = "loading" | "already_pro" | "pending" | "form" | "submitted";

interface MinProfile {
  token_balance: number;
  full_name: string | null;
  subscription_tier: string;
}

interface LatestPayment {
  status: string;
  rejection_reason: string | null;
}

// ── Pro feature list ──────────────────────────────────────────────────────────

const FREE_FEATURES = [
  `${TierLimits.free.maxDecks} decks`,
  `${TierLimits.free.maxCardsPerDeck} cards per deck`,
  `Unlimited pages per upload (max ${MAX_UPLOAD_SIZE_MB} MB)`,
  `${TierLimits.free.startingCredits} starting credits`,
];

const PRO_FEATURES = [
  "Unlimited decks",
  `${TierLimits.pro.maxCardsPerDeck} cards per deck`,
  `Unlimited pages per upload (max ${MAX_UPLOAD_SIZE_MB} MB)`,
  `${TierLimits.pro.monthlyCredits} credits every month`,
  "Deep Dive generation mode",
  "Living Decks (auto-refresh weak cards)",
  "PDF export",
];

// ── component ─────────────────────────────────────────────────────────────────

export default function UpgradePage() {
  const [profile, setProfile] = useState<MinProfile | null>(null);
  const [latestPayment, setLatestPayment] = useState<LatestPayment | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  const [refNum, setRefNum] = useState("");
  const [inputError, setInputError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = Routes.login;
        return;
      }

      const [profileRes, paymentRes] = await Promise.all([
        supabase
          .from(TableNames.profiles)
          .select("token_balance, full_name, subscription_tier")
          .eq("id", user.id)
          .single(),
        supabase
          .from(TableNames.paymentSubmissions)
          .select("status, rejection_reason")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const p = profileRes.data as MinProfile | null;
      setProfile(p);

      if (p?.subscription_tier === SubscriptionTier.PRO) {
        setPhase("already_pro");
        return;
      }

      const payment = paymentRes.data as LatestPayment | null;
      setLatestPayment(payment);

      if (payment?.status === PaymentStatus.PENDING) {
        setPhase("pending");
        return;
      }

      setPhase("form");
    }
    load();
  }, []);

  // ── validation ───────────────────────────────────────────────────────────────

  function validateRef(value: string): string {
    if (!value.trim()) return "Please enter your GCash reference number.";
    if (!Validation.referenceNumber.pattern.test(value.trim()))
      return `Reference number must be exactly ${Validation.referenceNumber.length} digits.`;
    return "";
  }

  // ── submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateRef(refNum);
    if (err) { setInputError(err); return; }
    setInputError("");
    setSubmitError("");
    setSubmitting(true);

    try {
      const res = await fetch(ApiPaths.submitPayment, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        } as HeadersInit,
        body: JSON.stringify({
          referenceNumber: refNum.trim(),
          amount: Pricing.pro.amountPhp,
          paymentMethod: PaymentMethod.GCASH,
        }),
      });

      const data = (await res.json()) as ApiResponse<SubmitPaymentResult>;

      if (!data.success) {
        setSubmitError(data.error.message);
        return;
      }

      setPhase("submitted");
    } catch {
      setSubmitError(UIMessages.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  // ── loading ──────────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#FAF2E4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "#8A6E52", fontFamily: "var(--font-dm-sans, sans-serif)" }}>
          Loading…
        </p>
      </main>
    );
  }

  // ── shared navbar ─────────────────────────────────────────────────────────────

  const Navbar = (
    <nav
      style={{
        background: "#2E1A0C",
        borderBottom: "1px solid #4A2512",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a
            href={Routes.dashboard}
            style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
          >
            <span style={{ fontSize: 14, color: "#C49A6C" }}>← Back</span>
          </a>
          <span style={{ color: "#4A2512", margin: "0 8px" }}>|</span>
          <span style={{ fontSize: 24 }}>🦫</span>
          <span
            style={{
              fontFamily: "var(--font-lora, serif)",
              fontWeight: 700,
              fontSize: 18,
              color: "#FAF2E4",
            }}
          >
            {App.name}
          </span>
        </div>

        {profile && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#4A2512",
              border: "1px solid rgba(196,122,46,0.3)",
              borderRadius: 20,
              padding: "5px 14px",
            }}
          >
            <span style={{ fontSize: 14 }}>🪙</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#D4954A" }}>
              {profile.token_balance} credits
            </span>
          </div>
        )}
      </div>
    </nav>
  );

  // ── already pro ───────────────────────────────────────────────────────────────

  if (phase === "already_pro") {
    return (
      <main style={{ minHeight: "100vh", background: "#FAF2E4", fontFamily: "var(--font-dm-sans, sans-serif)" }}>
        {Navbar}
        <div
          style={{
            maxWidth: 520,
            margin: "80px auto",
            padding: "0 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>🏆</div>
          <h1
            style={{
              fontFamily: "var(--font-lora, serif)",
              fontSize: 26,
              fontWeight: 700,
              color: "#2E1A0C",
              marginBottom: 8,
            }}
          >
            You&apos;re already on Pro!
          </h1>
          <p style={{ color: "#8A6E52", fontSize: 15, marginBottom: 28 }}>
            You have full access to all Pro features.
          </p>
          <a
            href={Routes.dashboard}
            style={{
              display: "inline-block",
              background: "#C47A2E",
              color: "#FAF2E4",
              padding: "12px 28px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Back to Dashboard
          </a>
        </div>
      </main>
    );
  }

  // ── pending ───────────────────────────────────────────────────────────────────

  if (phase === "pending") {
    return (
      <main style={{ minHeight: "100vh", background: "#FAF2E4", fontFamily: "var(--font-dm-sans, sans-serif)" }}>
        {Navbar}
        <div style={{ maxWidth: 520, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
          <h1
            style={{
              fontFamily: "var(--font-lora, serif)",
              fontSize: 26,
              fontWeight: 700,
              color: "#2E1A0C",
              marginBottom: 8,
            }}
          >
            Payment under review
          </h1>
          <p style={{ color: "#8A6E52", fontSize: 15, lineHeight: 1.6, marginBottom: 8 }}>
            {UIMessages.paymentSubmitted}
          </p>
          <p style={{ color: "#C49A6C", fontSize: 13, marginBottom: 28 }}>
            {UIMessages.verificationEta}
          </p>
          <a
            href={Routes.dashboard}
            style={{
              display: "inline-block",
              background: "#FFFCF7",
              color: "#2E1A0C",
              border: "1.5px solid #E0C9A8",
              padding: "12px 28px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Back to Dashboard
          </a>
        </div>
      </main>
    );
  }

  // ── submitted ─────────────────────────────────────────────────────────────────

  if (phase === "submitted") {
    return (
      <main style={{ minHeight: "100vh", background: "#FAF2E4", fontFamily: "var(--font-dm-sans, sans-serif)" }}>
        {Navbar}
        <div style={{ maxWidth: 520, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h1
            style={{
              fontFamily: "var(--font-lora, serif)",
              fontSize: 26,
              fontWeight: 700,
              color: "#2E1A0C",
              marginBottom: 8,
            }}
          >
            Payment submitted!
          </h1>
          <p style={{ color: "#8A6E52", fontSize: 15, lineHeight: 1.6, marginBottom: 8 }}>
            {UIMessages.paymentSubmitted}
          </p>
          <p style={{ color: "#C49A6C", fontSize: 13, marginBottom: 28 }}>
            {UIMessages.verificationEta}
          </p>
          <a
            href={Routes.dashboard}
            style={{
              display: "inline-block",
              background: "#C47A2E",
              color: "#FAF2E4",
              padding: "12px 28px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Back to Dashboard
          </a>
        </div>
      </main>
    );
  }

  // ── main upgrade form ─────────────────────────────────────────────────────────

  const wasRejected = latestPayment?.status === PaymentStatus.REJECTED;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FAF2E4",
        fontFamily: "var(--font-dm-sans, sans-serif)",
      }}
    >
      {Navbar}

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 64px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1
            style={{
              fontFamily: "var(--font-lora, serif)",
              fontSize: 30,
              fontWeight: 700,
              color: "#2E1A0C",
              marginBottom: 8,
            }}
          >
            Upgrade to Pro
          </h1>
          <p style={{ color: "#8A6E52", fontSize: 15 }}>
            One-time payment of{" "}
            <span style={{ fontWeight: 700, color: "#C47A2E" }}>
              ₱{Pricing.pro.amountPhp}
            </span>{" "}
            via GCash. Verified by our team within{" "}
            {AdminConfig.slaHours} hours.
          </p>
        </div>

        {/* Rejection notice */}
        {wasRejected && (
          <div
            style={{
              background: "#FEF2F2",
              border: "1.5px solid #EF4444",
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 24,
            }}
          >
            <p style={{ fontSize: 14, color: "#991B1B", margin: 0 }}>
              ❌{" "}
              {UIMessages.paymentRejected(
                latestPayment?.rejection_reason ?? "Please check your reference number and try again.",
              )}
            </p>
          </div>
        )}

        {/* Feature comparison */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 28,
          }}
        >
          {/* Free */}
          <div
            style={{
              background: "#FFFCF7",
              border: "1.5px solid #E0C9A8",
              borderRadius: 16,
              padding: "22px 20px",
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#8A6E52",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Free
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {FREE_FEATURES.map((f) => (
                <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#8A6E52" }}>
                  <span>○</span> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div
            style={{
              background: "#4A2512",
              border: "1.5px solid #C47A2E",
              borderRadius: 16,
              padding: "22px 20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#C47A2E",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                Pro
              </p>
              <span
                style={{
                  fontSize: 11,
                  background: "#C47A2E",
                  color: "#FAF2E4",
                  borderRadius: 20,
                  padding: "2px 8px",
                  fontWeight: 600,
                }}
              >
                ₱{Pricing.pro.amountPhp}
              </span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {PRO_FEATURES.map((f) => (
                <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#FAF2E4" }}>
                  <span style={{ color: "#C47A2E" }}>✓</span> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Payment card */}
        <div
          style={{
            background: "#FFFCF7",
            border: "1.5px solid #E0C9A8",
            borderRadius: 20,
            padding: "28px 28px 32px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-lora, serif)",
              fontSize: 18,
              fontWeight: 700,
              color: "#2E1A0C",
              marginBottom: 20,
            }}
          >
            How to pay
          </h2>

          {/* Steps */}
          <ol style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              "Open GCash → tap Send Money.",
              App.gcashNumber
                ? `Search for "${App.gcashName}" or enter number: ${App.gcashNumber}`
                : `Contact us at ${App.supportEmail} to get the GCash number.`,
              `Enter the amount: ₱${Pricing.pro.amountPhp} exactly.`,
              `Confirm the payment. Copy the 13-digit reference number from the receipt.`,
              "Paste it below and hit Submit.",
            ].map((step, i) => (
              <li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span
                  style={{
                    minWidth: 24,
                    height: 24,
                    background: "#C47A2E",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#FAF2E4",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 14, color: "#2E1A0C", lineHeight: 1.5 }}>{step}</span>
              </li>
            ))}
          </ol>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#2E1A0C" }}>
              GCash Reference Number
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={Validation.referenceNumber.length}
              value={refNum}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setRefNum(v);
                if (inputError) setInputError(validateRef(v));
              }}
              placeholder="e.g. 1234567890123"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#FAF2E4",
                border: `1.5px solid ${inputError ? "#EF4444" : "#E0C9A8"}`,
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 16,
                color: "#2E1A0C",
                fontFamily: "var(--font-dm-sans, sans-serif)",
                letterSpacing: "0.05em",
                outline: "none",
                marginBottom: 6,
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              {inputError ? (
                <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>{inputError}</p>
              ) : (
                <p style={{ fontSize: 12, color: "#8A6E52", margin: 0 }}>
                  {refNum.length} / {Validation.referenceNumber.length} digits
                </p>
              )}
            </div>

            {submitError && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1.5px solid #EF4444",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 13, color: "#991B1B", margin: 0 }}>{submitError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%",
                background: submitting ? "#C49A6C" : "#C47A2E",
                color: "#FAF2E4",
                border: "none",
                borderRadius: 10,
                padding: "14px",
                fontSize: 15,
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "var(--font-dm-sans, sans-serif)",
              }}
            >
              {submitting ? "Submitting…" : `Submit Payment — ₱${Pricing.pro.amountPhp}`}
            </button>
          </form>

          <p style={{ fontSize: 12, color: "#8A6E52", marginTop: 14, lineHeight: 1.6, textAlign: "center" }}>
            {UIMessages.verificationEta} Questions? {App.supportEmail}
          </p>
        </div>
      </div>
    </main>
  );
}
