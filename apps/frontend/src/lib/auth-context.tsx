"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";
import type { PublicUser } from "./types";

interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

interface AuthContextValue {
  user: PublicUser | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<string | null> => {
    try {
      const res = await apiFetch<{ user: PublicUser; accessToken: string }>("/auth/refresh", {
        method: "POST",
      });
      setUser(res.user);
      setAccessToken(res.accessToken);
      return res.accessToken;
    } catch {
      setUser(null);
      setAccessToken(null);
      return null;
    }
  }, []);

  useEffect(() => {
    // On first load there is no in-memory access token yet (it is never
    // persisted to localStorage — only the httpOnly refresh cookie
    // survives a page reload) so we silently try to establish a session
    // from that cookie.
    refreshUser().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(res.user);
    setAccessToken(res.accessToken);
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string; phone?: string }) => {
      const res = await apiFetch<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setUser(res.user);
      setAccessToken(res.accessToken);
    },
    []
  );

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setAccessToken(null);
  }, []);

  const value = useMemo(
    () => ({ user, accessToken, loading, login, register, logout, refreshUser }),
    [user, accessToken, loading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
