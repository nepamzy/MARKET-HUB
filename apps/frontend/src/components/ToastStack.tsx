"use client";

import { useNotifications } from "@/lib/notifications-context";

/**
 * Fixed-position toast stack for meaningful events (payment confirmed, PO
 * approved, driver assigned, delivery updated, etc.) — sourced from the
 * same notification feed the bell/center use, so a toast is never shown
 * for an event the backend didn't actually record, and the same
 * notification id is never toasted twice (see NotificationsProvider).
 */
export function ToastStack() {
  const { toasts, dismissToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-30 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="flex items-start gap-3 rounded-control border border-border bg-surface p-3 shadow-lg"
        >
          <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-green" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className="flex-shrink-0 text-text-secondary hover:text-text-primary"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
