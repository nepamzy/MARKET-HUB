"use client";

import { RequirePlatformAdmin } from "@/components/RequirePlatformAdmin";

function SettingsContent() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Platform settings</h1>
      <p className="mt-1 text-sm text-text-secondary">Platform-wide configuration and admin management.</p>

      <div className="mt-6 rounded-card border border-dashed border-border bg-surface p-6">
        <p className="text-sm font-semibold text-text-primary">Not available yet</p>
        <p className="mt-2 text-sm text-text-secondary">
          There is no platform settings table or configuration model in the database yet — this section genuinely
          does not exist as a capability, not just as a missing page. Adding one is a database-structure decision
          (Rule 18: schema changes go through <code>prisma migrate</code>, never ad hoc) that needs to specify what
          settings actually exist before anything can be built. Nothing here is a stand-in for real settings.
        </p>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <RequirePlatformAdmin>
      <SettingsContent />
    </RequirePlatformAdmin>
  );
}
