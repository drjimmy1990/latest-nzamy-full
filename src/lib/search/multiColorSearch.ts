/**
 * multiColorSearch — one search-and-highlight engine for every search box on
 * the platform (owner notes ٠٦ / ٠٧, 2026-10-30).
 * ─────────────────────────────────────────────────────────────────────────────
 * The query grammar is the library's (parseSearchQuery, normalizeArabic.ts):
 *   - a space or `+`  → AND: every word is its own term, its own colour;
 *   - `"…"`           → one phrase, one colour (longest match wins, so the
 *                        phrase is never split by one of its own words);
 *   - `/`             → OR: each alternative is its own term, its own colour
 *                        (a date «1444/10/20» and «م/14» stay one term, as in
 *                        the server parser);
 *   - `word*`         → prefix: the highlight runs to the END of the word
 *                        («وكيل*» marks «وكيله» whole, not its first 4 letters);
 *   - `-word`         → excluded: filters, never coloured, listed apart.
 *
 * Unlike parseSearchQuery this never throws: a half-typed query («"عزل» with
 * no closing quote, a trailing `+`) still highlights what it can — a reader's
 * highlight must not blank out while the person is typing.
 *
 * Matching folds what people type interchangeably and never moves a character
 * of the original text (the regex runs on the RAW text):
 *   - ا / أ / إ / آ, ه / ة, ي / ى;
 *   - the three numeral scripts 0-9 / ٠-٩ / ۰-۹;
 *   - harakat and tatweel in the text are skipped between letters.
 * The same pattern decides "does this row match" (matchesQuery) for lists that
 * filter in the browser (the circuits directory), so the filter and the
 * highlight can never disagree.
 *
 * Pure, no imports beyond normalizeArabic: `node --test` loads it directly.
 */

import { normalizeSearch } from "../../utils/normalizeArabic.ts";

export type HighlightTermKind = "word" | "phrase" | "prefix";

export interface HighlightTerm {
  /** The term as the person typed it (without quotes, `*` or `-`). */
  label: string;
  kind: HighlightTermKind;
  /** Index into HIGHLIGHT_PALETTE (terms beyond five reuse the colours). */
  color: number;
}

export interface ParsedHighlightQuery {
  /** Coloured terms, in the order they were typed. */
  terms: HighlightTerm[];
  /** `-word` terms: rows holding them are dropped; never coloured. */
  excluded: HighlightTerm[];
  /**
   * The AND / OR shape for matchesQuery: an OR of AND-groups, each group a
   * list of indexes into `terms`. «a b / c» → [[0, 1], [2]]... (AND binds
   * tighter than OR, like the server parser).
   */
  groups: number[][];
}

/** Five colours that read in light and dark (owner note ٠٦): amber, emerald, sky, violet, rose. */
export const HIGHLIGHT_PALETTE = [
  { name: "amber", mark: "bg-amber-200 text-amber-950 dark:bg-amber-400/40 dark:text-white", dot: "bg-amber-400" },
  { name: "emerald", mark: "bg-emerald-200 text-emerald-950 dark:bg-emerald-400/40 dark:text-white", dot: "bg-emerald-500" },
  { name: "sky", mark: "bg-sky-200 text-sky-950 dark:bg-sky-400/40 dark:text-white", dot: "bg-sky-500" },
  { name: "violet", mark: "bg-violet-200 text-violet-950 dark:bg-violet-400/40 dark:text-white", dot: "bg-violet-500" },
  { name: "rose", mark: "bg-rose-200 text-rose-950 dark:bg-rose-400/40 dark:text-white", dot: "bg-rose-500" },
] as const;

export function paletteFor(color: number) {
  return HIGHLIGHT_PALETTE[((color % HIGHLIGHT_PALETTE.length) + HIGHLIGHT_PALETTE.length) % HIGHLIGHT_PALETTE.length];
}

const SEARCH_DIGIT = /[0-9٠-٩۰-۹]/;
/** Longest term we build a pattern for; longer input is ignored, not truncated. */
const MAX_TERM_CHARS = 120;
/** Most coloured terms one query may carry. */
export const MAX_HIGHLIGHT_TERMS = 12;

function isLiteralSlash(input: string, index: number, termStart: number): boolean {
  const previous = input[index - 1] ?? "";
  const next = input[index + 1] ?? "";
  if (SEARCH_DIGIT.test(previous) && SEARCH_DIGIT.test(next)) return true;
  return input.slice(termStart, index) === "م" && SEARCH_DIGIT.test(next);
}

/** Parse a search box's text into coloured terms. Never throws. */
export function parseHighlightQuery(query: string | null | undefined): ParsedHighlightQuery {
  const raw = String(query ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  const terms: HighlightTerm[] = [];
  const excluded: HighlightTerm[] = [];
  const groups: number[][] = [[]];
  if (!raw) return { terms, excluded, groups: [] };

  const seen = new Map<string, number>();
  const push = (label: string, kind: HighlightTermKind, negated: boolean) => {
    const clean = label.trim();
    if (!clean || clean.length > MAX_TERM_CHARS) return;
    if (!normalizeSearch(clean).replace(HARAKAT_TATWEEL, "")) return;
    const key = `${kind}:${normalizeSearch(clean)}`;
    if (negated) {
      if (!excluded.some((t) => `${t.kind}:${normalizeSearch(t.label)}` === key)) {
        excluded.push({ label: clean, kind, color: -1 });
      }
      return;
    }
    let at = seen.get(key);
    if (at === undefined) {
      if (terms.length >= MAX_HIGHLIGHT_TERMS) return;
      at = terms.length;
      terms.push({ label: clean, kind, color: at });
      seen.set(key, at);
    }
    const group = groups[groups.length - 1];
    if (!group.includes(at)) group.push(at);
  };

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (/\s/.test(ch) || ch === "+") {
      i += 1;
      continue;
    }
    if (ch === "/") {
      if (groups[groups.length - 1].length > 0) groups.push([]);
      i += 1;
      continue;
    }
    let negated = false;
    if (ch === "-") {
      negated = true;
      i += 1;
      if (i >= raw.length) break;
    }
    if (raw[i] === '"') {
      const close = raw.indexOf('"', i + 1);
      const end = close === -1 ? raw.length : close;
      const phrase = raw.slice(i + 1, end).replace(/\\(["\\])/g, "$1").replace(/\s+/g, " ");
      push(phrase, phrase.includes(" ") ? "phrase" : "word", negated);
      i = close === -1 ? raw.length : close + 1;
      continue;
    }
    const start = i;
    while (i < raw.length) {
      const c = raw[i];
      if (/\s/.test(c) || c === "+" || c === '"') break;
      if (c === "/" && !isLiteralSlash(raw, i, start)) break;
      i += 1;
    }
    let word = raw.slice(start, i);
    let kind: HighlightTermKind = "word";
    if (word.endsWith("*")) {
      kind = "prefix";
      word = word.replace(/\*+$/, "");
    }
    word = word.replace(/\*/g, "");
    push(word, kind, negated);
  }

  return { terms, excluded, groups: groups.filter((g) => g.length > 0) };
}

const HARAKAT_TATWEEL = /[ً-ْٰـ]/g;
const BETWEEN_LETTERS = "[ً-ْٰـ]*";
const DIGIT_CLASSES = [
  "[0٠۰]", "[1١۱]", "[2٢۲]", "[3٣۳]", "[4٤۴]",
  "[5٥۵]", "[6٦۶]", "[7٧۷]", "[8٨۸]", "[9٩۹]",
];
/** The rest of a word after a prefix term: letters, marks and digits of any script. */
const WORD_TAIL = "[\\p{L}\\p{M}\\p{N}ـ]*";

function charClass(ch: string): string {
  if (ch === "ا") return "[اأإآ]";
  if (ch === "ه") return "[هة]";
  if (ch === "ي") return "[يى]";
  if (ch >= "0" && ch <= "9") return DIGIT_CLASSES[Number(ch)];
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The regex source for one term (no flags, no groups). '' when it has nothing to match. */
export function termPatternSource(term: Pick<HighlightTerm, "label" | "kind">): string {
  const folded = normalizeSearch(term.label).replace(HARAKAT_TATWEEL, "");
  if (!folded || folded.length > MAX_TERM_CHARS) return "";
  const words = folded.split(/\s+/).filter(Boolean);
  const body = words
    .map((w) => Array.from(w).map(charClass).join(BETWEEN_LETTERS))
    .join(`${BETWEEN_LETTERS}\\s+${BETWEEN_LETTERS}`);
  return term.kind === "prefix" ? `${body}${WORD_TAIL}` : body;
}

export interface HighlightSegment {
  text: string;
  /** Index into the parsed terms, or null for plain text. */
  term: number | null;
}

interface CompiledTerms {
  regex: RegExp | null;
  /** Capture group n (1-based) → term index. */
  groupTerm: number[];
}

const compiledCache = new Map<string, CompiledTerms>();

function compile(terms: readonly HighlightTerm[]): CompiledTerms {
  const cacheKey = terms.map((t) => `${t.kind}\u0001${t.label}`).join("\u0002");
  const hit = compiledCache.get(cacheKey);
  if (hit) return hit;
  // Longest pattern first: at one position the regex tries alternatives in
  // order, so «"عزل الوكيل"» beats «عزل» and stays one colour.
  const order = terms
    .map((t, index) => ({ index, source: termPatternSource(t), len: normalizeSearch(t.label).length }))
    .filter((t) => t.source)
    .sort((a, b) => b.len - a.len || a.index - b.index);
  const compiled: CompiledTerms = order.length
    ? { regex: new RegExp(order.map((t) => `(${t.source})`).join("|"), "giu"), groupTerm: order.map((t) => t.index) }
    : { regex: null, groupTerm: [] };
  if (compiledCache.size > 200) compiledCache.clear();
  compiledCache.set(cacheKey, compiled);
  return compiled;
}

/** Split `text` into plain and highlighted runs. The runs join back to `text` exactly. */
export function highlightMultiColorSegments(text: string | null | undefined, terms: readonly HighlightTerm[]): HighlightSegment[] {
  const source = String(text ?? "");
  if (!source || terms.length === 0) return [{ text: source, term: null }];
  const { regex, groupTerm } = compile(terms);
  if (!regex) return [{ text: source, term: null }];
  regex.lastIndex = 0;
  const out: HighlightSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    if (m[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    let term: number | null = null;
    for (let g = 1; g < m.length; g += 1) {
      if (m[g] !== undefined) {
        term = groupTerm[g - 1];
        break;
      }
    }
    if (m.index > last) out.push({ text: source.slice(last, m.index), term: null });
    out.push({ text: m[0], term });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ text: source.slice(last), term: null });
  return out.length ? out : [{ text: source, term: null }];
}

/** How many times each term occurs in the texts (index = term index). */
export function countTermMatches(texts: ReadonlyArray<string | null | undefined>, terms: readonly HighlightTerm[]): number[] {
  const counts = terms.map(() => 0);
  for (const t of texts) {
    for (const seg of highlightMultiColorSegments(t, terms)) {
      if (seg.term !== null) counts[seg.term] += 1;
    }
  }
  return counts;
}

function termRegex(term: Pick<HighlightTerm, "label" | "kind">): RegExp | null {
  const source = termPatternSource(term);
  return source ? new RegExp(source, "iu") : null;
}

/**
 * Does a row whose searchable fields are `fields` match the query? Fields are
 * joined, so «تجارية جدة» matches a row with «التجارية» in its name and
 * «جدة» in its city. An empty query matches everything; an excluded term in
 * any field drops the row.
 */
export function matchesQuery(fields: ReadonlyArray<string | null | undefined>, parsed: ParsedHighlightQuery): boolean {
  return compileQueryMatcher(parsed)(fields);
}

/**
 * matchesQuery with the patterns built once: a list that filters thousands of
 * rows on every keystroke (the circuits directory, 2,192 rows) calls the
 * returned function per row instead of rebuilding a RegExp per term per row.
 */
export function compileQueryMatcher(parsed: ParsedHighlightQuery): (fields: ReadonlyArray<string | null | undefined>) => boolean {
  const excluded = parsed.excluded.map(termRegex).filter((re): re is RegExp => re !== null);
  const included = parsed.terms.map(termRegex);
  const groups = parsed.groups;
  return (fields) => {
    const hay = fields.filter((f) => typeof f === "string" && f).join("\n");
    for (const re of excluded) {
      if (re.test(hay)) return false;
    }
    if (groups.length === 0) return true;
    const hits = included.map((re) => (re ? re.test(hay) : false));
    return groups.some((group) => group.every((i) => hits[i]));
  };
}

/**
 * A reader link that carries the search: `?q=` added (or replaced) with the
 * `#hash` kept last, so `/precedents/x#p12` + «عزل» → `/precedents/x?q=عزل#p12`.
 * An empty query returns the href unchanged.
 */
export function withSearchQuery(href: string, query: string | null | undefined, param = "q"): string {
  const q = String(query ?? "").trim();
  if (!q) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const base = hashAt === -1 ? href : href.slice(0, hashAt);
  const qAt = base.indexOf("?");
  const path = qAt === -1 ? base : base.slice(0, qAt);
  const params = new URLSearchParams(qAt === -1 ? "" : base.slice(qAt + 1));
  params.set(param, q);
  return `${path}?${params.toString()}${hash}`;
}
