/**
 * mergedRegulationNames — the names behind the grey «يشتمل على: A • B» line
 * under a merged law's title on the /laws card (owner 2026-11-07,
 * screenshot 1). library.laws.merged_regulation_names (text[], migration
 * 20261107_10) holds the distinct article_regulations.ref names of a law in
 * order of first appearance; /api/library/init passes each row's value
 * through mergedNamesForViewer before it leaves the server.
 *
 * Pure: `node --test src/lib/library/mergedRegulationNames.test.ts`.
 */

import { summaryForViewer } from "./legislativeEvent.ts";
import { regulationNameOf } from "./regulationName.ts";

/**
 * The names one viewer receives: non-strings, blank and repeated names dropped,
 * whitespace collapsed, and for a non-subscriber each name without decree
 * numbers or dates (owner ٣١٩'s stripper, the one the موجز goes through;
 * ٤٢٤ / ٣٨٠). [] when the value is not an array (no column yet, or NULL).
 * The stored refs are per regulation ARTICLE: each is reduced to its
 * regulation's name (regulationNameOf), and a bare article label is dropped.
 */
export function mergedNamesForViewer(value: unknown, isSubscriber: boolean): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const name = regulationNameOf(summaryForViewer(raw, isSubscriber));
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}
