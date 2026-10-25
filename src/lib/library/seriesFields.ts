/**
 * seriesFields — the source fields of a multi-volume work and of a short
 * summary, read tolerantly by the parsers (owner answers ٢٦٢ / ٢٦٣).
 *
 * ٢٦٢ (أ): the owner's library agent tags every volume of one work with the
 * same `series_id` / `collection_id` and a volume number, for sections 97
 * (السوابق), 98 (المبادئ) and 99 (الكتب الفقهية والقانونية). The names come
 * from schema_manifest.json multi_file_works.mechanism_1 (collection_id,
 * part_number; the books' current_volume) and from the owner's letter
 * (2026-10-25: series_id / collection_id + the volume number), so both are
 * read. ٢٦٣ (أ): the agent adds a `summary` to the decree / circular files
 * (section 30) and the fiqh books (99).
 *
 * Rules:
 *   - a value is never invented: an absent or unreadable field is null / "";
 *   - a volume number is a whole number ≥ 1 written in ASCII, Arabic-Indic or
 *     Persian digits — «3-4», «2.5», «0» or a word are not read (the parsers
 *     keep their old fallback);
 *   - the summary is the front matter's `summary`, else the body's
 *     «📝 موجز …» <details> block (lawSummaryBrief, the laws' and decrees' rule).
 *
 * Measured on last_owner (2026-10-25): 99 has collection_id in 137 files and
 * current_volume in 138; 97/98 have collection_id in 88, part_number in 88,
 * volume_number in 44; no file has series_id or a fiqh `summary` yet.
 *
 * Pure: `node --test` loads it directly.
 */

import { lawSummaryBrief } from "./lawPreambleBlocks.ts";

/** Series label keys, in order of preference. */
export const SERIES_ID_KEYS = ["series_id", "collection_id"] as const;

/** Volume-number keys for the judicial collections (97, 98): `part` before `volume`, as the parser always read them. */
export const COLLECTION_VOLUME_KEYS = ["volume_number", "part_number", "part", "volume"] as const;

/** Volume-number keys for the fiqh books (99): the books' own current_volume (manifest). */
export const BOOK_VOLUME_KEYS = ["volume_number", "current_volume", "part_number", "volume"] as const;

/** Longest series id kept (judicial_collections.series_id is varchar(150)). */
export const SERIES_ID_MAX = 150;

const MAX_VOLUME = 9999;

function scalar(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return "";
  return v.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

/** The work's series label, or null when the file names none. */
export function readSeriesId(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null;
  for (const key of SERIES_ID_KEYS) {
    const v = scalar(meta[key]);
    if (v && v !== "null" && v !== "~") return Array.from(v).slice(0, SERIES_ID_MAX).join("");
  }
  return null;
}

/** ٠-٩ and ۰-۹ → 0-9. */
function asciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** A whole number ≥ 1 (≤ 9999), or null. */
export function parseVolumeNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 1 && v <= MAX_VOLUME ? v : null;
  const s = asciiDigits(scalar(v));
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_VOLUME ? n : null;
}

/** The first readable volume number among `keys`, or null. */
export function readVolumeNumber(
  meta: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): number | null {
  if (!meta) return null;
  for (const key of keys) {
    if (meta[key] === undefined || meta[key] === null || meta[key] === "") continue;
    const n = parseVolumeNumber(meta[key]);
    if (n !== null) return n;
  }
  return null;
}

/** The front matter's `summary`, else the body's 📝 موجز block, else "". */
export function readSourceSummary(meta: Record<string, unknown> | null | undefined, body: unknown): string {
  const fm = meta ? scalar(meta.summary) : "";
  if (fm && fm !== "null" && fm !== "~") return fm;
  return lawSummaryBrief(body) ?? "";
}
