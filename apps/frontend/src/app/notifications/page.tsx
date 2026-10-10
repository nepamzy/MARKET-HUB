"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { resolveNotificationHref } from "@/lib/notification-links";
import { useNotifications } from "@/lib/notifications-context";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import type { NotificationListResponse, NotificationView } from "@/lib/types";

const PAGE_SIZE = 20;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NotificationCard({ notification, onRead }: { notification: NotificationView; onRead: (id: string) => void }) {
  const href = resolveNotificationHref(notification.relatedEntityType, notification.relatedEntityId);
  const unread = !notification.readAt;

  const inner = (
    <div className={`card flex items-start gap-3 ${unread ? "border-green/30 bg-green/5" : ""}`}>
      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${unread ? "bg-green" : "bg-transparent"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-text-primary">{notification.title}</p>
          <p className="text-xs text-text-secondary">{formatTimestamp(notification.createdAt)}</p>
        </div>
        <p className="mt-1 text-sm text-text-secondary">{notification.message}</p>
        {href && <p className="mt-2 text-sm font-medium text-green-dark">View details →</p>}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} onClick={() => unread && onRead(notification.id)} className="block">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => unread && onRead(notification.id)} className="block w-full text-left">
      {inner}
    </button>
  );
}

function NotificationsPageContent() {
  const authedFetch = useAuthedFetch();
  const { markRead, markAllRead, unreadCount: contextUnreadCount } = useNotifications();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [notifications, setNotifications] = useState<NotificationView[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (targetPage: number, targetTab: "all" | "unread") => {
      setLoading(true);
      try {
        const res = await authedFetch<NotificationListResponse>(
          `/notifications?page=${targetPage}&pageSize=${PAGE_SIZE}&unreadOnly=${targetTab === "unread"}`
        );
        setNotifications((prev) => (targetPage === 1 ? res.notifications : [...(prev ?? []), ...res.notifications]));
        setTotal(res.total);
        setError(null);
      } catch {
        setError("Could not load notifications right now.");
      } finally {
        setLoading(false);
      }
    },
    [authedFetch]
  );

  useEffect(() => {
    setPage(1);
    load(1, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleRead(notificationId: string) {
    await markRead(notificationId);
    setNotifications((prev) => (prev ? prev.map((n) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n)) : prev));
  }

  async function handleMarkAllRead() {
    await markAllRead();
    setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev));
    if (tab === "unread") {
      setPage(1);
      load(1, "unread");
    }
  }

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    load(nextPage, tab);
  }

  const hasMore = notifications ? notifications.length < total : false;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Notifications</h1>
          <p className="mt-1 text-sm text-text-secondary">Updates about your orders, procurement, deliveries, and account.</p>
        </div>
        {contextUnreadCount > 0 && (
          <button type="button" onClick={handleMarkAllRead} className="btn-secondary">
            Mark all read
          </button>
        )}
      </div>

      <div className="mt-6 flex gap-1 border-b border-border">
        {(["all", "unread"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? "border-green text-green-dark" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t === "all" ? "All" : "Unread"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {loading && page === 1 && <p className="py-8 text-center text-sm text-text-secondary">Loading…</p>}
        {!loading && error && <p className="py-8 text-center text-sm text-danger">{error}</p>}
        {!loading && !error && notifications && notifications.length === 0 && (
          <div className="rounded-control border border-dashed border-border p-8 text-center">
            <p className="text-sm text-text-secondary">
              {tab === "unread" ? "You're all caught up — no unread notifications." : "No notifications yet."}
            </p>
          </div>
        )}
        {notifications?.map((n) => (
          <NotificationCard key={n.id} notification={n} onRead={handleRead} />
        ))}
      </div>

      {hasMore && !loading && (
        <div className="mt-4 text-center">
          <button type="button" onClick={loadMore} className="btn-secondary">
            Load more
          </button>
        </div>
      )}
      {loading && page > 1 && <p className="mt-4 text-center text-sm text-text-secondary">Loading more…</p>}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsPageContent />
    </RequireAuth>
  );
}
