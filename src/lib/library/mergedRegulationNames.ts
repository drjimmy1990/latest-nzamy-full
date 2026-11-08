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
/**
 * Owner 2026-11-06 item 4: the names one viewer receives from
 * library.laws.merged_regulations (jsonb, migration 20261109_20) — the owner's
 * own `merged_regulation_details` names, seeded on every load. These are whole
 * regulation names already, so they are NOT passed through regulationNameOf
 * (its regulation-word gate would drop a real name such as «جدول …»): only
 * whitespace collapsed, blank / repeated / non-string names dropped, and for a
 * non-subscriber the decree numbers and dates stripped (owner ٣١٩'s stripper).
 * [] when the value is not an array (no column yet, NULL, or no names) — the
 * caller then falls back to merged_regulation_names.
 */
export function mergedNamesFromDetails(value: unknown, isSubscriber: boolean): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const raw = typeof e.name === "string" ? e.name : typeof e.title === "string" ? e.title : "";
    const name = summaryForViewer(raw.replace(/\s+/g, " ").trim(), isSubscriber).replace(/\s+/g, " ").trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

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
