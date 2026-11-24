/**
 * _cache.ts — a small per-process memory of the reader's links answers (batch
 * l14, owner file 07 §14: «أحيانًا بطيئة» — measured 24 Nov: 0.6–2.9 s to the
 * first byte for a large law, against a 0.45–0.6 s network floor).
 *
 * What is kept is the answer BEFORE the per-viewer step (the decree-title mask,
 * Q101): the same for every viewer, never article text (the whitelists in
 * _shape.ts). The route still runs its public guard (libraryGate) before it
 * looks here, masks on every request, and never stores an error or an
 * «available: false» answer. Entries live LINKS_CACHE_TTL_MS: a rebuilt graph,
 * or a changed article status, reaches the reader within that time.
 *
 * Bounded by entry count (the oldest goes first); a hit moves an entry to the
 * end. Pure: `node --test` runs _cache.test.ts.
 */

export const LINKS_CACHE_TTL_MS = 10 * 60 * 1000;
/** Whole-law answers kept (one large law's is up to ~0.5 MB of JSON). */
export const BULK_CACHE_ENTRIES = 24;
/** One-article answers kept (a few KB each). */
export const ARTICLE_CACHE_ENTRIES = 400;

export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  clear(): void;
  readonly size: number;
}

export function createTtlCache<V>(maxEntries: number, ttlMs: number, now: () => number = Date.now): TtlCache<V> {
  const map = new Map<string, { at: number; value: V }>();
  const max = Math.max(1, Math.floor(maxEntries));
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now() - hit.at >= ttlMs) {
        map.delete(key);
        return undefined;
      }
      map.delete(key);
      map.set(key, hit);
      return hit.value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, { at: now(), value });
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    clear() {
      map.clear();
    },
    get size() {
      return map.size;
    },
  };
}

/** The key of one answer: the route kind, the law, the article (if any) and the link types asked (the similar switch). */
export function linksCacheKey(kind: "bulk" | "article", lawSlug: string, articleId: string | null, types: readonly string[]): string {
  return [kind, lawSlug, articleId ?? "", [...types].sort().join(",")].join("|");
}

/** A `Server-Timing` header value: `name;dur=ms` per step, and the cache's answer as a description. */
export function serverTiming(steps: ReadonlyArray<[string, number]>, cache: "hit" | "miss"): string {
  const safe = (n: string) => n.replace(/[^a-z0-9_-]/gi, "");
  return [
    ...steps.map(([name, ms]) => `${safe(name)};dur=${Math.max(0, Math.round(ms * 10) / 10)}`),
    `cache;desc="${cache}"`,
  ].join(", ");
}
