"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Global route-progress bar — a thin top bar in var(--primary) that animates
 * during client-side navigation, giving immediate feedback on the click→new-page
 * window that the (now-softened) root loading.tsx used to fill with a full-screen
 * spinner.
 *
 * Mounted once in the root layout. There is no single Next primitive that fires
 * on *every* navigation start (useLinkStatus only works *inside* a <Link>), so
 * the bar is:
 *   - started by a capture-phase click on any internal <a>/<Link> whose target
 *     differs from the current URL, and
 *   - completed by a usePathname() change effect once the new route commits.
 * A started bar that never sees a path change (e.g. an aborted nav) is harmless;
 * the next start() resets it. router.push() navigations don't start the bar, but
 * the pathname effect still completes any in-flight one.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (fadeRef.current) {
      clearTimeout(fadeRef.current);
      fadeRef.current = null;
    }
  }

  function start() {
    if (activeRef.current) return;
    activeRef.current = true;
    clearTimers();
    setVisible(true);
    setProgress(8);
    // Creep toward ~90% with diminishing steps so the bar keeps moving while
    // the route loads but never quite reaches the end until navigation commits.
    timerRef.current = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + Math.max(0.5, (90 - p) * 0.08)));
    }, 200);
  }

  function done() {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setProgress(100);
    fadeRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
  }

  // Complete the bar whenever the committed pathname changes.
  useEffect(() => {
    done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Start the bar on internal-link clicks that will actually navigate away.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      // Only plain left-clicks — let modified clicks open new tabs untouched.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (/^(mailto:|tel:)/.test(href)) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      // Same-origin only, and only when the path/query actually changes
      // (ignore hash-only and same-page links).
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      start();
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
    // start() is stable for our purposes (guarded by activeRef); re-subscribing
    // every render would needlessly churn the document listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tidy up timers on unmount.
  useEffect(() => clearTimers, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: "none",
        opacity: progress >= 100 ? 0 : 1,
        transition: "opacity 250ms ease 150ms",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "var(--primary)",
          boxShadow: "0 0 8px var(--primary)",
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}
