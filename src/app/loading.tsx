import { PageLoading } from "@/components/ui/PageLoading";

/**
 * App-wide route loading fallback (App Router convention). Shown during route
 * segment transitions / Suspense — reuses the shared spinner so navigations
 * animate instead of flashing blank.
 */
export default function Loading() {
  return <PageLoading />;
}
