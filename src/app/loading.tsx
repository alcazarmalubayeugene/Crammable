/**
 * Root route-transition fallback (App Router convention).
 *
 * Deliberately minimal: the global <RouteProgress> bar now carries navigation
 * feedback, and each content page renders its own nav + skeletons on mount — so
 * this no longer renders a full-screen spinner. Doing so caused a double
 * full-screen flash (route-transition spinner → page mounts → data-fetch
 * spinner). It just holds the theme background so the transition doesn't flash
 * a bare/off-theme colour while the destination route mounts.
 */
export default function Loading() {
  return <div style={{ minHeight: "100vh", background: "var(--bg)" }} />;
}
