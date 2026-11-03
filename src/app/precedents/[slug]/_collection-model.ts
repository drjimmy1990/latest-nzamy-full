/**
 * _collection-model.ts — turn /api/library/precedents/[slug] windows into the
 * list the collection page renders.
 *
 * The API serves a collection in windows (it holds up to 2,323 principles,
 * above PostgREST's 1000-row cap). The page appends windows as the reader
 * scrolls, and loads the rest when they search. These helpers keep that safe:
 *   - normalizePrinciple() never lets a missing array reach `.slice`/`.join`
 *     (classification_keywords was absent from the API and crashed the index);
 *   - mergePrinciples() de-duplicates by id, so a retried or overlapping window
 *     cannot render the same principle twice;
 *   - nextOffset()/hasMorePrinciples() advance by what is actually held.
 *
 * q390-ب: the reader may open at a principle deep in the collection
 * (`?target=`), so what it holds is a RUN — a contiguous slice that starts at
 * `start` (a window offset), not necessarily at 0. The run helpers grow it
 * forward (appendRun/runNextOffset) and backward (prependRun/runPrevWindow).
 *
 * Type-only import, so node:test can load this file without the `@/` alias.
 */
import type { JudicialPrincipleItem, PrincipleDetail } from "@/app/laws/data";

export type CollectionPrinciple = JudicialPrincipleItem & {
  locked?: boolean;
  lockedMessage?: string;
};

const str = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function normalizePrinciple(raw: Record<string, unknown>): CollectionPrinciple {
  const paragraphs = Array.isArray(raw.paragraphs)
    ? (raw.paragraphs as Record<string, unknown>[]).map((pg) => ({
        letter: str(pg?.letter),
        text: str(pg?.text),
        keywords: strArray(pg?.keywords),
      }))
    : [];
  const details = raw.details && typeof raw.details === "object"
    ? (raw.details as PrincipleDetail)
    : ({} as PrincipleDetail);
  return {
    id: str(raw.id),
    number: str(raw.number),
    issuing_body: str(raw.issuing_body),
    session_date: str(raw.session_date),
    decision_number: str(raw.decision_number),
    reference: str(raw.reference),
    classification_keywords: strArray(raw.classification_keywords),
    text: str(raw.text),
    paragraphs,
    details,
    locked: raw.locked === true,
    lockedMessage: typeof raw.lockedMessage === "string" ? raw.lockedMessage : undefined,
  };
}

/** Append `incoming` to `existing`, skipping ids already held (order kept). */
export function mergePrinciples<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((p) => p.id));
  const added = incoming.filter((p) => {
    if (!p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  return added.length === 0 ? existing : [...existing, ...added];
}

/** The offset of the next window: the number of principles already held. */
export function nextOffset(held: { length: number }): number {
  return held.length;
}

/**
 * Whether another window exists. `total` is the API's exact count; when it is
 * unknown, the last window's `hasMore` flag decides.
 */
export function hasMorePrinciples(heldCount: number, total: number | null, lastHasMore: boolean): boolean {
  if (typeof total === "number" && Number.isFinite(total)) return heldCount < total;
  return lastHasMore;
}

/** A contiguous slice of the collection: `items[i]` is at global position `start + i`. */
export interface CollectionRun<T extends { id: string } = CollectionPrinciple> {
  start: number;
  items: T[];
}

/** The offset of the window after the run: `start + items.length`. */
export function runNextOffset(run: CollectionRun<{ id: string }>): number {
  return run.start + run.items.length;
}

/**
 * The window just before the run, never below 0: `offset = max(0, start - limit)`
 * and `limit = start - offset`, so it ends exactly where the run begins. null at 0.
 * A limit below 1 (or not a number) counts as 1: never an empty or negative window.
 */
export function runPrevWindow(run: CollectionRun<{ id: string }>, limit: number): { offset: number; limit: number } | null {
  if (run.start <= 0) return null;
  const size = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1;
  const offset = Math.max(0, run.start - size);
  return { offset, limit: run.start - offset };
}

/** Append a window after the run; `start` is kept, ids already held are skipped. */
export function appendRun<T extends { id: string }>(run: CollectionRun<T>, incoming: T[]): CollectionRun<T> {
  const items = mergePrinciples(run.items, incoming);
  return items === run.items ? run : { start: run.start, items };
}

/**
 * Prepend the window that starts at `offset`; `start` becomes `offset`. An id
 * the run already holds keeps its existing copy (one copy of each principle).
 */
export function prependRun<T extends { id: string }>(run: CollectionRun<T>, incoming: T[], offset: number): CollectionRun<T> {
  const held = new Set(run.items.map((p) => p.id));
  const seen = new Set<string>();
  const added = incoming.filter((p) => {
    if (!p.id || held.has(p.id) || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  return { start: Math.max(0, offset), items: [...added, ...run.items] };
}

/** Whether a window exists after the run: the exact total decides, else the last `hasMore`. */
export function runHasMore(run: CollectionRun<{ id: string }>, total: number | null, lastHasMore: boolean): boolean {
  return hasMorePrinciples(runNextOffset(run), total, lastHasMore);
}
