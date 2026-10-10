"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuthedFetch } from "./use-authed-fetch";
import type { NotificationListResponse, NotificationView } from "./types";

/** Honest polling, same discipline as Phase 12's driver-location refresh —
 * no websocket/push infra exists in this environment, so "live" means a
 * reliable, clearly-bounded refresh interval, not a fabricated real-time
 * feed. */
const POLL_MS = 30_000;
const TOAST_AUTO_DISMISS_MS = 6_000;

export interface Toast {
  id: string;
  title: string;
  message: string;
}

interface NotificationsContextValue {
  notifications: NotificationView[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  toasts: Toast[];
  dismissToast: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const authedFetch = useAuthedFetch();
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (notification: NotificationView) => {
      const toast: Toast = { id: notification.id, title: notification.title, message: notification.message };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => dismissToast(toast.id), TOAST_AUTO_DISMISS_MS);
    },
    [dismissToast]
  );

  const refresh = useCallback(async () => {
    try {
      const res = await authedFetch<NotificationListResponse>("/notifications?pageSize=20");
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
      setError(null);

      // Toast only genuinely NEW unread notifications — never the same
      // event twice, and never on the very first load (that would toast a
      // user's whole backlog the instant they open the app).
      if (!isFirstLoad.current) {
        for (const n of res.notifications) {
          if (!n.readAt && !seenIds.current.has(n.id)) {
            pushToast(n);
          }
        }
      }
      for (const n of res.notifications) {
        seenIds.current.add(n.id);
      }
      isFirstLoad.current = false;
    } catch {
      setError("Could not load notifications right now.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToast]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) => prev.map((n) => (n.id === notificationId && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        await authedFetch(`/notifications/${notificationId}/read`, { method: "POST" });
      } catch {
        // Best-effort optimistic update — the next poll reconciles state
        // if the write actually failed server-side.
      }
    },
    [authedFetch]
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    try {
      await authedFetch("/notifications/read-all", { method: "POST" });
    } catch {
      refresh();
    }
  }, [authedFetch, refresh]);

  const value = useMemo(
    () => ({ notifications, unreadCount, loading, error, refresh, markRead, markAllRead, toasts, dismissToast }),
    [notifications, unreadCount, loading, error, refresh, markRead, markAllRead, toasts, dismissToast]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}
