"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "./RequireAuth";

/**
 * Client-side gate for a nicer redirect UX only — the frontend hiding a
 * link is never security. Every admin API call is independently enforced
 * server-side by requirePlatformRole("PLATFORM_ADMIN") (Rule 6).
 */
export function RequirePlatformAdmin({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AdminGate>{children}</AdminGate>
    </RequireAuth>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.platformRole !== "PLATFORM_ADMIN") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || user.platformRole !== "PLATFORM_ADMIN") {
    return null;
  }

  return <>{children}</>;
}
