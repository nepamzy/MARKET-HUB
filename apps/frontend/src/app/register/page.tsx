"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormAlert } from "@/components/FormAlert";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { BusinessType } from "@market-hub/shared";
import { BUSINESS_TYPES } from "@market-hub/shared";

type AccountCategory = "individual" | "business";
type Step = "account-info" | "category" | "business-type";

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  PRODUCER_MANUFACTURER: "Producer / Manufacturer",
  WHOLESALER: "Wholesaler",
  RETAILER: "Retailer",
  DIRECT_BUSINESS: "Direct Business",
  LOGISTICS_COMPANY: "Logistics Company",
};

const STEP_NUMBER: Record<Step, number> = { "account-info": 1, category: 2, "business-type": 3 };

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("account-info");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function goToCategoryStep(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("category");
  }

  function chooseCategory(next: AccountCategory) {
    setError(null);
    if (next === "individual") {
      // An individual/customer account has no business type — submit right
      // away. (Platform role stays CUSTOMER either way: business identity
      // belongs to Organization.businessType, never to a platform role.)
      void submit(null);
    } else {
      setStep("business-type");
    }
  }

  async function submit(chosenBusinessType: BusinessType | null) {
    setError(null);
    setSubmitting(true);
    try {
      await register({ name, email, password });
      if (chosenBusinessType) {
        router.push(`/organizations/new?businessType=${chosenBusinessType}`);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setStep("account-info");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="card">
          <h1 className="text-xl font-semibold text-navy">Create your MARKET HUB account</h1>
          <p className="mt-1 text-sm text-text-secondary">Step {STEP_NUMBER[step]} of 3</p>

          {error && (
            <div className="mt-4">
              <FormAlert>{error}</FormAlert>
            </div>
          )}

          {step === "account-info" && (
            <form onSubmit={goToCategoryStep} className="mt-6 space-y-5" noValidate>
              <div>
                <label htmlFor="name" className="field-label">
                  Full name
                </label>
                <input
                  id="name"
                  required
                  minLength={2}
                  className="field-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="email" className="field-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
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
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="field-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-text-secondary">
                  At least 8 characters, with an uppercase letter, a lowercase letter and a number.
                </p>
              </div>
              <button type="submit" className="btn-primary w-full">
                Continue
              </button>
            </form>
          )}

          {step === "category" && (
            <div className="mt-6 space-y-3">
              <p className="field-label">What best describes you?</p>
              <button
                type="button"
                onClick={() => chooseCategory("individual")}
                disabled={submitting}
                className="w-full rounded-card border border-border p-4 text-left hover:border-green"
              >
                <p className="font-medium text-text-primary">Individual / Customer</p>
                <p className="text-sm text-text-secondary">I want to buy from MARKET HUB sellers.</p>
              </button>
              <button
                type="button"
                onClick={() => chooseCategory("business")}
                disabled={submitting}
                className="w-full rounded-card border border-border p-4 text-left hover:border-green"
              >
                <p className="font-medium text-text-primary">Business</p>
                <p className="text-sm text-text-secondary">
                  I represent a producer, wholesaler, retailer, direct business or logistics company.
                </p>
              </button>
              <button type="button" onClick={() => setStep("account-info")} className="btn-tertiary px-0 text-sm">
                Back
              </button>
            </div>
          )}

          {step === "business-type" && (
            <div className="mt-6 space-y-3">
              <p className="field-label">What type of business?</p>
              <div className="space-y-2">
                {BUSINESS_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setBusinessType(type)}
                    className={`w-full rounded-card border p-3 text-left text-sm font-medium ${
                      businessType === type
                        ? "border-green bg-green/5 text-green-dark"
                        : "border-border text-text-primary hover:border-green"
                    }`}
                  >
                    {BUSINESS_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!businessType || submitting}
                onClick={() => businessType && submit(businessType)}
                className="btn-primary mt-2 w-full"
              >
                {submitting ? "Creating account…" : "Create account"}
              </button>
              <button type="button" onClick={() => setStep("category")} className="btn-tertiary px-0 text-sm">
                Back
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-text-secondary">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-green-dark hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
