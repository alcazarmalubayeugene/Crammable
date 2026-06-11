"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PaymentStatus, TableNames, UIMessages } from "@/lib/contracts";

interface ToastState {
  message: string;
  tone: "success" | "error";
}

/**
 * E1 — global Realtime listener for the current user's payment_submissions.
 * Subscribes to UPDATE events scoped by RLS ("users read own") and surfaces a
 * toast when an admin approves or rejects a pending payment, without the user
 * needing to reload the page.
 */
export default function PaymentNotifications() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel(`payment-status-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: TableNames.paymentSubmissions,
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as { status: string; rejection_reason: string | null };
            if (row.status === PaymentStatus.VERIFIED) {
              setToast({ message: UIMessages.paymentApproved, tone: "success" });
            } else if (row.status === PaymentStatus.REJECTED) {
              setToast({
                message: UIMessages.paymentRejected(row.rejection_reason ?? "No reason given"),
                tone: "error",
              });
            }
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 100,
        maxWidth: 360,
        background: toast.tone === "success" ? "#EDF5E4" : "#FEF2F2",
        border: `1.5px solid ${toast.tone === "success" ? "#5C7A35" : "#EF4444"}`,
        color: toast.tone === "success" ? "#3F5424" : "#991B1B",
        borderRadius: 12,
        padding: "14px 18px",
        fontFamily: "var(--font-dm-sans, sans-serif)",
        fontSize: 13,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        type="button"
        onClick={() => setToast(null)}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 700,
          color: "inherit",
          lineHeight: 1,
          padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
