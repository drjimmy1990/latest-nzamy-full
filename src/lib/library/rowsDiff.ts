/**
 * Identity diff between a folder of library JSONL rows and what is loaded
 * (the live database, or an older rows folder) — used by
 * scripts/library-rows-diff.mjs before any library load (2026-10-04).
 *
 * The loader only UPSERTS: a row whose key is not in the new files stays
 * live. A renamed file, a renumbered article, a changed article status or a
 * file whose name arrived in another Unicode form (NFD vs NFC) therefore
 * shows up twice on the site. Comparing row COUNTS does not catch it — the
 * totals can match exactly. This compares KEYS.
 */

export const LIBRARY_ROW_TABLES: ReadonlyArray<{ name: string; pk: string }> = [
  { name: "laws", pk: "slug" },
  { name: "chapters", pk: "id" },
  { name: "articles", pk: "id" },
  { name: "article_amendments", pk: "id" },
  { name: "article_regulations", pk: "id" },
  { name: "decrees_circulars", pk: "id" },
  { name: "decree_pages", pk: "id" },
  { name: "judicial_collections", pk: "id" },
  { name: "principles", pk: "id" },
  { name: "principle_paragraphs", pk: "id" },
  { name: "feqh_books", pk: "id" },
  { name: "feqh_chapters", pk: "id" },
  { name: "feqh_sections", pk: "id" },
  { name: "feqh_blocks", pk: "id" },
];

/**
 * Rows removed from the live library on purpose. Their source files may
 * still be in a corpus or an older export, and a load would bring them back
 * — the diff flags that instead of calling it a harmless addition.
 * Add a key here whenever the team deletes library rows by SQL.
 */
export const DELETED_ON_PURPOSE: Readonly<Record<string, readonly string[]>> = {
  // supabase/one-time/2026-09-28_remove_two_junk_library_rows.sql (owner Q156)
  laws: ["2024-incometax-decisions-al-hkwmh", "43-1443-05-26----1443"],
};

export interface TableKeyDiff {
  table: string;
  /** Keys in the new files. */
  incoming: number;
  /** Keys already loaded. */
  loaded: number;
  /** In the new files only: will be inserted. */
  added: number;
  /** Loaded only: the load leaves them live (orphans unless removed on purpose). */
  leftBehind: number;
  /** In both: updated in place. */
  updated: number;
  /** Added keys whose NFC form equals a left-behind key's NFC form: the same item under another Unicode spelling. */
  unicodeTwins: number;
  /** Added keys the team deleted on purpose (DELETED_ON_PURPOSE): the load would bring them back. */
  resurrected: string[];
  sampleAdded: string[];
  sampleLeftBehind: string[];
  sampleUnicodeTwins: string[];
}

const SAMPLE = 10;

export function diffKeys(table: string, incoming: ReadonlySet<string>, loaded: ReadonlySet<string>): TableKeyDiff {
  const added: string[] = [];
  let updated = 0;
  for (const k of incoming) {
    if (loaded.has(k)) updated++;
    else added.push(k);
  }
  const leftBehind: string[] = [];
  for (const k of loaded) if (!incoming.has(k)) leftBehind.push(k);

  const leftByNfc = new Map<string, string>();
  for (const k of leftBehind) leftByNfc.set(k.normalize("NFC"), k);
  const twins: string[] = [];
  for (const k of added) {
    const other = leftByNfc.get(k.normalize("NFC"));
    if (other !== undefined && other !== k) twins.push(k);
  }

  const deleted = new Set(DELETED_ON_PURPOSE[table] ?? []);
  const resurrected = added.filter((k) => deleted.has(k));

  return {
    table,
    incoming: incoming.size,
    loaded: loaded.size,
    added: added.length,
    leftBehind: leftBehind.length,
    updated,
    unicodeTwins: twins.length,
    resurrected,
    sampleAdded: added.slice(0, SAMPLE),
    sampleLeftBehind: leftBehind.slice(0, SAMPLE),
    sampleUnicodeTwins: twins.slice(0, SAMPLE),
  };
}

export type DiffVerdict = "clean" | "adds-only" | "needs-team";

/**
 * clean     — nothing new, nothing left behind (a re-load of the same rows);
 * adds-only — new items and in-place updates only: safe for the owner;
 * needs-team — the load would leave loaded rows behind, add Unicode twins,
 *              or bring back rows deleted on purpose: the team first.
 */
export function diffVerdict(diffs: readonly TableKeyDiff[]): DiffVerdict {
  if (diffs.some((d) => d.leftBehind > 0 || d.unicodeTwins > 0 || d.resurrected.length > 0)) return "needs-team";
  if (diffs.some((d) => d.added > 0)) return "adds-only";
  return "clean";
}

/** Key of one JSONL row, or null when the line has none. */
export function rowKey(row: unknown, pk: string): string | null {
  if (row === null || typeof row !== "object") return null;
  const v = (row as Record<string, unknown>)[pk];
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === "" ? null : s;
}
