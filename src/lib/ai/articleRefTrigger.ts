/**
 * articleRefTrigger.ts — N06-40..43 (batch l11): the «@مادة» / «[[» shortcut
 * in the memo, contract and case editors. Typing «[[نظام العمل ٨٠» or
 * «@مادة ٨٠ نظام العمل» opens a short list of library laws; a pick replaces
 * what was typed with the reference «المادة (٨٠) من نظام العمل», after the
 * library confirmed the article exists (the reader's citations lookup: titles
 * and numbers only, never text, nothing counted).
 *
 * N11 (batch l12): both lookups go to the tool's own endpoint,
 * GET /api/v1/ai/article-ref (./articleRefLookup.ts) — titles and numbers
 * only, no per-account library lock — so a firm, business or individual
 * account can check an article inside a tool it may use.
 *
 * Pure: `node --test` runs articleRefTrigger.test.ts.
 */
import { articleRefCheckUrl, articleRefLawsUrl } from "./articleRefLookup.ts";

/** The longest stretch looked back from the cursor for a trigger. */
export const TRIGGER_LOOKBACK = 80;
const TRIGGERS = ["[[", "@مادة", "@ماده"] as const;

export interface RefTrigger {
  /** Where the trigger starts: the pick replaces [start, caret). */
  start: number;
  /** What was typed after it. */
  query: string;
}

/** The trigger the cursor is in, or null: same line, within TRIGGER_LOOKBACK, not closed by «]]». */
export function findTrigger(value: string, caret: number | null | undefined): RefTrigger | null {
  if (typeof value !== "string") return null;
  const end = typeof caret === "number" && caret >= 0 && caret <= value.length ? caret : value.length;
  const from = Math.max(0, end - TRIGGER_LOOKBACK);
  const window = value.slice(from, end);
  let best: { at: number; len: number } | null = null;
  for (const t of TRIGGERS) {
    const at = window.lastIndexOf(t);
    if (at >= 0 && (!best || at > best.at)) best = { at, len: t.length };
  }
  if (!best) return null;
  const query = window.slice(best.at + best.len);
  if (/[\n\r]|\]\]/.test(query)) return null;
  // «@مادة» must start a word: «email@مادة» is not a trigger.
  const before = window.slice(0, best.at);
  if (window.startsWith("@", best.at) && /[\p{L}\p{N}]$/u.test(before)) return null;
  return { start: from + best.at, query: query.replace(/^\s+/, "") };
}

const DIGITS = /[0-9٠-٩۰-۹]+/;
const toAscii = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** «نظام العمل ٨٠» / «٨٠ من نظام العمل» / «المادة 80 نظام العمل» → { number: 80, lawQuery: "نظام العمل" }. */
export function parseRefQuery(query: string): { number: number | null; lawQuery: string } {
  const m = DIGITS.exec(query);
  const n = m ? Number(toAscii(m[0])) : NaN;
  const number = Number.isInteger(n) && n > 0 && n <= 9999 ? n : null;
  const lawQuery = query
    .replace(DIGITS, " ")
    .replace(/[()\[\]«»"،,.:؛]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(?:ال)?ماد(?:ة|ه)$|^م$|^من$|^رقم$/.test(w))
    .join(" ")
    .trim();
  return { number, lawQuery };
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arabicNumber = (n: number) => String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);

/** The text a pick inserts. */
export function referenceText(lawTitle: string, number: number | null): string {
  const title = lawTitle.trim();
  return number ? `المادة (${arabicNumber(number)}) من ${title}` : title;
}

/** What was typed from the trigger to the cursor, replaced by `text`. */
export function replaceTrigger(value: string, start: number, caret: number, text: string): { value: string; caret: number } {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(caret, value.length));
  const next = value.slice(0, s) + text + value.slice(e);
  return { value: next, caret: s + text.length };
}

export interface LawOption {
  slug: string;
  title: string;
  lawType: string | null;
}

/**
 * The laws of the tool's own lookup (N11, batch l12: GET /api/v1/ai/article-ref
 * answers `{ laws: [{slug, title, lawType}] }`), or of the library
 * autocomplete's top matches (`topMatches`, the older source).
 */
export function lawOptions(body: unknown, max = 6): LawOption[] {
  const laws = (body as { laws?: unknown } | null)?.laws;
  if (Array.isArray(laws)) {
    return laws
      .map((t) => (t ?? {}) as Record<string, unknown>)
      .filter((r) => typeof r.slug === "string" && r.slug && typeof r.title === "string" && r.title.trim())
      .slice(0, max)
      .map((r) => ({ slug: r.slug as string, title: (r.title as string).trim(), lawType: typeof r.lawType === "string" ? r.lawType : null }));
  }
  const top = (body as { topMatches?: unknown } | null)?.topMatches;
  if (!Array.isArray(top)) return [];
  const out: LawOption[] = [];
  const seen = new Set<string>();
  for (const t of top) {
    const r = (t ?? {}) as Record<string, unknown>;
    if (r.section !== "laws" || typeof r.slug !== "string" || !r.slug || typeof r.title !== "string" || !r.title.trim()) continue;
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    out.push({ slug: r.slug, title: r.title.trim(), lawType: typeof r.lawType === "string" ? r.lawType : null });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The check of one article of a known law — numbers only. N11 (batch l12):
 * the TOOL's endpoint (no per-account library lock, nothing counted), not the
 * reader's citations route.
 */
export function articleCheckUrl(slug: string, number: number): string {
  return articleRefCheckUrl(slug, number);
}

/** N11: the tool's law search (titles only). */
export function lawSearchUrl(query: string): string {
  return articleRefLawsUrl(query);
}

/** True when the lookup found that article number. */
export function articleFound(body: unknown, number: number): boolean {
  const articles = (body as { articles?: unknown } | null)?.articles;
  return Array.isArray(articles) && articles.some((a) => (a as { number?: unknown } | null)?.number === number);
}
