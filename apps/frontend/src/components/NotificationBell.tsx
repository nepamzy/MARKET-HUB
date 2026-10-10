"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { resolveNotificationHref } from "@/lib/notification-links";
import { useNotifications } from "@/lib/notifications-context";
import type { NotificationView } from "@/lib/types";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationRow({ notification, onRead }: { notification: NotificationView; onRead: (id: string) => void }) {
  const href = resolveNotificationHref(notification.relatedEntityType, notification.relatedEntityId);
  const unread = !notification.readAt;

  const body = (
    <div className={`flex gap-2 rounded-control px-3 py-2.5 ${unread ? "bg-green/5" : ""} hover:bg-background`}>
      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${unread ? "bg-green" : "bg-transparent"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{notification.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{notification.message}</p>
        <p className="mt-1 text-xs text-text-secondary">{timeAgo(notification.createdAt)}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} onClick={() => unread && onRead(notification.id)} className="block">
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => unread && onRead(notification.id)} className="block w-full text-left">
      {body}
    </button>
  );
}

const PANEL_WIDTH = 320;
const VIEWPORT_MARGIN = 12;

export function NotificationBell() {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // The bell renders in two very different contexts — a narrow left
  // sidebar on desktop, a cramped top bar on mobile — so a CSS-only
  // right-0/left-0 anchor overflows off one side or the other depending on
  // where the button happens to sit. Instead, position the panel as a
  // viewport-fixed element placed from the button's actual measured
  // position, clamped to stay fully on-screen with a small margin.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.right - PANEL_WIDTH, maxLeft));
    setPanelStyle({ top: rect.bottom + 8, left });
  }, [open]);

  const recent = notifications.slice(0, 5);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative rounded-control p-2 text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && panelStyle && (
        <div
          style={{ top: panelStyle.top, left: panelStyle.left, width: PANEL_WIDTH }}
          className="fixed z-20 max-w-[calc(100vw-1.5rem)] rounded-control border border-border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <p className="text-sm font-semibold text-text-primary">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={() => markAllRead()} className="text-xs font-medium text-green-dark hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto p-1">
            {loading && <p className="px-3 py-4 text-center text-sm text-text-secondary">Loading…</p>}
            {!loading && error && <p className="px-3 py-4 text-center text-sm text-danger">{error}</p>}
            {!loading && !error && recent.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-text-secondary">You&apos;re all caught up.</p>
            )}
            {!loading &&
              !error &&
              recent.map((n) => <NotificationRow key={n.id} notification={n} onRead={markRead} />)}
          </div>

          <div className="border-t border-border px-3 py-2">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-sm font-medium text-green-dark hover:underline">
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
