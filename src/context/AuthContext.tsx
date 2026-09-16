"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicAppUser } from "@/lib/types";

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
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [appUser, setAppUser] = useState<PublicAppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setAppUser(data.appUser ?? null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

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
        setAppUser(data.appUser);
        return data.appUser as PublicAppUser;
      },
      logout: async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setAppUser(null);
      },
    }),
    [appUser, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
