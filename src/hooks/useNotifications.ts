/**
 * useNotifications — Real-time notifications hook
 * ─────────────────────────────────────────────────────────
 * In supabase mode: subscribes to Supabase Realtime channel on `notifications` table.
 * In demo mode: polls localStorage via notificationsStore.
 *
 * ── WHAT THIS HOOK NOW REFUSES TO SAY ───────────────────────────────────────
 *
 * Every screen with a bell reads through here, so whatever this hook exposes is
 * the most any of them can be honest about. It used to expose a bare
 * `Notification[]` and a bare `number`, and swallow a failed read into an empty
 * `catch` — so a notifications query that failed was byte-identical to an inbox
 * with nothing in it. A court date, an assignment or a payment notice,
 * reported as «لا توجد إشعارات».
 *
 * Three things are exposed instead, all ADDITIVE so existing callers keep
 * compiling:
 *
 *   `read`   the ListRead itself — the honest answer, failure included
 *   `state`  'loading' | 'unreadable' | 'empty' | 'ready' via listViewState()
 *   `unreadCountKnown`  false ⇒ the count could not be read; do NOT render it
 *
 * ── WHY `unreadCount` IS STILL `number` AND NOT `number | null` ──────────────
 *
 * getUnreadCount() returns `number | null` for a good reason, and this hook
 * would pass the null straight through if it could. It cannot: the sole
 * consumer, src/components/Navbar.tsx:87, compares it (`unread > 0`) and
 * `number | null` makes that line a compile error in a file this change does
 * not own and no other group is fixing.
 *
 * So the number is kept, and the failure is carried alongside it in
 * `unreadCountKnown`. Two rules follow, and both matter:
 *
 *   1. On an unreadable count the previous value is LEFT ALONE — never reset to
 *      0. A rendered ٠ is a claim ("you are up to date") and it is exactly as
 *      false as a rendered ٤٢.
 *   2. Navbar hides the badge at 0, which LOOKS like withholding but is not —
 *      it is the bell rendering its confident up-to-date state over a read that
 *      never answered. Making that honest needs `unreadCountKnown` at
 *      Navbar.tsx:87/:110 and `state` at Navbar.tsx:132. Reported as a followUp;
 *      it is one line in a file that is not this change's to touch.
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
import { listFailed, listViewState, type ListRead, type ListViewState } from "@/lib/services/listRead";
import { createClient } from "@/lib/supabase/client";

export interface UseNotificationsReturn {
  /** The items when the read succeeded; the LAST GOOD list when it did not. */
  notifications: Notification[];
  /** The read itself. `ok: false` means unreadable — not empty. */
  read: ListRead<Notification> | null;
  /** What a screen should render. Never confuse 'unreadable' with 'empty'. */
  state: ListViewState;
  /** Last known unread count. Meaningless unless `unreadCountKnown` is true. */
  unreadCount: number;
  /** False ⇒ the count could not be read. Render «—», never a number. */
  unreadCountKnown: boolean;
  loading: boolean;
  /** Arabic message from the last failed markRead/markAllRead/remove, or null. */
  actionError: string | null;
  clearActionError: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL = 30_000; // 30s fallback polling

export function useNotifications(limit = 20): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [read, setRead] = useState<ListRead<Notification> | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadCountKnown, setUnreadCountKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      // Neither of these rejects any more: the list reader returns `ok: false`
      // and the counter returns `null`. Promise.all is kept so a failed count
      // cannot throw away a perfectly good list, which is the whole reason
      // getUnreadCount() reports null instead of throwing.
      const [listRead, count] = await Promise.all([
        getNotifications({ limit }),
        getUnreadCount(),
      ]);

      setRead(listRead);
      // Only overwrite the visible list from a read that actually answered.
      // On failure the previous list stays and `state` turns 'unreadable', so a
      // screen shows the stale rows under a "could not refresh" marker rather
      // than blanking them into «لا توجد إشعارات».
      if (listRead.ok) setNotifications(listRead.items);

      if (count === null) {
        // NOT `setUnreadCount(0)`. See the header: zero is a claim.
        setUnreadCountKnown(false);
      } else {
        setUnreadCount(count);
        setUnreadCountKnown(true);
      }
    } catch (error) {
      // Should be unreachable — both calls handle their own failures — but an
      // unexpected throw here must not be recorded as an empty inbox either.
      console.error("[useNotifications] refresh failed:", error);
      setRead(listFailed<Notification>());
      setUnreadCountKnown(false);
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
  /*
    ALL THREE WRITES NOW REJECT IN SUPABASE MODE.

    They used to fall back to localStorage and resolve, so the row dimmed and
    the badge went down while the server still had the notification unread — it
    came back at the next load, or was never acted on.

    Each is wrapped rather than left as a bare await, for two reasons:
      - the optimistic state update must NOT run when the write failed. Dimming
        a row the server still holds unread is the same lie in a new place.
      - the only consumer calls these fire-and-forget
        (Navbar.tsx:118 `onClick={() => { markAllRead(); }}`), so re-throwing
        would produce an unhandled rejection and tell the user nothing at all.
        The failure is surfaced through `actionError` instead, which a caller
        can render in Arabic. Deliberately not rethrown — documented so the next
        reader does not "fix" it back into a silent throw.
  */
  const markRead = useCallback(async (id: string) => {
    try {
      await markAsRead(id);
    } catch (error) {
      console.error("[useNotifications] markAsRead failed:", error);
      setActionError("تعذّر تحديد الإشعار كمقروء. لم يُحفظ التغيير — أعد المحاولة.");
      return;
    }
    setActionError(null);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    // Only adjust a count we actually know. Decrementing an unknown number
    // would invent one.
    if (unreadCountKnown) setUnreadCount(prev => Math.max(0, prev - 1));
  }, [unreadCountKnown]);

  const markAllRead = useCallback(async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      console.error("[useNotifications] markAllAsRead failed:", error);
      setActionError("تعذّر تحديد الإشعارات كمقروءة. لم يُحفظ التغيير — أعد المحاولة.");
      return;
    }
    setActionError(null);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    // Zero here is a fact, not a guess: the server confirmed the write.
    setUnreadCount(0);
    setUnreadCountKnown(true);
  }, []);

  const remove = useCallback(async (id: string) => {
    const wasUnread = notifications.some(n => n.id === id && !n.read);
    try {
      await deleteNotification(id);
    } catch (error) {
      console.error("[useNotifications] deleteNotification failed:", error);
      setActionError("تعذّر حذف الإشعار. لم يُحفظ التغيير — أعد المحاولة.");
      return;
    }
    setActionError(null);
    // NOTE: in supabase mode the service only marks the row read — there is no
    // DELETE endpoint (notificationService.ts:142) — so the row reappears, read,
    // after the next refresh. Left matching the demo behaviour and this
    // function's name rather than diverging the two modes behind one word;
    // the missing route is reported as a followUp.
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (wasUnread && unreadCountKnown) setUnreadCount(prev => Math.max(0, prev - 1));
  }, [notifications, unreadCountKnown]);

  const clearActionError = useCallback(() => setActionError(null), []);

  return {
    notifications,
    read,
    state: listViewState(loading, read),
    unreadCount,
    unreadCountKnown,
    loading,
    actionError,
    clearActionError,
    markRead,
    markAllRead,
    remove,
    refresh,
  };
}
