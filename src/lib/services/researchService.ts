/**
 * researchService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode research sessions & items service.
 * Wraps draftInboxStore for demo mode + API routes for supabase mode.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import {
  // Session API
  createSession as createSessionLocal,
  getActiveSessions as getActiveSessionsLocal,
  getArchivedSessions as getArchivedSessionsLocal,
  renameSession as renameSessionLocal,
  archiveSession as archiveSessionLocal,
  restoreSession as restoreSessionLocal,
  deleteSession as deleteSessionLocal,
  // Item API
  addToDesktop as addToDesktopLocal,
  addToSession as addToSessionLocal,
  addToInbox as addToInboxLocal,
  getDesktopItems as getDesktopItemsLocal,
  getSessionItems as getSessionItemsLocal,
  getInbox as getInboxLocal,
  getUnused as getUnusedLocal,
  getUnusedCount as getUnusedCountLocal,
  getDesktopUnusedCount as getDesktopUnusedCountLocal,
  markUsed as markUsedLocal,
  removeFromInbox as removeFromInboxLocal,
  updateItem as updateItemLocal,
  clearBySource as clearBySourceLocal,
  clearDesktop as clearDesktopLocal,
  clearAll as clearAllLocal,
  mergeItems as mergeItemsLocal,
  // Constants
  SOURCE_LABELS,
  SOURCE_COLORS,
  SOURCE_ICONS,
} from "@/lib/draftInboxStore";
import type {
  CollectorSession,
  InboxItem,
  InboxSource,
  InboxItemType,
  CollectorSpace,
} from "@/lib/draftInboxStore";

// Re-export types and constants
export type { CollectorSession, InboxItem, InboxSource, InboxItemType, CollectorSpace };
export { SOURCE_LABELS, SOURCE_COLORS, SOURCE_ICONS };

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(name?: string): Promise<CollectorSession> {
  if (!isSupabaseMode) return createSessionLocal(name);
  try {
    return await apiMutate<CollectorSession>("/api/v1/research/sessions", "POST", { name });
  } catch {
    return createSessionLocal(name);
  }
}

export async function getActiveSessions(): Promise<CollectorSession[]> {
  if (!isSupabaseMode) return getActiveSessionsLocal();
  try {
    const response = await apiGet<{ data: CollectorSession[] }>("/api/v1/research/sessions", { archived: false });
    return response.data;
  } catch {
    return getActiveSessionsLocal();
  }
}

export async function getArchivedSessions(): Promise<CollectorSession[]> {
  if (!isSupabaseMode) return getArchivedSessionsLocal();
  try {
    const response = await apiGet<{ data: CollectorSession[] }>("/api/v1/research/sessions", { archived: true });
    return response.data;
  } catch {
    return getArchivedSessionsLocal();
  }
}

export async function renameSession(sessionId: string, name: string): Promise<void> {
  if (!isSupabaseMode) { renameSessionLocal(sessionId, name); return; }
  try {
    await apiMutate(`/api/v1/research/sessions/${sessionId}`, "PATCH", { name });
  } catch {
    renameSessionLocal(sessionId, name);
  }
}

export async function archiveSession(sessionId: string): Promise<void> {
  if (!isSupabaseMode) { archiveSessionLocal(sessionId); return; }
  try {
    await apiMutate(`/api/v1/research/sessions/${sessionId}`, "PATCH", { is_archived: true });
  } catch {
    archiveSessionLocal(sessionId);
  }
}

export async function restoreSession(sessionId: string): Promise<void> {
  if (!isSupabaseMode) { restoreSessionLocal(sessionId); return; }
  try {
    await apiMutate(`/api/v1/research/sessions/${sessionId}`, "PATCH", { is_archived: false });
  } catch {
    restoreSessionLocal(sessionId);
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!isSupabaseMode) { deleteSessionLocal(sessionId); return; }
  try {
    await apiMutate(`/api/v1/research/sessions/${sessionId}`, "DELETE");
  } catch {
    deleteSessionLocal(sessionId);
  }
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function addToDesktop(
  source: InboxSource, type: InboxItemType, title: string, content: string,
): Promise<InboxItem> {
  if (!isSupabaseMode) return addToDesktopLocal(source, type, title, content);
  try {
    return await apiMutate<InboxItem>("/api/v1/research/desktop", "POST", {
      source, item_type: type, title, content,
    });
  } catch {
    return addToDesktopLocal(source, type, title, content);
  }
}

export async function addToSession(
  sessionId: string, source: InboxSource, type: InboxItemType, title: string, content: string,
): Promise<InboxItem> {
  if (!isSupabaseMode) return addToSessionLocal(sessionId, source, type, title, content);
  try {
    return await apiMutate<InboxItem>(`/api/v1/research/sessions/${sessionId}/items`, "POST", {
      source, item_type: type, title, content,
    });
  } catch {
    return addToSessionLocal(sessionId, source, type, title, content);
  }
}

export async function addToInbox(
  source: InboxSource, type: InboxItemType, title: string, content: string,
  opts?: { sessionId?: string },
): Promise<InboxItem> {
  if (!isSupabaseMode) return addToInboxLocal(source, type, title, content, opts);
  if (opts?.sessionId) {
    return addToSession(opts.sessionId, source, type, title, content);
  }
  return addToDesktop(source, type, title, content);
}

export async function getDesktopItems(): Promise<InboxItem[]> {
  if (!isSupabaseMode) return getDesktopItemsLocal();
  try {
    const response = await apiGet<{ data: InboxItem[] }>("/api/v1/research/desktop");
    return response.data;
  } catch {
    return getDesktopItemsLocal();
  }
}

export async function getSessionItems(sessionId: string): Promise<InboxItem[]> {
  if (!isSupabaseMode) return getSessionItemsLocal(sessionId);
  try {
    const response = await apiGet<{ data: InboxItem[] }>(
      `/api/v1/research/sessions/${sessionId}/items`,
    );
    return response.data;
  } catch {
    return getSessionItemsLocal(sessionId);
  }
}

// Legacy compat wrappers (synchronous in demo, async in supabase)
export function getInbox(): InboxItem[] { return getInboxLocal(); }
export function getUnused(): InboxItem[] { return getUnusedLocal(); }
export function getUnusedCount(): number { return getUnusedCountLocal(); }
export function getDesktopUnusedCount(): number { return getDesktopUnusedCountLocal(); }

export async function markUsed(ids: string[]): Promise<void> {
  if (!isSupabaseMode) { markUsedLocal(ids); return; }
  // In supabase mode, mark via API — but we'd need an endpoint for this.
  // For now, fall back to local.
  markUsedLocal(ids);
}

export function removeFromInbox(id: string): void { removeFromInboxLocal(id); }
export function updateItem(id: string, title: string, content: string): void { updateItemLocal(id, title, content); }
export function clearBySource(source: InboxSource): void { clearBySourceLocal(source); }
export function clearDesktop(): void { clearDesktopLocal(); }
export function clearAll(): void { clearAllLocal(); }
export function mergeItems(
  ids: string[], mergedTitle: string,
  targetSpace: CollectorSpace = "desktop", targetSession?: string,
): InboxItem {
  return mergeItemsLocal(ids, mergedTitle, targetSpace, targetSession);
}
