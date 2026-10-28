"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PublicAppUser } from "@/lib/types";

/** Pages anyone may open signed out - everywhere else a missing session sends the browser to /login. */
const PUBLIC_PREFIXES = ["/login", "/share/"];

interface AuthContextValue {
  appUser: PublicAppUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<PublicAppUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Bootstraps from GET /api/auth/me (the httpOnly session cookie proves who's
 * signed in server-side; this just fetches their profile for client
 * components to read). proxy.ts is what actually gates access to protected
 * routes - this context exists for UI convenience (the sidebar's user chip,
 * the login form, logout), not as the access-control mechanism itself.
 *
 * Signing in or out wipes the react-query cache: the app shares one
 * QueryClient across client-side navigations, and many query keys are not
 * per-user, so the next person on a shared terminal would otherwise see the
 * previous user's cached lists until they refetched.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [appUser, setAppUser] = useState<PublicAppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { appUser: null }))
      .then((data) => {
        if (!mounted) return;
        setAppUser(data.appUser ?? null);
        // The token was valid enough for proxy.ts but the server has ended it (account deactivated, password
        // reset) and cleared the cookie - go back to the login page rather than sit on a page that can't load.
        const path = window.location.pathname;
        if (!data.appUser && !PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
          queryClient.clear();
          window.location.replace("/login");
        }
      })
      .catch(() => {
        // Network failure: leave the page as it is; its own queries report the problem.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      appUser,
      loading,
      isAdmin: appUser?.role === "admin",
      login: async (username, password) => {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Login failed.");
        queryClient.clear();
        setAppUser(data.appUser);
        return data.appUser as PublicAppUser;
      },
      logout: async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        queryClient.clear();
        setAppUser(null);
      },
    }),
    [appUser, loading, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
