/**
 * useNotifications — Real-time notifications hook
 * ─────────────────────────────────────────────────────────
 * In supabase mode: subscribes to Supabase Realtime channel on `notifications` table.
 * In demo mode: polls localStorage via notificationsStore.
 * 
 * Provides: notifications[], unreadCount, markAsRead, markAllAsRead, deleteNotification
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { isSupabaseMode } from "@/lib/services/api";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "@/lib/services/notificationService";
import type { Notification } from "@/lib/services/notificationService";
import { createClient } from "@/lib/supabase/client";

export interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL = 30_000; // 30s fallback polling

export function useNotifications(limit = 20): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [items, count] = await Promise.all([
        getNotifications({ limit }),
        getUnreadCount(),
      ]);
      setNotifications(items);
      setUnreadCount(count);
    } catch {
      // Keep existing state on error
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // ── Supabase Realtime subscription ──────────────────────────────────────────
  useEffect(() => {
    refresh();

    if (isSupabaseMode) {
      try {
        const supabase = createClient();
        const channel = supabase
          .channel("notifications-realtime")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
            },
            () => {
              // Re-fetch on any notification change
              refresh();
            },
          )
          .subscribe();

        channelRef.current = channel;

        return () => {
          supabase.removeChannel(channel);
        };
      } catch {
        // If Realtime fails, fall back to polling
        const interval = setInterval(refresh, POLL_INTERVAL);
        return () => clearInterval(interval);
      }
    } else {
      // Demo mode: poll localStorage
      const interval = setInterval(refresh, POLL_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [refresh]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const markRead = useCallback(async (id: string) => {
    await markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const remove = useCallback(async (id: string) => {
    const wasUnread = notifications.find(n => n.id === id && !n.read);
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    remove,
    refresh,
  };
}
