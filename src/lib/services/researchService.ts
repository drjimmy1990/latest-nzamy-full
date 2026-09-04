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
 * ── PHASE 6: markUsed / updateItem / removeFromInbox / getUnused /
 *    getUnusedCount / getDesktopUnusedCount NOW HIT THE SERVER ─────────────
 * `research_items` grew a real `used`/`title`/`updated_at` (migration
 * 20260906_phase6_settings_out_of_browser.sql) and three routes to act on
 * them — `PATCH`/`DELETE /api/v1/research/items/[id]` and
 * `GET /api/v1/research/items?used=false|true` (all sessions, desktop
 * included; `GET /api/v1/research/desktop` grew the same `?used=` filter for
 * `getDesktopUnusedCount`). In supabase mode the six below now read/write
 * those instead of `draftInboxStore` — demo mode is unchanged.
 *
 * `markUsed`/`updateItem`/`removeFromInbox` are writes, but NONE of the three
 * is allowed to THROW into an uncaught place — the task's own instruction was
 * "keep signatures unchanged", and all three are called un-awaited with no
 * `.catch` from plain synchronous handlers that toast an unconditional
 * success right after (DesktopPanel.tsx `handleDelete`/`handleDeleteSel`/its
 * mark-used handler; SessionsPanel.tsx `handleDelete`/`handleDeleteSel`/
 * `handleSaveItemEdit`/its mark-used handler; StepLaws.tsx's mark-used call).
 * A version that made any of the three throw on a real network failure would
 * turn that failure into an unhandled promise rejection while the toast still
 * claims success — worse than the localStorage version they replace, which
 * could not fail at all. So every failure below is caught and logged INSIDE
 * this file, never left for a caller that cannot catch it:
 *
 *   - `updateItem`/`removeFromInbox` were plain synchronous `void` functions
 *     before this pass (`updateItemLocal(...)`/`removeFromInboxLocal(id)`,
 *     nothing returned). They stay genuinely synchronous `void` — an earlier
 *     version of this pass made them `async (): Promise<void>`, which IS the
 *     signature change the task explicitly forbade, not a cosmetic one, given
 *     the call sites above. The DELETE/PATCH still fires in supabase mode,
 *     but fire-and-forget, with its own `.catch` logging the failure.
 *
 *   - `markUsed` was ALREADY `async (): Promise<void>` before this pass (it
 *     just called `markUsedLocal` synchronously inside, which cannot fail),
 *     so keeping that signature while routing to a real `apiMutate` is not
 *     itself a signature change. But letting the new call throw would still
 *     be the exact failure mode above, just via a promise instead of a plain
 *     `void` return — so each per-id PATCH carries its own `.catch` too, one
 *     failed mark does not abort the others or surface as a rejection.
 *
 * The honest remainder: none of the three call sites' toasts are load-bearing
 * — `removeFromInbox(id); reload();` fires the DELETE and the re-fetch
 * concurrently, so a slow DELETE can lose that race and the "deleted" item
 * reappears in the list the success toast just praised, until the next
 * reload. That race predates this pass (the un-awaited call sites are not
 * this file's to change) and catching-instead-of-throwing does not create
 * it — but catching does mean there is now no path left, sync or async, for
 * these three to ever surface a failure to the user. The durable fix is
 * `await` + try/catch in those handlers (SessionsPanel.tsx's own
 * `handleRename` already shows the pattern), owned by the workflow that owns
 * those components, not this file.
 *
 * `getUnused`/`getUnusedCount`/`getDesktopUnusedCount` DID change signature —
 * sync (`InboxItem[]`/`number`, a synchronous localStorage read) to
 * `async (): Promise<InboxItem[]>`/`Promise<number>`. Unlike the three writes
 * above, this is unavoidable: a value read from the server cannot be returned
 * synchronously, so "use the server" for a read has no shape that preserves a
 * sync signature the way fire-and-forget preserves one for a write. Flagged
 * rather than silently carried over: as of this pass neither `getUnused` nor
 * `getUnusedCount` has any caller in the codebase, and `getDesktopUnusedCount`
 * lost its one caller earlier (`/ai/collector/page.tsx` now reads
 * `getDesktopItems()` for the desktop badge instead — see that file's own
 * comment on why), so today the wider type is a no-op change; it becomes load
 * -bearing only if/when a screen starts calling one of the three, at which
 * point `await` is required where none was before. `getUnused`/`getUnusedCount`
 * also keep their non-`ListRead` shape (a bare array / a bare number — no
 * consumer contract to preserve either way), so a failed read degrades to
 * `[]`/`0` rather than surfacing as `unreadable` the way `getDesktopItems`/
 * `getSessionItems` do — logged, not silent, but a screen built on top of
 * either function later could not tell "empty" from "failed" without a
 * further signature change this task did not authorize.
 *
 * ── STILL LOCAL-ONLY IN BOTH MODES ──────────────────────────────────────────
 * `getInbox`, `clearBySource`, `clearDesktop`, `clearAll` and `mergeItems`
 * still read/write `draftInboxStore` unconditionally — out of this pass's
 * scope, and each for its own reason:
 *   - `getInbox` (all items, unfiltered) has a server equivalent now
 *     (`GET /api/v1/research/items` with no `used` param), but converting it
 *     was not asked for and it has no caller today either.
 *   - `clearBySource`/`clearDesktop`/`clearAll` have no server operation to
 *     call — there is no "delete by source" or "delete all of mine" route,
 *     only per-item DELETE and the desktop's own bulk DELETE.
 *   - `mergeItems` invents a new merged item client-side from several old
 *     ones; the server has no merge operation and creating+deleting rows to
 *     fake one is a bigger contract than this task covers.
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

// ── Local-only in BOTH modes. See "STILL LOCAL-ONLY" in the header ───────────
// Not "legacy compat wrappers that are synchronous in demo": localStorage in
// supabase mode too, because no endpoint exists behind them (getInbox) or the
// operation itself has no server counterpart (the other four).
export function getInbox(): InboxItem[] { return getInboxLocal(); }

// ── PHASE 6: server-backed in supabase mode. See the header for the routes. ──

/** The supabase half of getUnused/getUnusedCount — one GET, two readings. */
async function fetchUnusedFromServer(): Promise<{ items: InboxItem[]; total: number } | null> {
  try {
    const response = await apiGet<{ data: InboxItem[]; total?: number }>(
      "/api/v1/research/items",
      { used: false },
    );
    if (!Array.isArray(response?.data)) return null;
    return { items: response.data, total: typeof response.total === "number" ? response.total : response.data.length };
  } catch (error) {
    console.error("[researchService] fetchUnusedFromServer failed:", error);
    return null;
  }
}

/**
 * Bare array, not `ListRead<InboxItem>` — see the header on why this pass
 * kept the pre-existing signature. A failed read degrades to `[]`, logged.
 */
export async function getUnused(): Promise<InboxItem[]> {
  if (!isSupabaseMode) return getUnusedLocal();
  const result = await fetchUnusedFromServer();
  return result?.items ?? [];
}

/** Bare number, not `ListRead`. A failed read degrades to `0`, logged. */
export async function getUnusedCount(): Promise<number> {
  if (!isSupabaseMode) return getUnusedCountLocal();
  const result = await fetchUnusedFromServer();
  return result?.total ?? 0;
}

/** Desktop-only unused count — the desktop route's own `?used=` filter. */
export async function getDesktopUnusedCount(): Promise<number> {
  if (!isSupabaseMode) return getDesktopUnusedCountLocal();
  try {
    const response = await apiGet<{ data: InboxItem[]; total?: number }>(
      "/api/v1/research/desktop",
      { used: false, limit: 1 },
    );
    return typeof response?.total === "number" ? response.total : 0;
  } catch (error) {
    console.error("[researchService] getDesktopUnusedCount failed:", error);
    return 0;
  }
}

export async function markUsed(ids: string[]): Promise<void> {
  if (!isSupabaseMode) { markUsedLocal(ids); return; }
  // Signature was already `Promise<void>` pre-phase-6 (see header), so no
  // constraint stops this from throwing — but its three call sites
  // (DesktopPanel.tsx, SessionsPanel.tsx, StepLaws.tsx) call it un-awaited
  // with no `.catch`, same shape as removeFromInbox/updateItem above, and
  // before this pass it never threw at all (it just wrote to localStorage).
  // Letting a real network failure become an unhandled rejection there would
  // be the exact defect this pass fixed for the other two writes, just left
  // in for this one. Caught and logged per id instead — one failed PATCH
  // does not abort the others.
  await Promise.all(
    ids.map((id) =>
      apiMutate(`/api/v1/research/items/${id}`, "PATCH", { used: true }).catch((error) => {
        console.error("[researchService] markUsed failed:", id, error);
      }),
    ),
  );
}

/**
 * Signature stays synchronous `void` — see the header on why this one (unlike
 * `markUsed`) cannot become `async` without turning every un-awaited,
 * uncaught call site into a silent-success/unhandled-rejection pair. In
 * supabase mode the DELETE is fired and forgotten; its own failure is
 * caught and logged here since nothing upstream will catch it.
 */
export function removeFromInbox(id: string): void {
  if (!isSupabaseMode) { removeFromInboxLocal(id); return; }
  void apiMutate(`/api/v1/research/items/${id}`, "DELETE").catch((error) => {
    console.error("[researchService] removeFromInbox failed:", error);
  });
}

/** Same reasoning as `removeFromInbox` above. */
export function updateItem(id: string, title: string, content: string): void {
  if (!isSupabaseMode) { updateItemLocal(id, title, content); return; }
  void apiMutate(`/api/v1/research/items/${id}`, "PATCH", { title, content }).catch((error) => {
    console.error("[researchService] updateItem failed:", error);
  });
}

export function clearBySource(source: InboxSource): void { clearBySourceLocal(source); }
export function clearDesktop(): void { clearDesktopLocal(); }
export function clearAll(): void { clearAllLocal(); }
export function mergeItems(
  ids: string[], mergedTitle: string,
  targetSpace: CollectorSpace = "desktop", targetSession?: string,
): InboxItem {
  return mergeItemsLocal(ids, mergedTitle, targetSpace, targetSession);
}
