"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { authHeaders } from "@/lib/api/auth-headers";
import { PageLoading } from "@/components/ui/PageLoading";
import { Navbar } from "@/components/nav/Navbar";
import { useAppProfile } from "../AppProfileContext";
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
  type ReferralHistoryItem,
  type ReferralHistoryResult,
} from "@/lib/contracts";

// ── earn-method display config ────────────────────────────────────────────────

const EARN_METHODS = [
  {
    type: ReferralEventType.SIGNUP,
    icon: "👥",
    label: "Refer a friend",
    desc: "Share your code. When they sign up, you both earn Capycoins.",
    credits: ReferralCaps[ReferralEventType.SIGNUP].creditsAwarded,
    cap: "Once ever",
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
    type: ReferralEventType.PROFILE_COMPLETE,
    icon: "✏️",
    label: "Complete your profile",
    desc: "Fill in your full name and course in Settings.",
    credits: ReferralCaps[ReferralEventType.PROFILE_COMPLETE].creditsAwarded,
    cap: "Once ever",
  },
] as const;

function eventLabel(event: ReferralHistoryItem): string {
  switch (event.event_type) {
    case ReferralEventType.SIGNUP:
      return event.referredName ? `${event.referredName} signed up` : "A friend signed up";
    case ReferralEventType.DECK_SHARE:       return "Shared a deck";
    case ReferralEventType.APP_REVIEW:       return "App review";
    case ReferralEventType.PROFILE_COMPLETE: return "Completed profile";
    default:                                  return event.event_type;
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function RewardsPage() {
  const [profile, setProfile] = useState<MinProfile | null>(null);
  const [history, setHistory] = useState<ReferralHistoryItem[]>([]);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // claim form
  const [claimCode, setClaimCode] = useState("");
  const [claimError, setClaimError] = useState("");
  const [claimSuccess, setClaimSuccess] = useState("");
  const [claiming, setClaiming] = useState(false);

  // copy feedback
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profileLoading || !profile) return;

      const [profileRes, historyRes] = await Promise.all([
        supabase
          .from(TableNames.profiles)
          .select("token_balance, full_name, referral_code, referred_by")
          .eq("id", user.id)
          .single(),
        fetch(ApiPaths.rewardsReferrals, {
          headers: await authHeaders(),
        }),
      ]);

      const profileData = profileRes.data as MinProfile;
      setProfile(profileData);

      if (historyRes.ok) {
        const historyData = (await historyRes.json()) as ApiResponse<ReferralHistoryResult>;
        if (historyData.success) {
          setHistory(historyData.events);
        }
      }

      if (referredBy) {
        const { data: referrer } = await supabase
          .from(TableNames.profiles)
          .select("full_name")
          .eq("id", referredBy)
          .single();
        setReferrerName(referrer?.full_name ?? "a classmate");
      }

      setLoading(false);
    }
    load(profile.id, profile.referred_by);
  }, [profile, profileLoading]);

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
      setClaimSuccess(UIMessages.referralClaimThanks(data.creditsAwarded));
      // "claimed" is a sentinel that just needs to be non-null so the claim form
      // hides — the real referrer id isn't shown anywhere.
      mutateProfile({ token_balance: data.newBalance, referred_by: "claimed" });
      setClaimCode("");
    } catch {
      setClaimError(UIMessages.genericError);
    } finally {
      setClaiming(false);
    }
  }

  // ── loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <PageLoading />;
  }


  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
      <Navbar
        backHref={Routes.dashboard}
        showWordmark={false}
        coinBalance={profile?.token_balance}
      />

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 64px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: "var(--font-display, serif)",
              fontSize: "calc(28px * var(--font-scale))",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 6,
            }}
          >
            Rewards
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))" }}>
            Earn Capycoins by sharing {App.name} with your classmates.
          </p>
        </div>

        {/* ── Referral code card ── */}
        <div
          style={{
            background: "var(--nav-bg)",
            border: "1.5px solid var(--primary)",
            borderRadius: 20,
            padding: "28px",
            marginBottom: 24,
          }}
        >
          <p
            style={{
              fontSize: "calc(12px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
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
                fontFamily: "var(--font-display, serif)",
                fontSize: "calc(32px * var(--font-scale))",
                fontWeight: 700,
                color: "var(--nav-text)",
                letterSpacing: "0.12em",
              }}
            >
              {profile?.referral_code ?? "——"}
            </span>

            <button
              type="button"
              onClick={copyCode}
              style={{
                background: copied ? "var(--success)" : "var(--primary)",
                color: "var(--nav-text)",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: "calc(13px * var(--font-scale))",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-body, sans-serif)",
                transition: "background 0.2s",
              }}
            >
              {copied ? "✓ Copied!" : "Copy code"}
            </button>
          </div>

          <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)", marginTop: 12, lineHeight: 1.5 }}>
            Share this code with classmates. When they sign up using it, you earn{" "}
            <strong style={{ color: "var(--nav-text)" }}>
              +{ReferralCaps[ReferralEventType.SIGNUP].creditsAwarded} Capycoins
            </strong>
            .
          </p>
        </div>

        {/* ── Ways to earn ── */}
        <h2
          style={{
            fontFamily: "var(--font-display, serif)",
            fontSize: "calc(18px * var(--font-scale))",
            fontWeight: 700,
            color: "var(--text)",
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
          {EARN_METHODS.map((method) => {
            const profileCompleteEarned = history.some(
              (e) => e.event_type === ReferralEventType.PROFILE_COMPLETE
            );
            const deckShareCount = history.filter(
              (e) => e.event_type === ReferralEventType.DECK_SHARE
            ).length;

            return (
              <div
                key={method.type}
                style={{
                  background: "var(--bg-card)",
                  border: "1.5px solid var(--border)",
                  borderRadius: 14,
                  padding: "18px 20px",
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: "calc(22px * var(--font-scale))", lineHeight: 1.4 }}>{method.icon}</span>
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
                    <span style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--text)" }}>
                      {method.label}
                    </span>
                    <span
                      style={{
                        fontSize: "calc(12px * var(--font-scale))",
                        fontWeight: 700,
                        color: "var(--success)",
                        background: "var(--success-bg)",
                        borderRadius: 20,
                        padding: "2px 8px",
                      }}
                    >
                      +{method.credits} Capycoins
                    </span>
                  </div>
                  <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", margin: "0 0 4px", lineHeight: 1.5 }}>
                    {method.desc}
                  </p>
                  <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--text-faint)", margin: "0 0 8px" }}>{method.cap}</p>

                  {/* PROFILE_COMPLETE: earned status / CTA */}
                  {method.type === ReferralEventType.PROFILE_COMPLETE && (
                    profileCompleteEarned ? (
                      <span style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 700, color: "var(--success)" }}>✓ Earned</span>
                    ) : (
                      <a href={Routes.settings} style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 700, color: "var(--primary)", textDecoration: "none" }}>
                        Go to Settings →
                      </a>
                    )
                  )}

                  {/* DECK_SHARE: earned count / CTA */}
                  {method.type === ReferralEventType.DECK_SHARE && (
                    deckShareCount > 0 ? (
                      <span style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 700, color: "var(--success)" }}>
                        ✓ Earned {deckShareCount}x
                      </span>
                    ) : (
                      <a href={Routes.dashboard} style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 700, color: "var(--primary)", textDecoration: "none" }}>
                        Go to your decks →
                      </a>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Claim a referral code ── */}
        {!profile?.referred_by && (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 16,
              padding: "22px 24px",
              marginBottom: 28,
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display, serif)",
                fontSize: "calc(16px * var(--font-scale))",
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: 4,
              }}
            >
              Got a referral code?
            </h2>
            <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>
              Enter a classmate&apos;s code to give them Capycoins for referring you.
            </p>

            {claimSuccess ? (
              <div
                style={{
                  background: "var(--success-bg)",
                  border: "1.5px solid var(--success)",
                  borderRadius: 10,
                  padding: "12px 16px",
                }}
              >
                <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--success-dark)", fontWeight: 600, margin: 0 }}>
                  ✅ {claimSuccess}
                </p>
              </div>
            ) : (
              <form onSubmit={handleClaim} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={claimCode}
                  onChange={(e) => {
                    const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, Validation.referralCode.length);
                    setClaimCode(clean);
                    setClaimError("");
                  }}
                  placeholder="e.g. AB12CD34"
                  maxLength={Validation.referralCode.length}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    background: "var(--bg)",
                    border: `1.5px solid ${claimError ? "var(--error)" : "var(--border)"}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: "calc(14px * var(--font-scale))",
                    color: "var(--text)",
                    fontFamily: "var(--font-body, sans-serif)",
                    letterSpacing: "0.08em",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={claiming}
                  style={{
                    background: claiming ? "var(--text-faint)" : "var(--primary)",
                    color: "var(--nav-text)",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 20px",
                    fontSize: "calc(14px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: claiming ? "not-allowed" : "pointer",
                    fontFamily: "var(--font-body, sans-serif)",
                  }}
                >
                  {claiming ? "Claiming…" : "Claim"}
                </button>
              </form>
            )}

            {claimError && (
              <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--error)", marginTop: 8 }}>{claimError}</p>
            )}
          </div>
        )}

        {/* ── Referral history ── */}
        <h2
          style={{
            fontFamily: "var(--font-display, serif)",
            fontSize: "calc(18px * var(--font-scale))",
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: 14,
          }}
        >
          History
        </h2>

        {history.length === 0 && !profile?.referred_by ? (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1.5px dashed var(--border)",
              borderRadius: 14,
              padding: "36px 24px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))" }}>
              No Capycoins earned yet. Share your referral code to get started!
            </p>
          </div>
        ) : (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
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
                  borderBottom: (i < history.length - 1 || !!profile?.referred_by) ? "1px solid var(--border)" : "none",
                  gap: 12,
                }}
              >
                <div>
                  <p style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--text)", margin: "0 0 2px" }}>
                    {eventLabel(event)}
                  </p>
                  <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", margin: 0 }}>
                    {new Date(event.created_at).toLocaleDateString("en-PH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {event.event_type === ReferralEventType.APP_REVIEW && !event.verified && (
                      <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>· Pending verification</span>
                    )}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: "calc(15px * var(--font-scale))",
                    fontWeight: 700,
                    color: "var(--success)",
                    whiteSpace: "nowrap",
                  }}
                >
                  +{event.credits_awarded} Capycoins
                </span>
              </div>
            ))}

            {profile?.referred_by && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  gap: 12,
                }}
              >
                <div>
                  <p style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--text)", margin: "0 0 2px" }}>
                    Referred by {referrerName ?? "…"}
                  </p>
                  <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", margin: 0 }}>
                    Used a referral code at signup
                  </p>
                </div>
                <span style={{ fontSize: "calc(15px * var(--font-scale))", fontWeight: 700, color: "var(--success)", whiteSpace: "nowrap" }}>
                  +{ReferralCaps[ReferralEventType.SIGNUP].creditsAwarded} Capycoins
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
