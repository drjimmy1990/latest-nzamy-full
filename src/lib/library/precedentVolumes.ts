/**
 * precedentVolumes — multi-volume judicial collections as one series (N2.4,
 * owner README «٤٧» part ٦: one card per series with volume buttons, and a
 * volume selector inside the reader).
 * ─────────────────────────────────────────────────────────────────────────────
 * TAGGED SERIES ONLY. A series is the collections that share a non-empty
 * library.judicial_collections.series_id (the source's `collection_id`,
 * kept by the parser as a grouping label — parse-precedents.ts
 * parsePrecedentContainer), two volumes or more. Nothing is grouped by title
 * and no series list is hard-coded (more series wait on owner ٢٦٢).
 *
 * VOLUME NUMBERS. `part` is the volume number when it tells the volumes
 * apart. In the owner corpus (2026-10-25) the series files carry
 * `part_label: المجلد الخامس` and no `part`, so the loader stores part = 1 on
 * every volume. Then the number comes from the id (`moj-rulings-1434-v05`),
 * then from «المجلد …» in the title. If that still does not give every volume
 * its own number, no number is shown: the volumes keep id order and their
 * own title — a number is never invented.
 *
 * Each volume keeps its own row (and its own `free` flag): a series card
 * never unlocks a paid volume because another volume is free.
 *
 * Pure and import-free: the catalogue, the precedents API and node:test load it.
 */

export interface CollectionVolumeRow {
  id: string;
  title: string;
  part?: number | null;
  series_id?: string | null;
  free?: boolean | null;
  ruling_count?: number | null;
}

export interface CollectionVolume<T extends CollectionVolumeRow> {
  row: T;
  /** The volume number, or null when it cannot be told apart (see above). */
  number: number | null;
}

export interface CollectionSeriesGroup<T extends CollectionVolumeRow> {
  kind: "series";
  /** The series_id. */
  key: string;
  /** The first volume's title without its volume token. */
  title: string;
  volumes: CollectionVolume<T>[];
  count: number;
  /** Sum of the volumes' ruling_count (each a real column value). */
  rulingCount: number;
}

export interface SingleCollection<T extends CollectionVolumeRow> {
  kind: "single";
  key: string;
  row: T;
}

export type CollectionCatalogueEntry<T extends CollectionVolumeRow> = CollectionSeriesGroup<T> | SingleCollection<T>;

/** What /api/library/precedents/[slug] returns as `series` (null for a stand-alone collection). */
export interface CollectionSeriesInfo {
  seriesId: string;
  currentId: string;
  volumes: Array<{ id: string; label: string; number: number | null; free: boolean; rulingCount: number | null }>;
}

const UNITS: Record<string, number> = {
  "الأول": 1, "الاول": 1, "الحادي": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5,
  "السادس": 6, "السابع": 7, "الثامن": 8, "التاسع": 9,
};
const TENS: Record<string, number> = {
  "عشر": 10, "والعشرين": 20, "والعشرون": 20, "والثلاثين": 30, "والثلاثون": 30,
};
const ROUND: Record<string, number> = {
  "العاشر": 10, "العشرين": 20, "العشرون": 20, "الثلاثين": 30, "الثلاثون": 30,
};

function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** A volume number at the start of `s`: digits or an Arabic ordinal word (1–39). */
export function arabicOrdinalNumber(s: string): number | null {
  const t = toAsciiDigits(String(s ?? "")).trim();
  const digits = /^(\d{1,3})(?!\d)/.exec(t);
  if (digits) {
    const n = Number(digits[1]);
    return n > 0 ? n : null;
  }
  const words = t.split(/\s+/);
  const first = words[0] ?? "";
  if (first in ROUND) return ROUND[first];
  if (first in UNITS) {
    const unit = UNITS[first];
    const next = words[1] ?? "";
    if (next in TENS) return TENS[next] + unit;
    return first === "الحادي" ? null : unit;
  }
  return null;
}

const ID_VOLUME = /(?:^|[-_])v(?:ol)?0*(\d{1,3})$/i;
const TITLE_VOLUME = /المجلد\s+(.+)$/;
const TITLE_VOLUME_TAIL = /\s*[-—–]\s*المجلد\s+.*$/;

function numberFromIdOrTitle(row: CollectionVolumeRow): number | null {
  const byId = ID_VOLUME.exec(String(row.id ?? ""));
  if (byId) {
    const n = Number(byId[1]);
    if (n > 0) return n;
  }
  const byTitle = TITLE_VOLUME.exec(String(row.title ?? ""));
  return byTitle ? arabicOrdinalNumber(byTitle[1]) : null;
}

function validPart(p: unknown): p is number {
  return typeof p === "number" && Number.isInteger(p) && p > 0;
}

function allDistinct(nums: Array<number | null>): nums is number[] {
  return nums.every((n) => n !== null) && new Set(nums).size === nums.length;
}

/** Volume numbers for the members of ONE series (same order as `rows`). */
function seriesNumbers(rows: readonly CollectionVolumeRow[]): Array<number | null> {
  const parts = rows.map((r) => (validPart(r.part) ? r.part : null));
  if (allDistinct(parts)) return parts;
  const parsed = rows.map(numberFromIdOrTitle);
  if (allDistinct(parsed)) return parsed;
  return rows.map(() => null);
}

function byNumberThenId<T extends CollectionVolumeRow>(a: CollectionVolume<T>, b: CollectionVolume<T>): number {
  if (a.number !== null && b.number !== null && a.number !== b.number) return a.number - b.number;
  if (a.number !== null && b.number === null) return -1;
  if (a.number === null && b.number !== null) return 1;
  return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
}

/** The series title: the volume title without « - المجلد …». */
export function collectionSeriesTitle(title: string): string {
  const t = String(title ?? "").trim();
  const base = t.replace(TITLE_VOLUME_TAIL, "").trim();
  return base || t;
}

/** «المجلد N», or the volume's own title when its number is unknown. */
export function collectionVolumeLabel(v: CollectionVolume<CollectionVolumeRow>): string {
  return v.number !== null ? `المجلد ${v.number}` : String(v.row.title ?? v.row.id);
}

function seriesKey(row: CollectionVolumeRow): string | null {
  const s = typeof row.series_id === "string" ? row.series_id.trim() : "";
  return s ? s : null;
}

/**
 * Rows → catalogue entries, in the order each entry first appears (the
 * catalogue's own order and filters apply before this).
 */
export function groupCollectionVolumes<T extends CollectionVolumeRow>(rows: readonly T[]): CollectionCatalogueEntry<T>[] {
  const groups = new Map<string, T[]>();
  const order: Array<{ key: string | null; row: T }> = [];
  for (const row of rows) {
    if (!row || typeof row.id !== "string") continue;
    const key = seriesKey(row);
    if (key === null) {
      order.push({ key: null, row });
      continue;
    }
    const list = groups.get(key);
    if (list) list.push(row);
    else {
      groups.set(key, [row]);
      order.push({ key, row });
    }
  }
  return order.map(({ key, row }): CollectionCatalogueEntry<T> => {
    const members = key === null ? undefined : groups.get(key);
    if (key === null || !members || members.length < 2) return { kind: "single", key: `single:${row.id}`, row };
    const numbers = seriesNumbers(members);
    const volumes = members.map((r, i) => ({ row: r, number: numbers[i] })).sort(byNumberThenId);
    return {
      kind: "series",
      key,
      title: collectionSeriesTitle(volumes[0].row.title),
      volumes,
      count: volumes.length,
      rulingCount: volumes.reduce((n, v) => n + (typeof v.row.ruling_count === "number" ? v.row.ruling_count : 0), 0),
    };
  });
}

/** The series `currentId` belongs to, shaped for the reader's volume selector — or null. */
export function buildCollectionSeries(rows: readonly CollectionVolumeRow[], currentId: string): CollectionSeriesInfo | null {
  const current = rows.find((r) => r && r.id === currentId);
  if (!current) return null;
  const key = seriesKey(current);
  if (key === null) return null;
  const entry = groupCollectionVolumes(rows.filter((r) => r && seriesKey(r) === key))[0];
  if (!entry || entry.kind !== "series") return null;
  return {
    seriesId: key,
    currentId,
    volumes: entry.volumes.map((v) => ({
      id: v.row.id,
      label: collectionVolumeLabel(v),
      number: v.number,
      free: v.row.free !== false,
      rulingCount: typeof v.row.ruling_count === "number" ? v.row.ruling_count : null,
    })),
  };
}
