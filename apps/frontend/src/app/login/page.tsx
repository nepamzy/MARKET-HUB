"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormAlert } from "@/components/FormAlert";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-navy">MARKET HUB</h1>
          <p className="mt-1 text-sm text-text-secondary">Sign in to your account</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            {error && <FormAlert>{error}</FormAlert>}

            <div>
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-center text-sm text-text-secondary">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-medium text-green-dark hover:underline">
                Create one
              </Link>
            </p>
          </form>
        </div>
      </div>

      <div className="hidden bg-navy lg:flex lg:flex-col lg:items-start lg:justify-center lg:px-16">
        <h2 className="max-w-md text-3xl font-semibold text-white">
          Commerce, supply chain and logistics — in one place.
        </h2>
        <p className="mt-4 max-w-sm text-white/70">
          Producers, wholesalers, retailers and direct businesses, connected end to end.
        </p>
      </div>
    </div>
  );
}
