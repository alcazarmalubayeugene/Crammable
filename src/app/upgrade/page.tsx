"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { authHeaders } from "@/lib/api/auth-headers";
import { PageLoading } from "@/components/ui/PageLoading";
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
  `${TierLimits.free.startingCredits} starting Capycoins`,
];

const PRO_FEATURES = [
  "Unlimited decks",
  `${TierLimits.pro.maxCardsPerDeck} cards per deck`,
  `Unlimited pages per upload (max ${MAX_UPLOAD_SIZE_MB} MB)`,
  `${TierLimits.pro.monthlyCredits} Capycoins every month`,
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
    return <PageLoading />;
  }

  // ── shared navbar ─────────────────────────────────────────────────────────────

  const Navbar = (
    <nav
      style={{
        background: "var(--nav-bg)",
        borderBottom: "1px solid var(--nav-border)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: "100%",
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
            className="nav-link"
            style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
          >
            <span style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-faint)" }}>← Back</span>
          </a>
          <span style={{ color: "var(--nav-border)", margin: "0 8px" }}>|</span>
          <span
            style={{
              fontFamily: "var(--font-display, serif)",
              fontWeight: 700,
              fontSize: "calc(18px * var(--font-scale))",
              color: "var(--nav-text)",
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
              background: "var(--nav-bg)",
              border: "1px solid rgba(196,122,46,0.3)",
              borderRadius: 20,
              padding: "5px 14px",
            }}
          >
            <Image src="/capy/capycoin.png" alt="" width={32} height={32} style={{ borderRadius: "50%" }} />
            <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--primary-soft)" }}>
              {profile.token_balance} Capycoins
            </span>
          </div>
        )}
      </div>
    </nav>
  );

  // ── already pro ───────────────────────────────────────────────────────────────

  if (phase === "already_pro") {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>
        {Navbar}
        <div
          style={{
            maxWidth: 520,
            margin: "80px auto",
            padding: "0 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "calc(56px * var(--font-scale))", marginBottom: 16 }}>🏆</div>
          <h1
            style={{
              fontFamily: "var(--font-display, serif)",
              fontSize: "calc(26px * var(--font-scale))",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 8,
            }}
          >
            You&apos;re already on Pro!
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))", marginBottom: 28 }}>
            You have full access to all Pro features.
          </p>
          <a
            href={Routes.dashboard}
            style={{
              display: "inline-block",
              background: "var(--primary)",
              color: "var(--nav-text)",
              padding: "12px 28px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: "calc(14px * var(--font-scale))",
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
      <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>
        {Navbar}
        <div style={{ maxWidth: 520, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
          <div className="hourglass-flip" style={{ fontSize: "calc(56px * var(--font-scale))", marginBottom: 16 }}>⏳</div>
          <h1
            style={{
              fontFamily: "var(--font-display, serif)",
              fontSize: "calc(26px * var(--font-scale))",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 8,
            }}
          >
            Payment under review
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))", lineHeight: 1.6, marginBottom: 8 }}>
            {UIMessages.paymentSubmitted}
          </p>
          <p style={{ color: "var(--text-faint)", fontSize: "calc(13px * var(--font-scale))", marginBottom: 28 }}>
            {UIMessages.verificationEta}
          </p>
          <a
            href={Routes.dashboard}
            style={{
              display: "inline-block",
              background: "var(--bg-card)",
              color: "var(--text)",
              border: "1.5px solid var(--border)",
              padding: "12px 28px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: "calc(14px * var(--font-scale))",
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
      <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>
        {Navbar}
        <div style={{ maxWidth: 520, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
          <div style={{ fontSize: "calc(56px * var(--font-scale))", marginBottom: 16 }}>✅</div>
          <h1
            style={{
              fontFamily: "var(--font-display, serif)",
              fontSize: "calc(26px * var(--font-scale))",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 8,
            }}
          >
            Payment submitted!
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))", lineHeight: 1.6, marginBottom: 8 }}>
            {UIMessages.paymentSubmitted}
          </p>
          <p style={{ color: "var(--text-faint)", fontSize: "calc(13px * var(--font-scale))", marginBottom: 28 }}>
            {UIMessages.verificationEta}
          </p>
          <a
            href={Routes.dashboard}
            style={{
              display: "inline-block",
              background: "var(--primary)",
              color: "var(--nav-text)",
              padding: "12px 28px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: "calc(14px * var(--font-scale))",
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
        background: "var(--bg)",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      {Navbar}

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 64px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1
            style={{
              fontFamily: "var(--font-display, serif)",
              fontSize: "calc(30px * var(--font-scale))",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 8,
            }}
          >
            Upgrade to Pro
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))" }}>
            One-time payment of{" "}
            <span style={{ fontWeight: 700, color: "var(--primary)" }}>
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
              background: "var(--error-bg)",
              border: "1.5px solid var(--error)",
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 24,
            }}
          >
            <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--error-dark)", margin: 0 }}>
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
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 16,
              padding: "22px 20px",
            }}
          >
            <p
              style={{
                fontSize: "calc(12px * var(--font-scale))",
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Free
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {FREE_FEATURES.map((f) => (
                <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>
                  <span>○</span> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div
            style={{
              background: "var(--nav-bg)",
              border: "1.5px solid var(--primary)",
              borderRadius: 16,
              padding: "22px 20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <p
                style={{
                  fontSize: "calc(12px * var(--font-scale))",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--primary)",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                Pro
              </p>
              <span
                style={{
                  fontSize: "calc(11px * var(--font-scale))",
                  background: "var(--primary)",
                  color: "var(--nav-text)",
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
                <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "calc(13px * var(--font-scale))", color: "var(--nav-text)" }}>
                  <span style={{ color: "var(--primary)" }}>✓</span> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Payment card */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border)",
            borderRadius: 20,
            padding: "28px 28px 32px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display, serif)",
              fontSize: "calc(18px * var(--font-scale))",
              fontWeight: 700,
              color: "var(--text)",
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
                    background: "var(--primary)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "calc(12px * var(--font-scale))",
                    fontWeight: 700,
                    color: "var(--nav-text)",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text)", lineHeight: 1.5 }}>{step}</span>
              </li>
            ))}
          </ol>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <label style={{ display: "block", marginBottom: 6, fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)" }}>
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
                background: "var(--bg)",
                border: `1.5px solid ${inputError ? "var(--error)" : "var(--border)"}`,
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: "calc(16px * var(--font-scale))",
                color: "var(--text)",
                fontFamily: "var(--font-body, sans-serif)",
                letterSpacing: "0.05em",
                outline: "none",
                marginBottom: 6,
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              {inputError ? (
                <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error)", margin: 0 }}>{inputError}</p>
              ) : (
                <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", margin: 0 }}>
                  {refNum.length} / {Validation.referenceNumber.length} digits
                </p>
              )}
            </div>

            {submitError && (
              <div
                style={{
                  background: "var(--error-bg)",
                  border: "1.5px solid var(--error)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--error-dark)", margin: 0 }}>{submitError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%",
                background: submitting ? "var(--text-faint)" : "var(--primary)",
                color: "var(--nav-text)",
                border: "none",
                borderRadius: 10,
                padding: "14px",
                fontSize: "calc(15px * var(--font-scale))",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "var(--font-body, sans-serif)",
              }}
            >
              {submitting ? "Submitting…" : `Submit Payment — ₱${Pricing.pro.amountPhp}`}
            </button>
          </form>

          <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 14, lineHeight: 1.6, textAlign: "center" }}>
            {UIMessages.verificationEta} Questions? {App.supportEmail}
          </p>
        </div>
      </div>
    </main>
  );
}
