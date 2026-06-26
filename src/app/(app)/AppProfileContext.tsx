"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Routes, TableNames } from "@/lib/contracts";

/**
 * The single authenticated-session profile, fetched once by the (app) route
 * group layout and shared with every page under it via React context. This
 * replaces the auth check (`getUser()` → login redirect) + profile read that
 * used to be duplicated in each page's load effect.
 *
 * Columns are the superset every authed page reads (dashboard, decks, settings,
 * rewards, upgrade, admin). Pages take what they need; the Navbar renders
 * pre-data (coin pill / name absent) while `loading` is true, so it never blanks.
 */
export interface AppProfile {
  id: string;
  email: string;
  full_name: string | null;
  course: string | null;
  subscription_tier: string;
  subscription_expires_at: string | null;
  token_balance: number;
  referral_code: string | null;
  referred_by: string | null;
  is_admin: boolean;
}

const PROFILE_COLUMNS =
  "id, email, full_name, course, subscription_tier, subscription_expires_at, token_balance, referral_code, referred_by, is_admin";

interface AppProfileContextValue {
  profile: AppProfile | null;
  /** True until the auth check + profile fetch resolve. */
  loading: boolean;
  /** Re-fetch the profile from the DB (after a server-side mutation). */
  refresh: () => Promise<void>;
  /** Optimistically patch the in-memory profile (after a local mutation). */
  mutate: (patch: Partial<AppProfile>) => void;
}

const AppProfileContext = createContext<AppProfileContextValue | null>(null);

/** Read the shared authenticated profile. Must be used under the (app) layout. */
export function useAppProfile(): AppProfileContextValue {
  const ctx = useContext(AppProfileContext);
  if (!ctx) {
    throw new Error("useAppProfile must be used within the (app) route group layout");
  }
  return ctx;
}

export function AppProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Bumped by refresh() to re-run the fetch effect below.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Not signed in → bounce to login, same hard redirect the pages used to do.
      if (!user) {
        window.location.href = Routes.login;
        return;
      }
      // RLS-scoped read of the user's own profile (no profile API route exists).
      const { data } = await supabase
        .from(TableNames.profiles)
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .single();
      if (!active) return;
      setProfile((data as AppProfile | null) ?? null);
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const refresh = useCallback(async () => {
    setReloadKey((k) => k + 1);
  }, []);

  const mutate = useCallback((patch: Partial<AppProfile>) => {
    setProfile((p) => (p ? { ...p, ...patch } : p));
  }, []);

  return (
    <AppProfileContext.Provider value={{ profile, loading, refresh, mutate }}>
      {children}
    </AppProfileContext.Provider>
  );
}
