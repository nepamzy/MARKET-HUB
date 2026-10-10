"use client";

import { useEffect, useRef } from "react";

/**
 * Accessible confirmation modal built on the native <dialog> element
 * (focus trap, Esc-to-close and backdrop come from the browser). Used before
 * lifecycle actions that cannot be undone.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-border bg-surface p-0 shadow-xl backdrop:bg-navy/40"
    >
      <div className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-navy">{title}</h2>
        <div className="mt-2 space-y-2 text-sm text-text-secondary">{children}</div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
