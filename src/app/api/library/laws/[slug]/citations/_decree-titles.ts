/**
 * _decree-titles.ts — server side of the citations answers (Q101). Kept out of
 * _shape.ts on purpose: the reader's client box (_ref-box.tsx) imports _shape,
 * and decreeDisplay pulls the taxonomy and metadata modules with it.
 * Pure: `node --test` runs it through _shape.test.ts.
 */
import { decreeTitleForViewer } from "../../../../../../lib/library/decreeDisplay.ts";

/**
 * Owner Q101 (batch l12, lib-a's rule on lib-links' answers): a decree's
 * title carries its number and date, which are a subscriber's. Every item
 * that names a decree (docKind "order": a cited decree, an amending
 * instrument, a law-level link) is renamed with decreeTitleForViewer for
 * anyone else — the public name the decree page already uses. Deep: the
 * bulk answer's items, the per-article sections and the '@law' box alike.
 * The answer is then tier-shaped (the route sends it private, no-store).
 */
export function maskDecreeTitlesForViewer<T>(value: T, isSubscriber: boolean): T {
  if (isSubscriber) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x);
    if (out.docKind === "order" && typeof out.title === "string") {
      out.title = decreeTitleForViewer({ title: out.title }, false);
    }
    return out;
  };
  return walk(value) as T;
}
