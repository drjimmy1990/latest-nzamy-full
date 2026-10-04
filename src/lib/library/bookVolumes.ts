/**
 * bookVolumes — multi-volume fiqh books as one series (owner test 2026-09-28,
 * T28-24: «كتاب متعدد الأجزاء = بطاقة واحدة مع مبدّل أجزاء»).
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * `library.feqh_books` holds one row PER VOLUME (185 rows measured 2026-09-28)
 * and has no series column. `total_volumes` is not a series size either: it is
 * the volume number of THAT row («الإنصاف … — الجزء 7» carries 7). So the
 * catalogue showed «الإنصاف» 31 times, and every card claimed «N مجلد» with
 * the row's own volume number.
 *
 * The series is recovered from the title: the base title is everything before
 * the first « — » / « - » that introduces a volume token (الجزء / المجلد /
 * الكتاب / المقدمة / التقديم / نظرية الالتزام). A title with no such token is
 * a single book — «شرح قانون العقوبات - القسم العام» and «الأسس العامة للعقود
 * الإدارية - دراسة مقارنة» stay single.
 *
 * Pure and import-free: the books API (server), the catalogue and the reader
 * (client) and node:test all load it.
 */

export interface VolumeRow {
  /** feqh_books.id — the source filename, also the reader's slug. */
  id: string;
  title: string;
  /** feqh_books.total_volumes — in practice this row's own volume number. */
  total_volumes?: number | null;
  author?: string | null;
}

export interface BookSeriesGroup<T extends VolumeRow> {
  kind: "series";
  /** Grouping key (base title + author). */
  key: string;
  /** The base title shared by every volume. */
  title: string;
  author: string;
  /** Volumes in reading order (intro first, then by volume number). */
  volumes: T[];
  count: number;
}

export interface SingleBook<T extends VolumeRow> {
  kind: "single";
  key: string;
  book: T;
}

export type BookCatalogueEntry<T extends VolumeRow> = BookSeriesGroup<T> | SingleBook<T>;

/** What the books API returns as `series` (null when the book stands alone). */
export interface BookSeriesInfo {
  title: string;
  volumes: Array<{ id: string; label: string; title: string }>;
  currentId: string;
}

// A stray leading quote on one imported title («'الوسيط في قانون …»).
const LEADING_QUOTES = /^[\s'"`«»‘’“”]+/;
// The first dash (em/en/hyphen, spaced) that introduces a volume token.
const VOLUME_SEPARATOR = /\s+[—–-]\s+(?=(?:الجزء|المجلد|الكتاب|المقدمة|مقدمة|التقديم|تقديم|نظرية الالتزام))/;

const ORDINALS: Array<[string, number]> = [
  // Longest first so «الحادي عشر» wins over nothing and «الثاني عشر» over «الثاني».
  ["الحادي عشر", 11], ["الثاني عشر", 12],
  ["الأول", 1], ["الاول", 1], ["الثاني", 2], ["الثالث", 3], ["الرابع", 4], ["الخامس", 5],
  ["السادس", 6], ["السابع", 7], ["الثامن", 8], ["التاسع", 9], ["العاشر", 10],
];

function cleanTitle(title: string): string {
  return title.replace(LEADING_QUOTES, "").trim();
}

/** A title as it should be displayed: without the stray leading quote one import carries. */
export function cleanBookTitle(title: string): string {
  return cleanTitle(title ?? "");
}

function splitTitle(title: string): { base: string; rest: string | null } {
  const clean = cleanTitle(title);
  const m = VOLUME_SEPARATOR.exec(clean);
  if (!m || m.index === 0) return { base: clean, rest: null };
  return { base: clean.slice(0, m.index).trim(), rest: clean.slice(m.index + m[0].length).trim() };
}

/** The series' base title, or the whole (cleaned) title for a single book. */
export function bookSeriesKey(title: string): string {
  return splitTitle(title ?? "").base;
}

/** Whether the title names a volume of a series (has a volume token). */
export function isVolumeTitle(title: string): boolean {
  return splitTitle(title ?? "").rest !== null;
}

/** A number written as digits or as an Arabic ordinal word at the start of `s`. */
function leadingNumber(s: string): number | null {
  const t = s.trim();
  const d = /^(\d{1,3})(?!\d)/.exec(t);
  if (d) return Number(d[1]);
  for (const [word, n] of ORDINALS) {
    if (t === word || t.startsWith(`${word} `) || t.startsWith(`${word}:`) || t.startsWith(`${word}-`) || t.startsWith(`${word}—`)) {
      return n;
    }
  }
  return null;
}

const INTRO_RE = /^(?:ال)?مقدمة/;
const FOREWORD_RE = /^(?:ال)?تقديم/;

type VolumeKind = "intro" | "foreword" | "book" | "numbered" | "other";

interface ParsedVolume {
  kind: VolumeKind;
  /** الجزء / الكتاب number, when stated. */
  part: number | null;
  /** المجلد number inside a part (الوسيط ج7 م2), when stated. */
  sub: number | null;
  /** Text after the base title. */
  rest: string;
}

function parseVolume(title: string, id: string): ParsedVolume {
  const { rest } = splitTitle(title ?? "");
  const r = rest ?? "";
  const idStr = id ?? "";

  // «… — المقدمة» / «… - الجزء مقدمة» / «… - الجزء المقدمة»
  const idTail = /الجزء\s+(\S+)\s*$/.exec(idStr)?.[1] ?? "";
  if (INTRO_RE.test(r) || INTRO_RE.test(idTail)) return { kind: "intro", part: null, sub: null, rest: r };
  if (FOREWORD_RE.test(r) || FOREWORD_RE.test(idTail)) return { kind: "foreword", part: null, sub: null, rest: r };

  // الوسيط ids carry the part and sub-volume: «الوسيط_ج7_م2_عقود_الغرر».
  const idPart = /(?:^|_)ج(\d{1,3})(?=_|$)/.exec(idStr);
  const idSub = /(?:^|_)م(\d{1,3})(?=_|$)/.exec(idStr);

  const titlePart = /(?:^|\s)الجزء\s+(.+)$/.exec(r);
  const titleSub = /(?:^|\s)المجلد\s+(.+)$/.exec(r);
  const part = idPart ? Number(idPart[1]) : titlePart ? leadingNumber(titlePart[1]) : null;
  const sub = idSub ? Number(idSub[1]) : titleSub ? leadingNumber(titleSub[1]) : null;

  if (/^الكتاب\s/.test(r)) {
    return { kind: "book", part: leadingNumber(r.replace(/^الكتاب\s+/, "")), sub, rest: r };
  }
  if (part !== null) return { kind: "numbered", part, sub, rest: r };
  return { kind: "other", part: null, sub, rest: r };
}

/**
 * A short Arabic label for the volume switcher: «المقدمة» / «التقديم» /
 * «الجزء 3» / «الجزء 7 – المجلد 2» / «الكتاب الأول: قضاء الإلغاء». Falls back
 * to the text after the base title, then to the whole title.
 */
export function volumeLabel(title: string, id: string, totalVolumes?: number | null): string {
  const v = parseVolume(title, id);
  if (v.kind === "intro") return "المقدمة";
  if (v.kind === "foreword") return "التقديم";
  if (v.kind === "book") return v.rest;
  const part = v.part ?? (v.kind === "other" && !v.rest && validVolume(totalVolumes) ? totalVolumes : null);
  if (part !== null && part !== undefined) {
    return v.sub !== null ? `الجزء ${part} – المجلد ${v.sub}` : `الجزء ${part}`;
  }
  return v.rest || cleanTitle(title ?? "");
}

/**
 * The descriptive part of a volume title that the label leaves out, e.g.
 * «مصادر الالتزام» for «الوسيط … — نظرية الالتزام بوجه عام — مصادر الالتزام»
 * (label «الجزء 1»). "" when the label already says everything.
 */
export function volumeSubtitle(title: string, id: string): string {
  const v = parseVolume(title, id);
  if (v.kind === "intro" || v.kind === "foreword" || v.kind === "book") return "";
  let r = v.rest;
  // Drop the leading «الجزء …» / «المجلد …» tokens and the dash after each.
  for (let guard = 0; guard < 4; guard++) {
    const m = /^(?:الجزء|المجلد)\s+(?:\d{1,3}|الحادي عشر|الثاني عشر|الأول|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)\s*(?:[—–-]\s*)?/.exec(r);
    if (!m) break;
    r = r.slice(m[0].length).trim();
  }
  return r;
}

function validVolume(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Reading order inside a series: intro (المقدمة) and foreword (التقديم)
 * first, then the volume number — parsed from the id/title (ج\d+, الجزء N,
 * ordinal words, الكتاب الأول…) and falling back to total_volumes — then the
 * sub-volume (م\d+), then the id.
 */
export function volumeSortKey(row: VolumeRow): [number, number, number, string] {
  const v = parseVolume(row.title, row.id);
  const rank = v.kind === "foreword" ? 0 : v.kind === "intro" ? 1 : 2;
  const part = rank < 2 ? 0 : v.part ?? (validVolume(row.total_volumes) ? row.total_volumes : Number.MAX_SAFE_INTEGER);
  const sub = v.sub ?? 0;
  return [rank, part, sub, row.id];
}

export function compareVolumes(a: VolumeRow, b: VolumeRow): number {
  const ka = volumeSortKey(a);
  const kb = volumeSortKey(b);
  for (let i = 0; i < 3; i++) {
    const d = (ka[i] as number) - (kb[i] as number);
    if (d !== 0) return d;
  }
  return ka[3] < kb[3] ? -1 : ka[3] > kb[3] ? 1 : 0;
}

function seriesKeyOf(row: VolumeRow): string {
  const base = bookSeriesKey(row.title).replace(/\s+/g, " ");
  return `${base}\u0000${(row.author ?? "").trim()}`;
}

/**
 * Rows → catalogue entries, in the order each entry first appears. Rows whose
 * title names a volume and that share a base title AND author become one
 * series when there are at least two of them; everything else stays single.
 * A row with no volume token never joins a series.
 */
export function groupBookVolumes<T extends VolumeRow>(rows: readonly T[]): BookCatalogueEntry<T>[] {
  const groups = new Map<string, T[]>();
  const order: Array<{ key: string; row: T }> = [];
  for (const row of rows) {
    if (!row || typeof row.title !== "string") continue;
    if (!isVolumeTitle(row.title)) {
      order.push({ key: `single:${row.id}`, row });
      continue;
    }
    const key = seriesKeyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else {
      groups.set(key, [row]);
      order.push({ key, row });
    }
  }
  return order.map(({ key, row }): BookCatalogueEntry<T> => {
    const members = groups.get(key);
    if (!members || members.length < 2) return { kind: "single", key: `single:${row.id}`, book: row };
    const volumes = [...members].sort(compareVolumes);
    return {
      kind: "series",
      key,
      title: bookSeriesKey(volumes[0].title),
      author: (volumes[0].author ?? "").trim(),
      volumes,
      count: volumes.length,
    };
  });
}

/**
 * The series the book `currentId` belongs to, shaped for the reader's volume
 * switcher — or null when it stands alone (or is not in `rows`).
 */
export function buildBookSeries(rows: readonly VolumeRow[], currentId: string): BookSeriesInfo | null {
  const current = rows.find((r) => r && r.id === currentId);
  if (!current || !isVolumeTitle(current.title)) return null;
  const key = seriesKeyOf(current);
  const entry = groupBookVolumes(rows.filter((r) => r && typeof r.title === "string" && isVolumeTitle(r.title) && seriesKeyOf(r) === key))
    .find((e): e is BookSeriesGroup<VolumeRow> => e.kind === "series");
  if (!entry) return null;
  return {
    title: entry.title,
    volumes: entry.volumes.map((v) => ({ id: v.id, label: volumeLabel(v.title, v.id, v.total_volumes), title: v.title })),
    currentId,
  };
}

/** The catalogue fields toCatalogueCards reads (the /laws books list shape). */
export interface CatalogueBook {
  id: string;
  /** feqh_books.id — the /book/<slug> route key. */
  slug: string;
  title: string;
  author?: string | null;
  /** total_volumes as the list carries it — this row's own volume number. */
  volCount?: number | null;
  desc?: string;
  /** Set on search hits (passages), which are never grouped. */
  _isSearchResult?: boolean;
  /** A book-title search hit names its series size (the API's «٤ مجلدات»). */
  searchVolumesLabel?: string | null;
}

/**
 * One catalogue card: a single book, or a whole multi-volume series.
 * `book` is the row the card opens — a series opens its first volume in
 * reading order (the intro when there is one). `volumesLabel` is "" for a
 * single: its volCount is its OWN volume number, so it claims no count.
 */
export interface CatalogueCard<T extends CatalogueBook> {
  key: string;
  book: T;
  title: string;
  volumesLabel: string;
}

/**
 * The /laws fiqh list → one card per series or single book (T28-24). Search
 * hits are passages («الكتاب — الموضوع»), not books: one card each, as given.
 */
export function toCatalogueCards<T extends CatalogueBook>(books: readonly T[]): CatalogueCard<T>[] {
  if (books.some((b) => b._isSearchResult)) {
    return books.map((b) => ({ key: b.id, book: b, title: b.title, volumesLabel: b.searchVolumesLabel ?? "" }));
  }
  const rows = books.map((b) => ({ id: b.slug, title: b.title, total_volumes: b.volCount ?? null, author: b.author ?? null, book: b }));
  return groupBookVolumes(rows).map((entry): CatalogueCard<T> => {
    if (entry.kind === "single") {
      const b = entry.book.book;
      return { key: `book:${b.id}`, book: b, title: cleanBookTitle(b.title), volumesLabel: "" };
    }
    const first = entry.volumes[0].book;
    const desc = first.desc || entry.volumes.find((v) => v.book.desc)?.book.desc || "";
    return {
      key: `series:${entry.key}`,
      book: { ...first, desc },
      title: entry.title,
      volumesLabel: volumesCountLabel(entry.count),
    };
  });
}

/**
 * «مجلدان» / «3 مجلدات» / «31 مجلدًا» — the Arabic count agreement for a
 * number of volumes. "" for 0/1 or a non-number: a single book claims no count.
 */
export function volumesCountLabel(n: number): string {
  if (!Number.isFinite(n) || n < 2) return "";
  if (n === 2) return "مجلدان";
  if (n <= 10) return `${n} مجلدات`;
  return `${n} مجلدًا`;
}
