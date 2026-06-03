/**
 * notificationService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode notification service:
 *   - supabase: Supabase Realtime subscription + API routes
 *   - demo: localStorage fallback (existing notificationsStore)
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
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

export async function getNotifications(opts?: { limit?: number; offset?: number }): Promise<Notification[]> {
  if (!isSupabaseMode) return getNotificationsLocal();
  try {
    const response = await apiGet<NotificationListResponse>("/api/v1/notifications", {
      limit: opts?.limit,
      offset: opts?.offset,
    });
    return response.notifications;
  } catch {
    return getNotificationsLocal();
  }
}

export async function getUnreadCount(): Promise<number> {
  if (!isSupabaseMode) return getUnreadCountLocal();
  try {
    const response = await apiGet<NotificationListResponse>("/api/v1/notifications", {
      limit: 1,
      unread_only: true,
    });
    return response.unread_count;
  } catch {
    return getUnreadCountLocal();
  }
}

export async function markAsRead(id: string): Promise<void> {
  if (!isSupabaseMode) { markAsReadLocal(id); return; }
  try {
    await apiMutate(`/api/v1/notifications`, "PATCH", { ids: [id] });
  } catch {
    markAsReadLocal(id);
  }
}

export async function markAllAsRead(): Promise<void> {
  if (!isSupabaseMode) { markAllAsReadLocal(); return; }
  try {
    await apiMutate(`/api/v1/notifications`, "PATCH", { mark_all: true });
  } catch {
    markAllAsReadLocal();
  }
}

export async function deleteNotification(id: string): Promise<void> {
  if (!isSupabaseMode) { deleteNotificationLocal(id); return; }
  try {
    // Note: The current API only supports mark-as-read.
    // For delete, we'd need a DELETE endpoint. For now, mark as read.
    await apiMutate(`/api/v1/notifications`, "PATCH", { ids: [id] });
  } catch {
    deleteNotificationLocal(id);
  }
}
