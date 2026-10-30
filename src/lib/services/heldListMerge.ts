/**
 * heldListMerge.ts — fold a server-confirmed write into a list the screen
 * already holds, or say that the list must be read again.
 *
 * CODE-F42 (owner package 2026-10-30), lawyer profile → «الخدمات»: when the
 * first read failed, the list held a failed read. Saving a service then ran
 * `if (!prev || !prev.ok) return prev` — the write succeeded on the server,
 * but the screen kept showing «تعذّرت القراءة» and never recovered, because
 * nothing read the list again. A successful write is exactly when a re-read
 * is worth trying, so these return `refetch: true` in that case instead of
 * pretending the held list can be patched.
 *
 * Pure: type-only import, so `node --test` loads it directly.
 */

import type { ListRead } from "./listRead.ts";

export type HeldMerge<T> = { next: ListRead<T> | null; refetch: boolean };

/** A created or edited row the server returned. */
export function mergeSavedRow<T extends { id: string }>(prev: ListRead<T> | null, saved: T): HeldMerge<T> {
  if (!prev || !prev.ok) return { next: prev, refetch: true };
  const exists = prev.items.some((s) => s.id === saved.id);
  return {
    next: {
      ...prev,
      items: exists ? prev.items.map((s) => (s.id === saved.id ? saved : s)) : [...prev.items, saved],
      total: exists ? prev.total : (prev.total ?? prev.items.length) + 1,
    },
    refetch: false,
  };
}

/** A row the server confirmed deleted. */
export function mergeDeletedRow<T extends { id: string }>(prev: ListRead<T> | null, id: string): HeldMerge<T> {
  if (!prev || !prev.ok) return { next: prev, refetch: true };
  return {
    next: {
      ...prev,
      items: prev.items.filter((s) => s.id !== id),
      total: prev.total === null ? null : Math.max(0, prev.total - 1),
    },
    refetch: false,
  };
}
