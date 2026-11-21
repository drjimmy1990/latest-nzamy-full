/**
 * _children.ts — a law's sub-legislation, linked by `parent_law_id` (library
 * agent's request of 19 Nov §1.8; our file 18 بند 5).
 *
 * The owner's rule: the link is written in the CHILD's frontmatter as
 * `parent_law_id`, whose value is the parent's identity as the parser reads
 * it — `instrument_id`, else `id`, else `system_id` (parse-laws.ts). The
 * seeder stores exactly that value in library.laws.instrument_id, so a child
 * of law L is a row whose parent_law_id equals L.instrument_id. There is no
 * slug fallback: a slug is a different namespace and could only create false
 * links. A row that points at itself is no child (the parser reports it and
 * keeps it as written).
 *
 * The counter and the order are computed here, never written by the agent:
 *   1. type «لائحة تنفيذية» first;
 *   2. then the newest issue_date_hijri first (Hijri strings compared as
 *      numbers, so «1445/03/01» comes before «1440/1/2»); an undated child last;
 *   3. then the title, then the slug (a total order).
 *
 * The law page (route.ts) and the /laws card (/api/library/init) both count
 * with isLawChildOf, so the two numbers cannot disagree.
 *
 * Owner file 16 §7 counts «التشريعات الفرعية» of both kinds: the regulations
 * merged into the file and these linked documents. A linked child whose title
 * is one of the merged names (the same regulation, also loaded as its own
 * file) is left out here, so it is never shown or counted twice
 * (childNamedAmongMerged; names compared in the card's form,
 * subsidiaryNamesUnderBase).
 *
 * Pure: `node --test` runs _children.test.ts.
 */
import { EXEC_REGULATION_TYPE } from "../../../../laws/lawsIndexFacets.ts";
import { lawStatusForDetail } from "../../../../laws/law-status.ts";
import type { LawStatus } from "../../../../laws/data.ts";
import { subsidiaryNamesUnderBase } from "../../../../laws/catalogueCardLabels.ts";

/** Runaway guard for one law's children read (the largest parent today has a few dozen). */
export const LAW_CHILDREN_MAX = 1000;

/**
 * The catalogue's children read goes in chunks of this many parent ids per
 * `in (…)` list, so the request line stays short (≈ 30 characters an id).
 */
export const CHILD_COUNT_ID_CHUNK = 50;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** The key a child writes in parent_law_id for this law: its instrument_id, trimmed ('' = none). */
export function lawChildKey(instrumentId: unknown): string {
  return str(instrumentId);
}

/** True when `row` is a sub-legislation of `parent` by the owner's rule (self-pointers excluded). */
export function isLawChildOf(
  row: { slug?: unknown; parent_law_id?: unknown },
  parent: { slug?: unknown; instrument_id?: unknown },
): boolean {
  const key = lawChildKey(parent.instrument_id);
  const slug = str(row.slug);
  return key !== "" && slug !== "" && str(row.parent_law_id) === key && slug !== str(parent.slug);
}

/**
 * A Hijri date as one sortable number, YYYYMMDD: «1445/03/01» → 14450301,
 * «1440/1/2» → 14400102, «١٤٤٥/٠٣/٠١هـ» → 14450301. A year and month alone
 * read as day 00, a year alone as 0000 — after every dated entry of that
 * year when sorted newest first. null when no 3–4 digit year is found.
 */
export function hijriSortKey(v: unknown): number | null {
  const t = str(v).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const m = /(\d{3,4})(?:\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{1,2}))?)?/.exec(t);
  if (!m) return null;
  const month = m[2] ? Number(m[2]) : 0;
  const day = m[3] ? Number(m[3]) : 0;
  if (month > 12 || day > 30) return null;
  return Number(m[1]) * 10000 + month * 100 + day;
}

/**
 * True when the child's title is one of the parent's merged names, in the
 * card's form (spaces collapsed, a trailing «… ل<base title>» dropped).
 */
export function childNamedAmongMerged(childTitle: unknown, parentTitle: unknown, mergedNames: readonly unknown[] | null | undefined): boolean {
  const names = Array.isArray(mergedNames) ? mergedNames : [];
  if (names.length === 0) return false;
  const [child] = subsidiaryNamesUnderBase(str(parentTitle), [childTitle]);
  if (!child) return false;
  return subsidiaryNamesUnderBase(str(parentTitle), names).includes(child);
}

export interface LawChildRow {
  slug: string;
  title: string;
  type: string;
  status: unknown;
  issue_date_hijri: unknown;
}

function isExecutiveRegulation(type: unknown): boolean {
  return str(type) === EXEC_REGULATION_TYPE;
}

/** The owner's order: executive regulation first, then newest, undated last, then title, then slug. */
export function compareLawChildren(a: LawChildRow, b: LawChildRow): number {
  const ra = isExecutiveRegulation(a.type) ? 0 : 1;
  const rb = isExecutiveRegulation(b.type) ? 0 : 1;
  if (ra !== rb) return ra - rb;
  const da = hijriSortKey(a.issue_date_hijri);
  const db = hijriSortKey(b.issue_date_hijri);
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return db - da;
  }
  const byTitle = str(a.title).localeCompare(str(b.title), "ar");
  if (byTitle !== 0) return byTitle;
  return str(a.slug) < str(b.slug) ? -1 : str(a.slug) > str(b.slug) ? 1 : 0;
}

/**
 * The children of `parent` among `rows`, in the owner's order. Rows that are
 * not its children by isLawChildOf, or repeat a slug, are dropped.
 */
export function sortLawChildren(
  rows: readonly unknown[] | null | undefined,
  parent: { slug?: unknown; instrument_id?: unknown },
): LawChildRow[] {
  const seen = new Set<string>();
  const out: LawChildRow[] = [];
  for (const raw of rows ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!isLawChildOf(row, parent)) continue;
    const slug = str(row.slug);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, title: str(row.title), type: str(row.type), status: row.status, issue_date_hijri: row.issue_date_hijri });
  }
  return out.sort(compareLawChildren);
}

/**
 * parent slug → its number of children, for a page of catalogue rows
 * (`parents`: {slug, instrument_id}) and the rows read by parent_law_id
 * (`rows`: {slug, parent_law_id}). Same rule as the law page (isLawChildOf);
 * a child slug counts once. A parent with no child is absent.
 */
export function childCountsByParent(
  rows: readonly unknown[] | null | undefined,
  parents: readonly { slug?: unknown; instrument_id?: unknown; title?: unknown; mergedNames?: readonly unknown[] }[],
): Map<string, number> {
  const byKey = new Map<string, { slug: string; instrument_id: string; title: unknown; mergedNames: readonly unknown[] }>();
  for (const p of parents) {
    const key = lawChildKey(p.instrument_id);
    const slug = str(p.slug);
    // instrument_id is unique in library.laws (20260919); keep the first anyway.
    if (key && slug && !byKey.has(key)) byKey.set(key, { slug, instrument_id: key, title: p.title, mergedNames: p.mergedNames ?? [] });
  }
  const children = new Map<string, Set<string>>();
  for (const raw of rows ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const parent = byKey.get(str(row.parent_law_id));
    if (!parent || !isLawChildOf(row, parent)) continue;
    if (childNamedAmongMerged(row.title, parent.title, parent.mergedNames)) continue;
    if (!children.has(parent.slug)) children.set(parent.slug, new Set());
    children.get(parent.slug)!.add(str(row.slug));
  }
  return new Map(Array.from(children.entries(), ([slug, set]) => [slug, set.size]));
}

/** How many linked-child titles the /laws card receives (L3: 2 shown, the rest behind «إظهار المزيد»). */
export const CARD_CHILD_TITLES_MAX = 10;

/**
 * File 03 L3 (batch l12): parent slug → the titles of its linked children,
 * for the /laws card — the same children childCountsByParent counts (same
 * rule, merged names left out), executive regulations first, then by title,
 * at most `max`. Titles are public like the catalogue (no text, no date).
 */
export function childTitlesByParent(
  rows: readonly unknown[] | null | undefined,
  parents: readonly { slug?: unknown; instrument_id?: unknown; title?: unknown; mergedNames?: readonly unknown[] }[],
  max = CARD_CHILD_TITLES_MAX,
): Map<string, string[]> {
  const byKey = new Map<string, { slug: string; instrument_id: string; title: unknown; mergedNames: readonly unknown[] }>();
  for (const p of parents) {
    const key = lawChildKey(p.instrument_id);
    const slug = str(p.slug);
    if (key && slug && !byKey.has(key)) byKey.set(key, { slug, instrument_id: key, title: p.title, mergedNames: p.mergedNames ?? [] });
  }
  const titles = new Map<string, Map<string, string>>();
  for (const raw of rows ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const parent = byKey.get(str(row.parent_law_id));
    if (!parent || !isLawChildOf(row, parent)) continue;
    if (childNamedAmongMerged(row.title, parent.title, parent.mergedNames)) continue;
    const title = str(row.title).replace(/\s+/g, " ");
    if (!title) continue;
    if (!titles.has(parent.slug)) titles.set(parent.slug, new Map());
    titles.get(parent.slug)!.set(str(row.slug), title);
  }
  const isExec = (t: string) => t.includes("اللائحة التنفيذية") ? 0 : 1;
  return new Map(Array.from(titles.entries(), ([slug, bySlug]) => {
    const list = Array.from(new Set(bySlug.values())).sort((a, b) => isExec(a) - isExec(b) || a.localeCompare(b, "ar"));
    return [slug, list.slice(0, Math.max(0, max))];
  }));
}

export interface LawChildItem {
  slug: string;
  title: string;
  /** The child's own kind («لائحة تنفيذية», «قرار», «تعميم» …). */
  type: string;
  /** library.laws.status, normalised like the law page's badge. */
  status: LawStatus;
  /** «1445/03/01» — a subscriber's only (T28-22); absent otherwise or when unknown. */
  issueDate?: string;
}

export interface LawSubLegislation {
  count: number;
  children: LawChildItem[];
}

/**
 * The law page's `subLegislation`: every child in the owner's order (sorted
 * with the real date for every viewer), the issue date sent only when
 * `showOfficialDates` (a subscriber, the same flag as the law's own date).
 * Titles, types and status are public like the catalogue; no text.
 */
export function lawChildrenForViewer(
  rows: readonly unknown[] | null | undefined,
  parent: { slug?: unknown; instrument_id?: unknown; title?: unknown },
  showOfficialDates: boolean,
  /** The raw names of the regulations merged into the parent's file: a child among them is left out. */
  mergedNames: readonly unknown[] = [],
): LawSubLegislation {
  const children = sortLawChildren(rows, parent)
    .filter((c) => !childNamedAmongMerged(c.title, parent.title, mergedNames))
    .map((c): LawChildItem => {
    const date = showOfficialDates ? str(c.issue_date_hijri) : "";
    return {
      slug: c.slug,
      title: c.title || c.slug,
      type: c.type,
      status: lawStatusForDetail(c.status),
      ...(date ? { issueDate: date } : {}),
    };
  });
  return { count: children.length, children };
}

/** The distinct, non-empty parent keys of a page of rows, in chunks for `in (…)` reads. */
export function childKeyChunks(
  parents: readonly { instrument_id?: unknown }[],
  size = CHILD_COUNT_ID_CHUNK,
): string[][] {
  const keys = Array.from(new Set(parents.map((p) => lawChildKey(p.instrument_id)).filter(Boolean)));
  const out: string[][] = [];
  for (let i = 0; i < keys.length; i += Math.max(1, size)) out.push(keys.slice(i, i + Math.max(1, size)));
  return out;
}
