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

// ══════════════════════════════════════════════════════════════════════════
// --scope-rows: a trial on a few files (owner package 19 Nov, item 5.9)
// ══════════════════════════════════════════════════════════════════════════
//
// Against the full library, a rows folder made from 3 files marks every other
// loaded row as "left behind". In scope mode the diff only looks at the
// documents the folder holds: a top-level row by its key, a child row by the
// column that names its parent (a law's chapters by law_slug, an article's
// amendments by article_id, …). A child the load would leave behind under a
// document of the folder is still found, because it is fetched by its
// parent's key, not by its own.

/** How each table's rows belong to a document: null = a top-level row (in scope by its own key). */
export const ROW_SCOPE: Readonly<Record<string, { column: string; parent: string } | null>> = {
  laws: null,
  chapters: { column: "law_slug", parent: "laws" },
  articles: { column: "law_slug", parent: "laws" },
  article_amendments: { column: "article_id", parent: "articles" },
  article_regulations: { column: "law_slug", parent: "laws" },
  decrees_circulars: null,
  decree_pages: { column: "decree_id", parent: "decrees_circulars" },
  judicial_collections: null,
  principles: { column: "collection_id", parent: "judicial_collections" },
  principle_paragraphs: { column: "principle_id", parent: "principles" },
  feqh_books: null,
  feqh_chapters: { column: "book_id", parent: "feqh_books" },
  feqh_sections: { column: "chapter_id", parent: "feqh_chapters" },
  feqh_blocks: { column: "section_id", parent: "feqh_sections" },
};

/**
 * Which rows of `table` are in scope: by `column`, those whose value is in
 * `keys`. A top-level table is scoped by its own key (the folder's keys); a
 * child by its parent table's scope (`scope` holds each table's in-scope keys,
 * filled parent first — LIBRARY_ROW_TABLES is in that order).
 */
export function scopeFilter(
  table: string,
  pk: string,
  incomingKeys: ReadonlySet<string>,
  scope: ReadonlyMap<string, ReadonlySet<string>>,
): { column: string; keys: ReadonlySet<string> } {
  const spec = ROW_SCOPE[table];
  if (spec === undefined) throw new Error(`no scope rule for table ${table}`);
  if (spec === null) return { column: pk, keys: incomingKeys };
  return { column: spec.column, keys: scope.get(spec.parent) ?? new Set() };
}

export function rowInScope(row: unknown, filter: { column: string; keys: ReadonlySet<string> }): boolean {
  const v = rowKey(row, filter.column);
  return v !== null && filter.keys.has(v);
}

/**
 * PostgREST `in.(…)` value for these keys, every one double-quoted (a comma,
 * a parenthesis or a dot inside a key would otherwise split it), with `"` and
 * `\` escaped. Not URL-encoded: the caller encodes the whole value.
 */
export function postgrestInList(keys: Iterable<string>): string {
  const quoted: string[] = [];
  for (const k of keys) quoted.push(`"${k.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `in.(${quoted.join(",")})`;
}

/**
 * The read-only GET urls that fetch the in-scope rows of one table: every
 * column (`select=*`), filtered by `column` in batches of keys short enough
 * for one url, ordered by the key for keyset paging (the caller appends
 * `&<pk>=gt.<last>` for the next page). Keys are sorted so the urls are stable.
 */
export function scopedRowUrls(
  base: string,
  table: string,
  pk: string,
  column: string,
  keys: Iterable<string>,
  maxUrlLength = 6000,
): string[] {
  const root = `${base.replace(/\/+$/, "")}/rest/v1/${table}?select=*&order=${encodeURIComponent(pk)}.asc&limit=1000&${encodeURIComponent(column)}=`;
  const urls: string[] = [];
  let batch: string[] = [];
  const flush = () => {
    if (batch.length) urls.push(root + encodeURIComponent(postgrestInList(batch)));
    batch = [];
  };
  for (const k of [...keys].sort()) {
    const next = [...batch, k];
    if (batch.length && (root + encodeURIComponent(postgrestInList(next))).length > maxUrlLength) flush();
    batch.push(k);
  }
  flush();
  return urls;
}

/** Same value? null and undefined match; a number and its decimal string match (numeric columns); objects by content. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  const ta = typeof a;
  const tb = typeof b;
  if ((ta === "number" && tb === "string") || (ta === "string" && tb === "number")) return String(a) === String(b);
  if (ta === "object" && tb === "object") return canonicalJson(a) === canonicalJson(b);
  return false;
}

function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** The live row has no such field: the column does not exist (a migration not run yet). */
export const COLUMN_ABSENT = "∅ (no such column)";

export interface FieldChange {
  table: string;
  key: string;
  field: string;
  /** The loaded value; COLUMN_ABSENT when the loaded row has no such field. */
  old: unknown;
  new: unknown;
}

export interface TableValueDiff {
  table: string;
  /** Rows in both (updated in place) whose loaded values differ in at least one field. */
  changedRows: number;
  /** Rows in both with every field of the new row equal. */
  unchangedRows: number;
  /** Field → how many rows change it. */
  fieldCounts: Record<string, number>;
  changes: FieldChange[];
}

/**
 * Per-field value diff of the rows present in both: only the fields the new
 * row carries are compared (what the loader writes), so a generated column
 * the files never carry (fts, summary_brief) is never reported.
 */
export function diffRowValues(
  table: string,
  pk: string,
  incoming: ReadonlyMap<string, Record<string, unknown>>,
  loaded: ReadonlyMap<string, Record<string, unknown>>,
): TableValueDiff {
  const changes: FieldChange[] = [];
  const fieldCounts: Record<string, number> = {};
  let changedRows = 0;
  let unchangedRows = 0;
  for (const key of [...incoming.keys()].sort()) {
    const was = loaded.get(key);
    if (!was) continue;
    const now = incoming.get(key) as Record<string, unknown>;
    let changed = false;
    for (const field of Object.keys(now)) {
      if (field === pk) continue;
      const old = Object.prototype.hasOwnProperty.call(was, field) ? was[field] : COLUMN_ABSENT;
      if (old !== COLUMN_ABSENT && valuesEqual(old, now[field])) continue;
      changed = true;
      fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
      changes.push({ table, key, field, old, new: now[field] });
    }
    if (changed) changedRows++;
    else unchangedRows++;
  }
  return { table, changedRows, unchangedRows, fieldCounts, changes };
}

const TSV_VALUE_MAX = 2000;

/** One TSV cell: tabs and line breaks escaped, long text cut with its length named. */
export function tsvCell(v: unknown): string {
  let s = v === undefined ? "" : v === null ? "null" : typeof v === "string" ? v : JSON.stringify(v);
  if (s.length > TSV_VALUE_MAX) s = `${s.slice(0, TSV_VALUE_MAX)}…(${s.length} chars)`;
  return s.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

export function valueDiffTsv(diffs: readonly TableValueDiff[]): string {
  const lines = ["table\tkey\tfield\told\tnew"];
  for (const d of diffs) for (const c of d.changes) lines.push([c.table, c.key, c.field, tsvCell(c.old), tsvCell(c.new)].join("\t"));
  return `${lines.join("\n")}\n`;
}

const MD_VALUE_MAX = 160;
const MD_EXAMPLES = 40;
const MD_KEYS = 50;

function mdValue(v: unknown): string {
  let s = v === undefined ? "" : v === null ? "null" : typeof v === "string" ? v : JSON.stringify(v);
  if (s.length > MD_VALUE_MAX) s = `${s.slice(0, MD_VALUE_MAX)}… (${s.length})`;
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ⏎ ") || "«»";
}

/** The human report of a scoped diff: per table, keys then values. */
export function scopedDiffMarkdown(input: {
  rowsDir: string;
  comparedWith: string;
  keyDiffs: readonly TableKeyDiff[];
  valueDiffs: readonly TableValueDiff[];
  leftBehind: Readonly<Record<string, readonly string[]>>;
  verdict: DiffVerdict;
}): string {
  const out: string[] = [];
  out.push("# library-rows-diff --scope-rows", "");
  out.push(`- New rows: \`${input.rowsDir}\``);
  out.push(`- Compared with: \`${input.comparedWith}\``);
  out.push(`- Verdict: **${input.verdict}**`);
  out.push("- Scope: only the documents in the new rows folder, and their chapters, articles, cards, pages, principles…", "");
  out.push("| table | new | loaded (in scope) | added | updated | of which changed | left behind |", "|---|---:|---:|---:|---:|---:|---:|");
  for (const k of input.keyDiffs) {
    const v = input.valueDiffs.find((d) => d.table === k.table);
    out.push(`| ${k.table} | ${k.incoming} | ${k.loaded} | ${k.added} | ${k.updated} | ${v?.changedRows ?? 0} | ${k.leftBehind} |`);
  }
  for (const k of input.keyDiffs) {
    const v = input.valueDiffs.find((d) => d.table === k.table);
    const left = input.leftBehind[k.table] ?? [];
    if (!left.length && !k.added && !(v && v.changes.length)) continue;
    out.push("", `## ${k.table}`);
    if (k.added) out.push("", `Added (${k.added}): ${k.sampleAdded.map((x) => `\`${x}\``).join(", ")}${k.added > k.sampleAdded.length ? " …" : ""}`);
    if (left.length) {
      out.push("", `Left behind — loaded under a document of this folder, not in the new rows (${left.length}):`);
      for (const x of left.slice(0, MD_KEYS)) out.push(`- \`${x}\``);
      if (left.length > MD_KEYS) out.push(`- … ${left.length - MD_KEYS} more (full list in the JSON report)`);
    }
    if (v && v.changes.length) {
      out.push("", `Fields changed (rows): ${Object.entries(v.fieldCounts).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(", ")}`, "");
      out.push("| key | field | loaded | new |", "|---|---|---|---|");
      for (const c of v.changes.slice(0, MD_EXAMPLES)) out.push(`| \`${c.key}\` | ${c.field} | ${mdValue(c.old)} | ${mdValue(c.new)} |`);
      if (v.changes.length > MD_EXAMPLES) out.push("", `… ${v.changes.length - MD_EXAMPLES} more changes in the .tsv`);
    }
  }
  return `${out.join("\n")}\n`;
}
