"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";

function AccountContent() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-navy">Account</h1>
      <p className="mt-1 text-sm text-text-secondary">Your MARKET HUB profile.</p>

      <div className="card mt-6">
        <dl className="divide-y divide-border">
          <div className="flex items-center justify-between py-3">
            <dt className="text-sm text-text-secondary">Name</dt>
            <dd className="text-sm font-medium text-text-primary">{user.name}</dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-sm text-text-secondary">Email</dt>
            <dd className="text-sm font-medium text-text-primary">{user.email}</dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-sm text-text-secondary">Phone</dt>
            <dd className="text-sm font-medium text-text-primary">{user.phone ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-sm text-text-secondary">Account status</dt>
            <dd>
              <StatusBadge status={user.accountStatus} />
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-sm text-text-secondary">Member since</dt>
            <dd className="text-sm font-medium text-text-primary">
              {new Date(user.createdAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountContent />
    </RequireAuth>
  );
}
