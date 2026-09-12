"use client";

import { useCallback } from "react";
import { apiFetch, ApiError } from "./api";
import { useAuth } from "./auth-context";

/**
 * Wraps apiFetch with the current access token and, on a single 401,
 * silently refreshes the session once and retries — access tokens are
 * short-lived by design (15m default) so an expiry mid-session is routine,
 * not exceptional.
 */
export function useAuthedFetch() {
  const { accessToken, refreshUser } = useAuth();

  return useCallback(
    async <T>(path: string, options: RequestInit = {}): Promise<T> => {
      try {
        return await apiFetch<T>(path, { ...options, accessToken });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          const freshToken = await refreshUser();
          return apiFetch<T>(path, { ...options, accessToken: freshToken });
        }
        throw err;
      }
    },
    [accessToken, refreshUser]
  );
}
