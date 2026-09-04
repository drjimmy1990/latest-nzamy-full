/**
 * Pure helpers for useDraftCart's supabase-mode sync logic (item 94).
 * Deliberately dependency-free (no "@/" imports, no DOM) so they're testable
 * with plain `node --test` — the hook itself pulls in a .tsx type and
 * browser-only globals (localStorage, fetch) that don't belong in a unit test.
 */

/** True when `seq` is still the most recently issued save/migration sequence
 *  number — i.e. no newer setCart/hydrate call has superseded it. Guards
 *  against an in-flight request's response landing after a later one and
 *  clobbering `saveError` (or the cart) with stale results. */
export function isCurrentSequence(seq: number, latestSeq: number): boolean {
  return seq === latestSeq;
}

/** True exactly when a signed-in hydrate found an empty server cart but a
 *  non-empty local draft — the one-time "push local to the cloud" case that
 *  makes the item's title (ترحيل مسودات وسلات الطلبات إلى السحابة) true
 *  instead of silently abandoning a pre-existing local cart. */
export function shouldMigrateLocalDraft(serverItemCount: number, localItemCount: number): boolean {
  return serverItemCount === 0 && localItemCount > 0;
}

/** Reads the signed-in user id (or null for an anonymous visitor) out of a
 *  GET /api/v1/drafts/cart response body. Anonymous requests return 200 with
 *  `data.user_id: null` (see route.ts) rather than 401, precisely so the
 *  public /laws pages can hydrate without erroring — so hydrate must branch
 *  on this field, not on response.ok, to tell "signed in, empty cart" apart
 *  from "not signed in at all". */
export function extractCartUserId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const data = (json as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const userId = (data as { user_id?: unknown }).user_id;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}
