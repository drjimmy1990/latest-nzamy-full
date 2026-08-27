/**
 * notificationService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode notification service:
 *   - supabase: Supabase Realtime subscription + API routes
 *   - demo: localStorage fallback (existing notificationsStore)
 *
 * ── THE LOCAL FALLBACK IS DEMO-MODE ONLY ────────────────────────────────────
 *
 * Same reasoning as src/lib/services/workflowService.ts, which was fixed first
 * and whose header is the long version. In demo mode `notificationsStore` IS
 * the backend: `getNotificationsLocal()` genuinely reads back what
 * `markAsReadLocal()` wrote, and the `!isSupabaseMode` branches below are
 * correct and untouched.
 *
 * In supabase mode every function here answered a FAILED call by reading or
 * writing that same browser store, and this file is the worst place in the app
 * for that:
 *
 *   - A failed READ returned whatever notifications this browser happened to
 *     have cached — including rows written under a different account on a
 *     shared machine — as though the server had just sent them. When the store
 *     was empty (the normal case in production, since nothing writes to it in
 *     supabase mode) the user was shown «لا إشعارات»: a court date, an
 *     assignment or a payment notice, silently reported as "nothing new".
 *   - A failed WRITE marked the row read in localStorage, so the badge went
 *     down and stayed down while the notification was still unread on the
 *     server — it came back at the next successful load, or never got acted on.
 *
 * So: reads return `ListRead`/`null` and writes THROW. Every write here is
 * awaited by a UI handler that can surface an Arabic error.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";
import {
  getNotifications as getNotificationsLocal,
  getUnreadCount as getUnreadCountLocal,
  markAsRead as markAsReadLocal,
  markAllAsRead as markAllAsReadLocal,
  deleteNotification as deleteNotificationLocal,
  TYPE_ICONS,
  SEVERITY_COLOR,
} from "@/lib/notificationsStore";
import type { Notification, NotifType, NotifSeverity } from "@/lib/notificationsStore";

// Re-export types and constants
export type { Notification, NotifType, NotifSeverity };
export { TYPE_ICONS, SEVERITY_COLOR };

// ─── API types ────────────────────────────────────────────────────────────────

interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  unread_count: number;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getNotifications(
  opts?: { limit?: number; offset?: number },
): Promise<ListRead<Notification>> {
  if (!isSupabaseMode) return listOk(getNotificationsLocal());
  try {
    const response = await apiGet<NotificationListResponse>("/api/v1/notifications", {
      limit: opts?.limit,
      offset: opts?.offset,
    });
    // This route's envelope is `{ notifications, total, unread_count }`, not
    // `{ data }`, so `listFromApi` does not fit it; and it 500s on a Supabase
    // error (route.ts:41) rather than serving an empty 200, so there is no
    // `degraded` flag either. A throw, or a body with no array, is the failure.
    if (!Array.isArray(response?.notifications)) return listFailed<Notification>();
    // `total` is the server's own count, so a bell capped at `limit` can say
    // «يُعرض أحدث ٢٠ من ٤٧» instead of quietly hiding the rest.
    return listOk(response.notifications, response.total);
  } catch (error) {
    console.error("[notificationService] getNotifications failed:", error);
    return listFailed<Notification>();
  }
}

/**
 * The unread badge count, or `null` when it could not be read.
 *
 * `null`, not `0`. A rendered `٠` is a claim — "you are up to date" — and it is
 * the same false statement as a rendered `٤٢`; the caller must show «—» (or no
 * badge at all) rather than a number nobody counted.
 *
 * Returns `number | null` rather than throwing on purpose: `useNotifications`
 * fetches this inside a `Promise.all` with `getNotifications`
 * (src/hooks/useNotifications.ts:45-48), so a rejection here would throw away a
 * perfectly good notification list because the count query failed.
 */
export async function getUnreadCount(): Promise<number | null> {
  if (!isSupabaseMode) return getUnreadCountLocal();
  try {
    const response = await apiGet<NotificationListResponse>("/api/v1/notifications", {
      limit: 1,
      unread_only: true,
    });
    // The route computes `unread_count` with a separate `head: true` count
    // query and does not fail the request if that one comes back empty, so an
    // absent/NaN value means "not counted", not "zero unread".
    return typeof response?.unread_count === "number" && Number.isFinite(response.unread_count)
      ? response.unread_count
      : null;
  } catch (error) {
    console.error("[notificationService] getUnreadCount failed:", error);
    return null;
  }
}

export async function markAsRead(id: string): Promise<void> {
  if (!isSupabaseMode) { markAsReadLocal(id); return; }
  // Throws. The old `catch { markAsReadLocal(id) }` dimmed the row in this
  // browser only; the server still had it unread and the badge disagreed with
  // itself on the next load.
  await apiMutate(`/api/v1/notifications`, "PATCH", { ids: [id] });
}

export async function markAllAsRead(): Promise<void> {
  if (!isSupabaseMode) { markAllAsReadLocal(); return; }
  await apiMutate(`/api/v1/notifications`, "PATCH", { mark_all: true });
}

/**
 * NOT a delete in supabase mode — it marks the notification read, because
 * /api/v1/notifications supports PATCH only and there is no DELETE endpoint to
 * call. The name is inherited from the demo store, where it really does delete.
 *
 * Left as-is rather than made to throw: mark-as-read is a real action that
 * really is performed, and the visible consequence of the mismatch (the row
 * reappears, read, after a refresh instead of staying gone) belongs to the
 * caller — src/hooks/useNotifications.ts:110 drops it from local state. Fixing
 * it properly needs a DELETE route, which is outside this file. Reported as a
 * followUp rather than papered over here.
 */
export async function deleteNotification(id: string): Promise<void> {
  if (!isSupabaseMode) { deleteNotificationLocal(id); return; }
  await apiMutate(`/api/v1/notifications`, "PATCH", { ids: [id] });
}
