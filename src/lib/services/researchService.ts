/**
 * researchService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode research sessions & items service.
 * Wraps draftInboxStore for demo mode + API routes for supabase mode.
 *
 * ── THE LOCAL FALLBACK IS DEMO-MODE ONLY ────────────────────────────────────
 *
 * Same reasoning as src/lib/services/workflowService.ts — read its header for
 * the long version. In demo mode `draftInboxStore` IS the backend, so every
 * `!isSupabaseMode` branch below is correct and untouched. In supabase mode the
 * `catch { …Local(…) }` fallbacks were two different lies:
 *
 *   - a failed READ returned this browser's own saved clippings as though they
 *     were the account's, and an empty store rendered as "you have collected
 *     nothing";
 *   - a failed WRITE saved to localStorage and returned a fully-formed item, so
 *     the collector showed the clipping filed while nothing reached the server.
 *     It then vanished at the next successful reload, which is worse than an
 *     error — the user believes the tool loses their work at random.
 *
 * Reads now report failure; writes throw.
 *
 * ── AND A PLAIN UNWRAPPING BUG ──────────────────────────────────────────────
 * The three POST routes answer `{ data: … }` (sessions/route.ts:79,
 * desktop/route.ts:113, sessions/[id]/items/route.ts:110) but were typed as the
 * bare row, so `createSession(...).id` was `undefined` — the two callers that
 * immediately use it (SessionsPanel.tsx:85, AttachmentSqueezer.tsx:175) were
 * exporting into `undefined`.
 *
 * ── WHAT IS STILL LOCAL-ONLY IN BOTH MODES, AND KNOWN ───────────────────────
 * `getInbox`, `getUnused`, `getUnusedCount`, `getDesktopUnusedCount`,
 * `markUsed`, `removeFromInbox`, `updateItem`, `clearBySource`, `clearDesktop`,
 * `clearAll` and `mergeItems` read and write `draftInboxStore` UNCONDITIONALLY
 * — there is no endpoint behind any of them. They are not converted here: with
 * no server-side concept of "used" or "merged", making them throw would replace
 * a working local behaviour with an error the UI has no remedy for, and the
 * screens that would need the new state are not this file's to change. The
 * visible consequence is reported as a followUp: /ai/collector/page.tsx renders
 * `getDesktopUnusedCount()` (localStorage) beside `getDesktopItems()` (server),
 * so in supabase mode the badge and the list are counting different things.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";
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
  // THROWS, and unwraps `{ data }` — see the header.
  const res = await apiMutate<{ data: CollectorSession }>(
    "/api/v1/research/sessions",
    "POST",
    { name },
  );
  if (!res?.data) throw new Error("لم يصل تأكيد إنشاء الجلسة من الخادم");
  return res.data;
}

export async function getActiveSessions(): Promise<ListRead<CollectorSession>> {
  if (!isSupabaseMode) return listOk(getActiveSessionsLocal());
  return readSessions(false);
}

export async function getArchivedSessions(): Promise<ListRead<CollectorSession>> {
  if (!isSupabaseMode) return listOk(getArchivedSessionsLocal());
  return readSessions(true);
}

/** The supabase half of the two session readers — one query, one flag. */
async function readSessions(archived: boolean): Promise<ListRead<CollectorSession>> {
  try {
    const response = await apiGet<{ data: CollectorSession[]; total?: number }>(
      "/api/v1/research/sessions",
      { archived },
    );
    // The route 500s on a Supabase error (sessions/route.ts:43) — no `degraded`
    // envelope to read, so a throw or a missing array is the failure.
    if (!Array.isArray(response?.data)) return listFailed<CollectorSession>();
    return listOk(response.data, response.total);
  } catch (error) {
    console.error("[researchService] readSessions failed:", error);
    return listFailed<CollectorSession>();
  }
}

export async function renameSession(sessionId: string, name: string): Promise<void> {
  if (!isSupabaseMode) { renameSessionLocal(sessionId, name); return; }
  // These four THROW. The local fallback renamed/archived/deleted the session in
  // this browser only, so the screen showed the change and the server never saw
  // it — and a "deleted" session reappeared at the next reload.
  await apiMutate(`/api/v1/research/sessions/${sessionId}`, "PATCH", { name });
}

export async function archiveSession(sessionId: string): Promise<void> {
  if (!isSupabaseMode) { archiveSessionLocal(sessionId); return; }
  await apiMutate(`/api/v1/research/sessions/${sessionId}`, "PATCH", { is_archived: true });
}

export async function restoreSession(sessionId: string): Promise<void> {
  if (!isSupabaseMode) { restoreSessionLocal(sessionId); return; }
  await apiMutate(`/api/v1/research/sessions/${sessionId}`, "PATCH", { is_archived: false });
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!isSupabaseMode) { deleteSessionLocal(sessionId); return; }
  await apiMutate(`/api/v1/research/sessions/${sessionId}`, "DELETE");
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function addToDesktop(
  source: InboxSource, type: InboxItemType, title: string, content: string,
): Promise<InboxItem> {
  if (!isSupabaseMode) return addToDesktopLocal(source, type, title, content);
  // THROWS, and unwraps `{ data }` — see the header.
  const res = await apiMutate<{ data: InboxItem }>("/api/v1/research/desktop", "POST", {
    source, item_type: type, title, content,
  });
  if (!res?.data) throw new Error("لم يصل تأكيد حفظ العنصر من الخادم");
  return res.data;
}

export async function addToSession(
  sessionId: string, source: InboxSource, type: InboxItemType, title: string, content: string,
): Promise<InboxItem> {
  if (!isSupabaseMode) return addToSessionLocal(sessionId, source, type, title, content);
  const res = await apiMutate<{ data: InboxItem }>(
    `/api/v1/research/sessions/${sessionId}/items`,
    "POST",
    { source, item_type: type, title, content },
  );
  if (!res?.data) throw new Error("لم يصل تأكيد حفظ العنصر من الخادم");
  return res.data;
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

export async function getDesktopItems(): Promise<ListRead<InboxItem>> {
  if (!isSupabaseMode) return listOk(getDesktopItemsLocal());
  try {
    const response = await apiGet<{ data: InboxItem[]; total?: number }>("/api/v1/research/desktop");
    if (!Array.isArray(response?.data)) return listFailed<InboxItem>();
    return listOk(response.data, response.total);
  } catch (error) {
    console.error("[researchService] getDesktopItems failed:", error);
    return listFailed<InboxItem>();
  }
}

export async function getSessionItems(sessionId: string): Promise<ListRead<InboxItem>> {
  if (!isSupabaseMode) return listOk(getSessionItemsLocal(sessionId));
  try {
    const response = await apiGet<{ data: InboxItem[] }>(
      `/api/v1/research/sessions/${sessionId}/items`,
    );
    // This route sends no `total` (items/route.ts:49 returns `{ data }` alone),
    // so none is claimed here.
    if (!Array.isArray(response?.data)) return listFailed<InboxItem>();
    return listOk(response.data);
  } catch (error) {
    console.error("[researchService] getSessionItems failed:", error);
    return listFailed<InboxItem>();
  }
}

// ── Local-only in BOTH modes. See "WHAT IS STILL LOCAL-ONLY" in the header ───
// These are not "legacy compat wrappers that are synchronous in demo": they are
// localStorage in supabase mode too, because no endpoint exists behind them.
// Left working rather than made to throw; the mismatch is a reported followUp.
export function getInbox(): InboxItem[] { return getInboxLocal(); }
export function getUnused(): InboxItem[] { return getUnusedLocal(); }
export function getUnusedCount(): number { return getUnusedCountLocal(); }
export function getDesktopUnusedCount(): number { return getDesktopUnusedCountLocal(); }

export async function markUsed(ids: string[]): Promise<void> {
  // Local in both modes: there is no server-side "used" flag and no endpoint to
  // set one, so this marks the items in this browser only and they come back
  // unmarked on another device. Deliberately NOT made to throw — the mark is a
  // real, working local behaviour and an error here would have no remedy the UI
  // could offer. Kept honest by being written down rather than by pretending.
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
