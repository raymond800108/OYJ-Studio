"use client";

import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";

/* ─── Types ─────────────────────────────────────────────────────── */

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  provider: "line" | "google";
  plan: "free" | "starter" | "pro" | "business";
  credits: number;
}

/**
 * DEV-ONLY auth bypass. When `NEXT_PUBLIC_DEV_AUTH_BYPASS=1` AND not in
 * production, returns a fake admin user so the client UI bypasses the
 * sign-in gate. Server-side API routes are NOT bypassed — they still
 * enforce `getSession()`. This is for visual review on local preview only.
 */
export const isDevAuthBypass =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "1" &&
  process.env.NODE_ENV !== "production";

const DEV_BYPASS_USER: AuthUser = {
  id: "dev-bypass",
  name: "Dev Reviewer",
  email: "raymond800108@gmail.com", // admin allowlist email
  avatar: null,
  provider: "google",
  plan: "business",
  credits: 999999,
};

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** True when the initial /api/auth/me fetch has completed */
  ready: boolean;
}

interface AuthContextValue extends AuthState {
  /** Re-fetch user profile from server */
  refresh: () => Promise<void>;
  /** Sign out and clear session */
  logout: () => Promise<void>;
  /** Show login modal */
  openLogin: () => void;
  /** Hide login modal */
  closeLogin: () => void;
  /** Whether the login modal is visible */
  loginOpen: boolean;
}

/* ─── Context ───────────────────────────────────────────────────── */

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  ready: false,
  refresh: async () => {},
  logout: async () => {},
  openLogin: () => {},
  closeLogin: () => {},
  loginOpen: false,
});

export const useAuth = () => useContext(AuthContext);

/* ─── Hook (used inside AuthProvider) ───────────────────────────── */

export function useAuthState(): AuthContextValue {
  const [state, setState] = useState<AuthState>(
    isDevAuthBypass
      ? { user: DEV_BYPASS_USER, loading: false, ready: true }
      : { user: null, loading: true, ready: false }
  );
  const [loginOpen, setLoginOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (isDevAuthBypass) {
      setState({ user: DEV_BYPASS_USER, loading: false, ready: true });
      return;
    }
    try {
      setState((s) => ({ ...s, loading: true }));
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setState({
        user: data.user ?? null,
        loading: false,
        ready: true,
      });
    } catch {
      setState({ user: null, loading: false, ready: true });
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setState({ user: null, loading: false, ready: true });
    setLoginOpen(false);
  }, []);

  const openLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  // Fetch user on mount (skipped under dev bypass — user is already populated)
  useEffect(() => {
    if (isDevAuthBypass) return;
    refresh();
  }, [refresh]);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      loading: state.loading,
      ready: state.ready,
      refresh,
      logout,
      openLogin,
      closeLogin,
      loginOpen,
    }),
    [state.user, state.loading, state.ready, refresh, logout, openLogin, closeLogin, loginOpen]
  );

  return value;
}
