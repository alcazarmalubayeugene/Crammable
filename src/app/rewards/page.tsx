"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { authHeaders } from "@/lib/api/auth-headers";
import { PageLoading } from "@/components/ui/PageLoading";
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
  type AppReview,
  type ClaimReferralResult,
  type ReferralEvent,
  type SubmitAppReviewRequest,
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
    desc: "Share your code. When they sign up, you both earn Capycoins.",
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
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // claim form
  const [claimCode, setClaimCode] = useState("");
  const [claimError, setClaimError] = useState("");
  const [claimSuccess, setClaimSuccess] = useState("");
  const [claiming, setClaiming] = useState(false);

  // copy feedback
  const [copied, setCopied] = useState(false);

  // app review form
  const [appReview, setAppReview] = useState<AppReview | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

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

      const [profileRes, historyRes, reviewRes] = await Promise.all([
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
        supabase
          .from(TableNames.appReviews)
          .select("*")
          .maybeSingle(),
      ]);

      const profileData = profileRes.data as MinProfile;
      setProfile(profileData);
      setHistory((historyRes.data ?? []) as ReferralEvent[]);

      if (profileData?.referred_by) {
        const { data: referrer } = await supabase
          .from(TableNames.profiles)
          .select("full_name")
          .eq("id", profileData.referred_by)
          .single();
        setReferrerName(referrer?.full_name ?? "a classmate");
      }

      setAppReview((reviewRes.data as AppReview | null) ?? null);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    const text = reviewText.trim();
    if (!text) {
      setReviewError("Please write a short review.");
      return;
    }
    if (text.length > Validation.appReview.textMaxLength) {
      setReviewError(`Review must be ${Validation.appReview.textMaxLength} characters or less.`);
      return;
    }
    setReviewError("");
    setSubmittingReview(true);
    try {
      const res = await fetch(ApiPaths.submitAppReview, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        } as HeadersInit,
        body: JSON.stringify({ rating: reviewRating, reviewText: text } satisfies SubmitAppReviewRequest),
      });
      const data = (await res.json()) as ApiResponse<AppReview>;
      if (!data.success) {
        setReviewError(data.error.message);
        return;
      }
      setAppReview(data);
    } catch {
      setReviewError(UIMessages.genericError);
    } finally {
      setSubmittingReview(false);
    }
  }

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

                  {/* APP_REVIEW: status / form */}
                  {method.type === ReferralEventType.APP_REVIEW && (
                    appReview ? (
                      <span
                        style={{
                          fontSize: "calc(12px * var(--font-scale))",
                          fontWeight: 700,
                          color: appReview.status === "approved" ? "var(--success)"
                            : appReview.status === "rejected" ? "var(--error)" : "var(--text-faint)",
                        }}
                      >
                        {appReview.status === "approved" ? "✓ Approved"
                          : appReview.status === "rejected" ? "✗ Rejected"
                          : "Pending verification"}
                      </span>
                    ) : (
                      <form onSubmit={handleSubmitReview} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewRating(star)}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "calc(18px * var(--font-scale))", padding: 0, color: star <= reviewRating ? "var(--primary)" : "var(--border)" }}
                              aria-label={`${star} star${star > 1 ? "s" : ""}`}
                            >
                              {star <= reviewRating ? "★" : "☆"}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          maxLength={Validation.appReview.textMaxLength}
                          placeholder="What do you like about Crammable?"
                          rows={2}
                          style={{
                            background: "var(--bg)",
                            border: "1.5px solid var(--border)",
                            borderRadius: 8,
                            padding: "8px 10px",
                            fontSize: "calc(13px * var(--font-scale))",
                            color: "var(--text)",
                            fontFamily: "var(--font-body, sans-serif)",
                            outline: "none",
                            resize: "vertical",
                          }}
                        />
                        <button
                          type="submit"
                          disabled={submittingReview}
                          style={{
                            alignSelf: "flex-start",
                            background: submittingReview ? "var(--text-faint)" : "var(--primary)",
                            color: "var(--nav-text)",
                            border: "none",
                            borderRadius: 8,
                            padding: "7px 16px",
                            fontSize: "calc(12px * var(--font-scale))",
                            fontWeight: 600,
                            cursor: submittingReview ? "not-allowed" : "pointer",
                            fontFamily: "var(--font-body, sans-serif)",
                          }}
                        >
                          {submittingReview ? "Submitting…" : "Submit review"}
                        </button>
                        {reviewError && (
                          <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error)", margin: 0 }}>{reviewError}</p>
                        )}
                      </form>
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
                    {eventLabel(event.event_type)}
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
