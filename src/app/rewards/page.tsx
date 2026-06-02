"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { authHeaders } from "@/lib/api/auth-headers";
import {
  App,
  ApiPaths,
  ReferralCaps,
  ReferralEventType,
  Routes,
  TableNames,
  UIMessages,
  Validation,
  type ApiResponse,
  type ClaimReferralResult,
  type ReferralEvent,
} from "@/lib/contracts";

// ── types ─────────────────────────────────────────────────────────────────────

interface MinProfile {
  token_balance: number;
  full_name: string | null;
  referral_code: string;
  referred_by: string | null;
}

// ── earn-method display config ────────────────────────────────────────────────

const EARN_METHODS = [
  {
    type: ReferralEventType.SIGNUP,
    icon: "👥",
    label: "Refer a friend",
    desc: "Share your code. When they sign up, you both earn credits.",
    credits: ReferralCaps[ReferralEventType.SIGNUP].creditsAwarded,
    cap: `Up to ${ReferralCaps[ReferralEventType.SIGNUP].monthlyCap}x per month`,
  },
  {
    type: ReferralEventType.DECK_SHARE,
    icon: "📤",
    label: "Share a deck",
    desc: `Share a public deck that has at least ${(ReferralCaps[ReferralEventType.DECK_SHARE] as { minCards: number }).minCards} cards.`,
    credits: ReferralCaps[ReferralEventType.DECK_SHARE].creditsAwarded,
    cap: `Up to ${ReferralCaps[ReferralEventType.DECK_SHARE].monthlyCap}x per month`,
  },
  {
    type: ReferralEventType.APP_REVIEW,
    icon: "⭐",
    label: "Write a review",
    desc: "Leave a review on the app store. Requires admin verification.",
    credits: ReferralCaps[ReferralEventType.APP_REVIEW].creditsAwarded,
    cap: "Once ever",
  },
  {
    type: ReferralEventType.PROFILE_COMPLETE,
    icon: "✏️",
    label: "Complete your profile",
    desc: "Fill in your full name and course in Settings.",
    credits: ReferralCaps[ReferralEventType.PROFILE_COMPLETE].creditsAwarded,
    cap: "Once ever",
  },
] as const;

function eventLabel(type: string): string {
  switch (type) {
    case ReferralEventType.SIGNUP:           return "Friend signed up";
    case ReferralEventType.DECK_SHARE:       return "Shared a deck";
    case ReferralEventType.APP_REVIEW:       return "App review";
    case ReferralEventType.PROFILE_COMPLETE: return "Completed profile";
    default:                                  return type;
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function RewardsPage() {
  const [profile, setProfile] = useState<MinProfile | null>(null);
  const [history, setHistory] = useState<ReferralEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // claim form
  const [claimCode, setClaimCode] = useState("");
  const [claimError, setClaimError] = useState("");
  const [claimSuccess, setClaimSuccess] = useState("");
  const [claiming, setClaiming] = useState(false);

  // copy feedback
  const [copied, setCopied] = useState(false);

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

      const [profileRes, historyRes] = await Promise.all([
        supabase
          .from(TableNames.profiles)
          .select("token_balance, full_name, referral_code, referred_by")
          .eq("id", user.id)
          .single(),
        supabase
          .from(TableNames.referralEvents)
          .select("*")
          .eq("referrer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      setProfile(profileRes.data as MinProfile);
      setHistory((historyRes.data ?? []) as ReferralEvent[]);
      setLoading(false);
    }
    load();
  }, []);

  async function copyCode() {
    if (!profile?.referral_code) return;
    await navigator.clipboard.writeText(profile.referral_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    const code = claimCode.trim().toUpperCase();
    if (code.length !== Validation.referralCode.length) {
      setClaimError(`Code must be ${Validation.referralCode.length} characters.`);
      return;
    }
    setClaimError("");
    setClaimSuccess("");
    setClaiming(true);

    try {
      const res = await fetch(ApiPaths.claimReferral, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        } as HeadersInit,
        body: JSON.stringify({ referralCode: code }),
      });
      const data = (await res.json()) as ApiResponse<ClaimReferralResult>;
      if (!data.success) {
        setClaimError(data.error.message);
        return;
      }
      setClaimSuccess(
        UIMessages.referralCredited("your referrer", data.creditsAwarded),
      );
      setProfile((p) => p ? { ...p, token_balance: data.newBalance, referred_by: "claimed" } : p);
      setClaimCode("");
    } catch {
      setClaimError(UIMessages.genericError);
    } finally {
      setClaiming(false);
    }
  }

  // ── loading ───────────────────────────────────────────────────────────────────

  if (loading) {
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

  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${Routes.signup}?ref=${profile?.referral_code ?? ""}`;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FAF2E4",
        fontFamily: "var(--font-dm-sans, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
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

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 64px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: "var(--font-lora, serif)",
              fontSize: 28,
              fontWeight: 700,
              color: "#2E1A0C",
              marginBottom: 6,
            }}
          >
            Rewards
          </h1>
          <p style={{ color: "#8A6E52", fontSize: 15 }}>
            Earn credits by sharing {App.name} with your classmates.
          </p>
        </div>

        {/* ── Referral code card ── */}
        <div
          style={{
            background: "#4A2512",
            border: "1.5px solid #C47A2E",
            borderRadius: 20,
            padding: "28px",
            marginBottom: 24,
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#C49A6C",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Your referral code
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-lora, serif)",
                fontSize: 32,
                fontWeight: 700,
                color: "#FAF2E4",
                letterSpacing: "0.12em",
              }}
            >
              {profile?.referral_code ?? "——"}
            </span>

            <button
              type="button"
              onClick={copyCode}
              style={{
                background: copied ? "#5C7A35" : "#C47A2E",
                color: "#FAF2E4",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-dm-sans, sans-serif)",
                transition: "background 0.2s",
              }}
            >
              {copied ? "✓ Copied!" : "Copy code"}
            </button>
          </div>

          <p style={{ fontSize: 13, color: "#C49A6C", marginTop: 12, lineHeight: 1.5 }}>
            Share this code with classmates. When they sign up using it, you earn{" "}
            <strong style={{ color: "#FAF2E4" }}>
              +{ReferralCaps[ReferralEventType.SIGNUP].creditsAwarded} credits
            </strong>
            .
          </p>
        </div>

        {/* ── Ways to earn ── */}
        <h2
          style={{
            fontFamily: "var(--font-lora, serif)",
            fontSize: 18,
            fontWeight: 700,
            color: "#2E1A0C",
            marginBottom: 14,
          }}
        >
          Ways to earn
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
            marginBottom: 32,
          }}
        >
          {EARN_METHODS.map((method) => (
            <div
              key={method.type}
              style={{
                background: "#FFFCF7",
                border: "1.5px solid #E0C9A8",
                borderRadius: 14,
                padding: "18px 20px",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1.4 }}>{method.icon}</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#2E1A0C" }}>
                    {method.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#5C7A35",
                      background: "#EDF5E4",
                      borderRadius: 20,
                      padding: "2px 8px",
                    }}
                  >
                    +{method.credits} credits
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "#8A6E52", margin: "0 0 4px", lineHeight: 1.5 }}>
                  {method.desc}
                </p>
                <p style={{ fontSize: 11, color: "#C49A6C", margin: 0 }}>{method.cap}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Claim a referral code ── */}
        {!profile?.referred_by && (
          <div
            style={{
              background: "#FFFCF7",
              border: "1.5px solid #E0C9A8",
              borderRadius: 16,
              padding: "22px 24px",
              marginBottom: 28,
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-lora, serif)",
                fontSize: 16,
                fontWeight: 700,
                color: "#2E1A0C",
                marginBottom: 4,
              }}
            >
              Got a referral code?
            </h2>
            <p style={{ fontSize: 13, color: "#8A6E52", marginBottom: 16, lineHeight: 1.5 }}>
              Enter a classmate's code to give them credit for referring you.
            </p>

            {claimSuccess ? (
              <div
                style={{
                  background: "#EDF5E4",
                  border: "1.5px solid #5C7A35",
                  borderRadius: 10,
                  padding: "12px 16px",
                }}
              >
                <p style={{ fontSize: 14, color: "#3A5020", fontWeight: 600, margin: 0 }}>
                  ✅ {claimSuccess}
                </p>
              </div>
            ) : (
              <form onSubmit={handleClaim} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={claimCode}
                  onChange={(e) => {
                    setClaimCode(e.target.value.toUpperCase().slice(0, Validation.referralCode.length));
                    setClaimError("");
                  }}
                  placeholder="e.g. AB12CD34"
                  maxLength={Validation.referralCode.length}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    background: "#FAF2E4",
                    border: `1.5px solid ${claimError ? "#EF4444" : "#E0C9A8"}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 14,
                    color: "#2E1A0C",
                    fontFamily: "var(--font-dm-sans, sans-serif)",
                    letterSpacing: "0.08em",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={claiming}
                  style={{
                    background: claiming ? "#C49A6C" : "#C47A2E",
                    color: "#FAF2E4",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: claiming ? "not-allowed" : "pointer",
                    fontFamily: "var(--font-dm-sans, sans-serif)",
                  }}
                >
                  {claiming ? "Claiming…" : "Claim"}
                </button>
              </form>
            )}

            {claimError && (
              <p style={{ fontSize: 13, color: "#EF4444", marginTop: 8 }}>{claimError}</p>
            )}
          </div>
        )}

        {/* ── Referral history ── */}
        <h2
          style={{
            fontFamily: "var(--font-lora, serif)",
            fontSize: 18,
            fontWeight: 700,
            color: "#2E1A0C",
            marginBottom: 14,
          }}
        >
          History
        </h2>

        {history.length === 0 ? (
          <div
            style={{
              background: "#FFFCF7",
              border: "1.5px dashed #E0C9A8",
              borderRadius: 14,
              padding: "36px 24px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#8A6E52", fontSize: 14 }}>
              No credits earned yet. Share your referral code to get started!
            </p>
          </div>
        ) : (
          <div
            style={{
              background: "#FFFCF7",
              border: "1.5px solid #E0C9A8",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {history.map((event, i) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: i < history.length - 1 ? "1px solid #E0C9A8" : "none",
                  gap: 12,
                }}
              >
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#2E1A0C", margin: "0 0 2px" }}>
                    {eventLabel(event.event_type)}
                  </p>
                  <p style={{ fontSize: 12, color: "#8A6E52", margin: 0 }}>
                    {new Date(event.created_at).toLocaleDateString("en-PH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {event.event_type === ReferralEventType.APP_REVIEW && !event.verified && (
                      <span style={{ color: "#C49A6C", marginLeft: 8 }}>· Pending verification</span>
                    )}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#5C7A35",
                    whiteSpace: "nowrap",
                  }}
                >
                  +{event.credits_awarded} credits
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
