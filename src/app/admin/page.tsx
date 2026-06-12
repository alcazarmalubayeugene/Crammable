"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { authHeaders } from "@/lib/api/auth-headers";
import {
  AdminConfig,
  App,
  ApiPaths,
  PaymentStatus,
  Pricing,
  Routes,
  TableNames,
  UIMessages,
  ReferralCaps,
  ReferralEventType,
  Validation,
  type AdminAppReviewRow,
  type AdminAuditLogResult,
  type AdminAuditLogRow,
  type AdminPaymentRow,
  type AdminUserRow,
  type AdminUsersListResult,
  type ApiResponse,
  type ApprovePaymentRequest,
  type GrantCreditsRequest,
  type GrantCreditsResult,
  type RejectPaymentRequest,
  type VerifyReviewRequest,
  type VerifyReviewResult,
} from "@/lib/contracts";

type ActionState = "idle" | "approving" | "rejecting";

interface RowState {
  actionState: ActionState;
  rejectNote: string;
  showRejectForm: boolean;
  error: string;
}

function emptyRowState(): RowState {
  return { actionState: "idle", rejectNote: "", showRejectForm: false, error: "" };
}

interface ReviewRowState {
  actionState: "idle" | "verifying";
  error: string;
}

function emptyReviewRowState(): ReviewRowState {
  return { actionState: "idle", error: "" };
}

interface GrantState {
  amount: string;
  notes: string;
  busy: boolean;
  error: string;
  success: string;
}

function emptyGrantState(): GrantState {
  return { amount: "", notes: "", busy: false, error: "", success: "" };
}

function minutesToLabel(mins: number): string {
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null } | null>(null);
  const [submissions, setSubmissions] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [reviews, setReviews] = useState<AdminAppReviewRow[]>([]);
  const [reviewRowStates, setReviewRowStates] = useState<Record<string, ReviewRowState>>({});
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [grantStates, setGrantStates] = useState<Record<string, GrantState>>({});
  const [auditLog, setAuditLog] = useState<AdminAuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { window.location.href = Routes.login; return; }

      const { data: profileData } = await supabase
        .from(TableNames.profiles)
        .select("is_admin, full_name")
        .eq("id", user.id)
        .single();

      if (!profileData?.is_admin) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      setProfile({ full_name: profileData.full_name });

      const res = await fetch(ApiPaths.adminPayments, {
        headers: await authHeaders(),
      });

      if (!res.ok) {
        setFetchError("Failed to load payment submissions.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      const rows: AdminPaymentRow[] = data.submissions ?? [];
      setSubmissions(rows);
      const states: Record<string, RowState> = {};
      rows.forEach((r) => { states[r.id] = emptyRowState(); });
      setRowStates(states);

      const reviewsRes = await fetch(ApiPaths.adminReviews, {
        headers: await authHeaders(),
      });
      if (reviewsRes.ok) {
        const reviewsData = await reviewsRes.json();
        const reviewRows: AdminAppReviewRow[] = reviewsData.reviews ?? [];
        setReviews(reviewRows);
        const reviewStates: Record<string, ReviewRowState> = {};
        reviewRows.forEach((r) => { reviewStates[r.id] = emptyReviewRowState(); });
        setReviewRowStates(reviewStates);
      }

      setLoading(false);

      loadUsers();
      loadAuditLog();
    }
    load();
  }, []);

  async function loadUsers(search?: string) {
    setUsersLoading(true);
    try {
      const url = search ? `${ApiPaths.adminUsers}?search=${encodeURIComponent(search)}` : ApiPaths.adminUsers;
      const res = await fetch(url, { headers: await authHeaders() });
      const data = (await res.json()) as ApiResponse<AdminUsersListResult>;
      if (data.success) {
        setUsers(data.users);
        const states: Record<string, GrantState> = {};
        data.users.forEach((u) => { states[u.id] = emptyGrantState(); });
        setGrantStates(states);
      }
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadAuditLog() {
    setAuditLoading(true);
    try {
      const res = await fetch(ApiPaths.adminAuditLog, { headers: await authHeaders() });
      const data = (await res.json()) as ApiResponse<AdminAuditLogResult>;
      if (data.success) {
        setAuditLog(data.actions);
      }
    } finally {
      setAuditLoading(false);
    }
  }

  function setGrant(id: string, patch: Partial<GrantState>) {
    setGrantStates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyGrantState()), ...patch } }));
  }

  async function grantCredits(targetUser: AdminUserRow) {
    const gs = grantStates[targetUser.id] ?? emptyGrantState();
    const amount = Number(gs.amount);
    if (!Number.isInteger(amount) || amount < Validation.adminCreditGrant.minAmount || amount > Validation.adminCreditGrant.maxAmount) {
      setGrant(targetUser.id, { error: `Enter an integer between ${Validation.adminCreditGrant.minAmount} and ${Validation.adminCreditGrant.maxAmount}.`, success: "" });
      return;
    }
    setGrant(targetUser.id, { busy: true, error: "", success: "" });
    try {
      const res = await fetch(ApiPaths.adminGrantCredits, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        } as HeadersInit,
        body: JSON.stringify({
          userId: targetUser.id,
          amount,
          notes: gs.notes.trim() || undefined,
        } satisfies GrantCreditsRequest),
      });
      const data = (await res.json()) as ApiResponse<GrantCreditsResult>;
      if (!data.success) {
        setGrant(targetUser.id, { busy: false, error: data.error.message });
        return;
      }
      setUsers((prev) => prev.map((u) => u.id === targetUser.id ? { ...u, token_balance: data.newBalance } : u));
      setGrant(targetUser.id, { busy: false, amount: "", notes: "", success: `New balance: ${data.newBalance}` });
      loadAuditLog();
    } catch {
      setGrant(targetUser.id, { busy: false, error: UIMessages.genericError });
    }
  }

  function setRow(id: string, patch: Partial<RowState>) {
    setRowStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function setReviewRow(id: string, patch: Partial<ReviewRowState>) {
    setReviewRowStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function verifyReview(reviewId: string, approve: boolean) {
    setReviewRow(reviewId, { actionState: "verifying", error: "" });
    try {
      const res = await fetch(ApiPaths.adminVerifyReview, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        } as HeadersInit,
        body: JSON.stringify({ reviewId, approve } satisfies VerifyReviewRequest),
      });
      const data = (await res.json()) as ApiResponse<VerifyReviewResult>;
      if (!data.success) {
        setReviewRow(reviewId, { actionState: "idle", error: data.error.message });
        return;
      }
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch {
      setReviewRow(reviewId, { actionState: "idle", error: UIMessages.genericError });
    }
  }

  async function approve(payment: AdminPaymentRow) {
    setRow(payment.id, { actionState: "approving", error: "" });
    try {
      const res = await fetch(ApiPaths.adminApprovePayment, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        } as HeadersInit,
        body: JSON.stringify({ paymentId: payment.id } satisfies ApprovePaymentRequest),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setRow(payment.id, { actionState: "idle", error: data.error.message });
        return;
      }
      setSubmissions((prev) =>
        prev.map((p) => p.id === payment.id ? { ...p, status: PaymentStatus.VERIFIED } : p),
      );
      setRow(payment.id, { actionState: "idle" });
    } catch {
      setRow(payment.id, { actionState: "idle", error: UIMessages.genericError });
    }
  }

  async function reject(payment: AdminPaymentRow) {
    const note = rowStates[payment.id]?.rejectNote.trim();
    if (!note) {
      setRow(payment.id, { error: "Please enter a rejection reason." });
      return;
    }
    if (note.length > Validation.adminNotes.maxLength) {
      setRow(payment.id, { error: `Reason must be ${Validation.adminNotes.maxLength} characters or less.` });
      return;
    }
    setRow(payment.id, { actionState: "rejecting", error: "" });
    try {
      const res = await fetch(ApiPaths.adminRejectPayment, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        } as HeadersInit,
        body: JSON.stringify({
          paymentId: payment.id,
          rejectionReason: note,
        } satisfies RejectPaymentRequest),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setRow(payment.id, { actionState: "idle", error: data.error.message });
        return;
      }
      setSubmissions((prev) =>
        prev.map((p) =>
          p.id === payment.id ? { ...p, status: PaymentStatus.REJECTED, rejection_reason: note } : p,
        ),
      );
      setRow(payment.id, { actionState: "idle", showRejectForm: false });
    } catch {
      setRow(payment.id, { actionState: "idle", error: UIMessages.genericError });
    }
  }

  // ── loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#FAF2E4", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#8A6E52", fontFamily: "var(--font-dm-sans, sans-serif)" }}>Loading…</p>
      </main>
    );
  }

  // ── not admin ─────────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <main style={{ minHeight: "100vh", background: "#FAF2E4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "var(--font-dm-sans, sans-serif)" }}>
        <span style={{ fontSize: 48 }}>🔒</span>
        <p style={{ color: "#8A6E52", fontSize: 15 }}>You don&apos;t have access to this page.</p>
        <a href={Routes.dashboard} style={{ color: "#C47A2E", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          ← Back to Dashboard
        </a>
      </main>
    );
  }

  const pending = submissions.filter((s) => s.status === PaymentStatus.PENDING);
  const resolved = submissions.filter((s) => s.status !== PaymentStatus.PENDING);

  return (
    <main style={{ minHeight: "100vh", background: "#FAF2E4", fontFamily: "var(--font-dm-sans, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "#2E1A0C", borderBottom: "1px solid #4A2512", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🦫</span>
            <span style={{ fontFamily: "var(--font-lora, serif)", fontWeight: 700, fontSize: 18, color: "#FAF2E4" }}>
              {App.name}
            </span>
            <span style={{ fontSize: 12, background: "#C47A2E", color: "#FAF2E4", borderRadius: 20, padding: "2px 10px", fontWeight: 700, marginLeft: 4 }}>
              Admin
            </span>
          </div>
          <span style={{ fontSize: 13, color: "#C49A6C" }}>
            {profile?.full_name ?? "Admin"}
          </span>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 64px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 26, fontWeight: 700, color: "#2E1A0C", marginBottom: 4 }}>
              Payment Approvals
            </h1>
            <p style={{ color: "#8A6E52", fontSize: 14 }}>
              GCash ₱{Pricing.pro.amountPhp} · Operating hours: {AdminConfig.operatingStart}am – {AdminConfig.operatingEnd % 12}pm PHT · SLA: {AdminConfig.slaHours}h
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 10, padding: "10px 16px" }}>
            <span style={{ fontSize: 18 }}>⏳</span>
            <span style={{ fontFamily: "var(--font-lora, serif)", fontSize: 22, fontWeight: 700, color: "#2E1A0C" }}>
              {pending.length}
            </span>
            <span style={{ fontSize: 13, color: "#8A6E52" }}>pending</span>
          </div>
        </div>

        {fetchError && (
          <div style={{ background: "#FEF2F2", border: "1.5px solid #EF4444", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
            <p style={{ fontSize: 14, color: "#991B1B", margin: 0 }}>{fetchError}</p>
          </div>
        )}

        {/* ── Pending submissions ── */}
        {pending.length === 0 ? (
          <div style={{ background: "#FFFCF7", border: "1.5px dashed #E0C9A8", borderRadius: 16, padding: "48px 24px", textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <p style={{ color: "#8A6E52", fontSize: 15 }}>No pending payments. All caught up!</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 36 }}>
            {pending.map((payment) => {
              const rs = rowStates[payment.id] ?? emptyRowState();
              const busy = rs.actionState !== "idle";
              return (
                <div
                  key={payment.id}
                  style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 16, padding: "20px 22px" }}
                >
                  {/* Top row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "#2E1A0C", marginBottom: 2 }}>
                        {payment.userEmail}
                      </p>
                      <p style={{ fontSize: 13, color: "#8A6E52", margin: 0 }}>
                        Ref:{" "}
                        <span style={{ fontFamily: "monospace", letterSpacing: "0.06em" }}>
                          {payment.reference_number}
                        </span>
                        {" · "}₱{payment.amount}
                        {" · "}{minutesToLabel(payment.minutesSinceSubmission)}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        background: payment.minutesSinceSubmission > AdminConfig.slaHours * 60 ? "#FEF2F2" : "#FBF0E0",
                        color: payment.minutesSinceSubmission > AdminConfig.slaHours * 60 ? "#991B1B" : "#C47A2E",
                        borderRadius: 20,
                        padding: "3px 10px",
                      }}
                    >
                      {payment.minutesSinceSubmission > AdminConfig.slaHours * 60 ? "⚠ Overdue" : "Pending"}
                    </span>
                  </div>

                  {/* Actions */}
                  {!rs.showRejectForm ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => approve(payment)}
                        style={{ background: busy && rs.actionState === "approving" ? "#8AAD5A" : "#5C7A35", color: "#FAF2E4", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
                      >
                        {rs.actionState === "approving" ? "Approving…" : "✓ Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRow(payment.id, { showRejectForm: true })}
                        style={{ background: "none", border: "1.5px solid #E0C9A8", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, color: "#8A6E52", cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
                      >
                        ✗ Reject
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        type="text"
                        value={rs.rejectNote}
                        onChange={(e) => setRow(payment.id, { rejectNote: e.target.value })}
                        maxLength={Validation.adminNotes.maxLength}
                        placeholder="Reason shown to the student…"
                        style={{ background: "#FAF2E4", border: "1.5px solid #E0C9A8", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#2E1A0C", fontFamily: "var(--font-dm-sans, sans-serif)", outline: "none" }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => reject(payment)}
                          style={{ background: "#EF4444", color: "#FAF2E4", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
                        >
                          {rs.actionState === "rejecting" ? "Rejecting…" : "Confirm reject"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRow(payment.id, { showRejectForm: false, rejectNote: "", error: "" })}
                          style={{ background: "none", border: "none", fontSize: 13, color: "#8A6E52", cursor: "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {rs.error && (
                    <p style={{ fontSize: 12, color: "#EF4444", marginTop: 8 }}>{rs.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Resolved submissions ── */}
        {resolved.length > 0 && (
          <>
            <h2 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 16, fontWeight: 700, color: "#2E1A0C", marginBottom: 12 }}>
              Recently resolved
            </h2>
            <div style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 14, overflow: "hidden" }}>
              {resolved.map((payment, i) => (
                <div
                  key={payment.id}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: i < resolved.length - 1 ? "1px solid #E0C9A8" : "none", gap: 12, flexWrap: "wrap" }}
                >
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#2E1A0C", marginBottom: 1 }}>
                      {payment.userEmail}
                    </p>
                    <p style={{ fontSize: 12, color: "#8A6E52", margin: 0, fontFamily: "monospace" }}>
                      {payment.reference_number}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: payment.status === PaymentStatus.VERIFIED ? "#5C7A35" : "#EF4444",
                      background: payment.status === PaymentStatus.VERIFIED ? "#EDF5E4" : "#FEF2F2",
                      borderRadius: 20,
                      padding: "3px 10px",
                    }}
                  >
                    {payment.status === PaymentStatus.VERIFIED ? "✓ Approved" : "✗ Rejected"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Pending app reviews (B4) ── */}
        <h2 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 16, fontWeight: 700, color: "#2E1A0C", margin: "36px 0 12px" }}>
          Pending Reviews
        </h2>
        {reviews.length === 0 ? (
          <div style={{ background: "#FFFCF7", border: "1.5px dashed #E0C9A8", borderRadius: 16, padding: "32px 24px", textAlign: "center" }}>
            <p style={{ color: "#8A6E52", fontSize: 14 }}>No pending reviews.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {reviews.map((review) => {
              const rs = reviewRowStates[review.id] ?? emptyReviewRowState();
              const busy = rs.actionState !== "idle";
              return (
                <div
                  key={review.id}
                  style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 16, padding: "20px 22px" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "#2E1A0C", marginBottom: 2 }}>
                        {review.userEmail}
                      </p>
                      <p style={{ fontSize: 13, color: "#C47A2E", margin: 0 }}>
                        {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, background: "#FBF0E0", color: "#C47A2E", borderRadius: 20, padding: "3px 10px" }}>
                      Pending
                    </span>
                  </div>

                  <p style={{ fontSize: 14, color: "#2E1A0C", marginBottom: 14, whiteSpace: "pre-wrap" }}>
                    {review.review_text}
                  </p>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => verifyReview(review.id, true)}
                      style={{ background: "#5C7A35", color: "#FAF2E4", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
                    >
                      {busy ? "…" : `✓ Approve (+${ReferralCaps[ReferralEventType.APP_REVIEW].creditsAwarded} credits)`}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => verifyReview(review.id, false)}
                      style={{ background: "none", border: "1.5px solid #E0C9A8", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, color: "#8A6E52", cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
                    >
                      ✗ Reject
                    </button>
                  </div>

                  {rs.error && (
                    <p style={{ fontSize: 12, color: "#EF4444", marginTop: 8 }}>{rs.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Users (E4) ── */}
        <h2 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 16, fontWeight: 700, color: "#2E1A0C", margin: "36px 0 12px" }}>
          Users
        </h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadUsers(userSearch.trim() || undefined); }}
            placeholder="Search by email…"
            style={{ flex: 1, background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#2E1A0C", fontFamily: "var(--font-dm-sans, sans-serif)", outline: "none" }}
          />
          <button
            type="button"
            onClick={() => loadUsers(userSearch.trim() || undefined)}
            disabled={usersLoading}
            style={{ background: "#5C7A35", color: "#FAF2E4", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: usersLoading ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
          >
            {usersLoading ? "Loading…" : "Search"}
          </button>
        </div>

        {users.length === 0 ? (
          <div style={{ background: "#FFFCF7", border: "1.5px dashed #E0C9A8", borderRadius: 16, padding: "32px 24px", textAlign: "center", marginBottom: 36 }}>
            <p style={{ color: "#8A6E52", fontSize: 14 }}>{usersLoading ? "Loading users…" : "No users found."}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 36 }}>
            {users.map((u) => {
              const gs = grantStates[u.id] ?? emptyGrantState();
              return (
                <div key={u.id} style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 14, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#2E1A0C", marginBottom: 2 }}>
                        {u.email}
                        {u.is_admin && (
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: "#FBF0E0", color: "#C47A2E", borderRadius: 20, padding: "2px 8px" }}>
                            Admin
                          </span>
                        )}
                      </p>
                      <p style={{ fontSize: 12, color: "#8A6E52", margin: 0 }}>
                        {u.full_name ?? "—"} · {u.subscription_tier} · {u.token_balance} credits
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      type="number"
                      value={gs.amount}
                      onChange={(e) => setGrant(u.id, { amount: e.target.value, success: "" })}
                      placeholder="Amount"
                      min={Validation.adminCreditGrant.minAmount}
                      max={Validation.adminCreditGrant.maxAmount}
                      style={{ width: 90, background: "#FAF2E4", border: "1.5px solid #E0C9A8", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#2E1A0C", fontFamily: "var(--font-dm-sans, sans-serif)", outline: "none" }}
                    />
                    <input
                      type="text"
                      value={gs.notes}
                      onChange={(e) => setGrant(u.id, { notes: e.target.value, success: "" })}
                      maxLength={Validation.adminNotes.maxLength}
                      placeholder="Notes (optional)"
                      style={{ flex: 1, minWidth: 160, background: "#FAF2E4", border: "1.5px solid #E0C9A8", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#2E1A0C", fontFamily: "var(--font-dm-sans, sans-serif)", outline: "none" }}
                    />
                    <button
                      type="button"
                      disabled={gs.busy}
                      onClick={() => grantCredits(u)}
                      style={{ background: "#5C7A35", color: "#FAF2E4", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: gs.busy ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
                    >
                      {gs.busy ? "Granting…" : "Grant credits"}
                    </button>
                  </div>
                  {gs.error && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>{gs.error}</p>}
                  {gs.success && <p style={{ fontSize: 12, color: "#5C7A35", marginTop: 6 }}>{gs.success}</p>}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Audit Log (E4) ── */}
        <h2 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 16, fontWeight: 700, color: "#2E1A0C", margin: "36px 0 12px" }}>
          Audit Log
        </h2>
        {auditLog.length === 0 ? (
          <div style={{ background: "#FFFCF7", border: "1.5px dashed #E0C9A8", borderRadius: 16, padding: "32px 24px", textAlign: "center" }}>
            <p style={{ color: "#8A6E52", fontSize: 14 }}>{auditLoading ? "Loading…" : "No admin actions yet."}</p>
          </div>
        ) : (
          <div style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 14, overflow: "hidden" }}>
            {auditLog.map((entry, i) => (
              <div
                key={entry.id}
                style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 18px", borderBottom: i < auditLog.length - 1 ? "1px solid #E0C9A8" : "none", gap: 12, flexWrap: "wrap" }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#2E1A0C", marginBottom: 2 }}>
                    {entry.action}
                    {entry.targetUserEmail ? ` — ${entry.targetUserEmail}` : ""}
                    {entry.credits_amount != null ? ` (${entry.credits_amount} credits)` : ""}
                  </p>
                  <p style={{ fontSize: 12, color: "#8A6E52", margin: 0 }}>
                    {entry.adminEmail ? `by ${entry.adminEmail}` : "system"}
                    {entry.paymentReference ? ` · ref ${entry.paymentReference}` : ""}
                    {entry.notes ? ` · ${entry.notes}` : ""}
                  </p>
                </div>
                <span style={{ fontSize: 12, color: "#8A6E52", whiteSpace: "nowrap" }}>
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
