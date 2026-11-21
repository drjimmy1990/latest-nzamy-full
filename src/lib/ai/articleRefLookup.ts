/**
 * articleRefLookup.ts — N11 (batch l12; the owner's RAW[55]): the «@مادة» /
 * «[[» helper inside the drafter, contracts and case notes looks up laws and
 * article numbers through a TOOL-SCOPED endpoint, GET /api/v1/ai/article-ref,
 * instead of the library's own autocomplete and citations routes. Those apply
 * the per-account library lock, so a firm, business or individual account
 * (library closed for its type) could not check an article in a tool it may
 * use. The tool endpoint answers law titles and article NUMBERS only — never
 * text — to a signed-in account, with no account lock and nothing counted
 * against any reading cap; the library's closed switch still applies.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const ARTICLE_REF_PATH = "/api/v1/ai/article-ref";
export const ARTICLE_REF_MAX_LAWS = 6;
/** Rows read before ranking (a short query matches many titles). */
export const ARTICLE_REF_READ_ROWS = 40;
export const ARTICLE_REF_QUERY_MAX = 80;

/** The tool's law search URL. */
export function articleRefLawsUrl(query: string): string {
  return `${ARTICLE_REF_PATH}?q=${encodeURIComponent(query)}`;
}

/** The tool's check of one article number in a known law. */
export function articleRefCheckUrl(slug: string, number: number): string {
  return `${ARTICLE_REF_PATH}?law=${encodeURIComponent(slug)}&n=${number}`;
}

/**
 * The typed law words → one ILIKE pattern that every spelling matches:
 * diacritics and tatweel dropped, anything but letters, digits and spaces
 * dropped (so % _ \ never come from the user), the alef / hamza forms as
 * `_`, «ة/ه» and «ى/ي» at a word's end as `_`, the words joined by `%` and
 * wrapped in `%`. null for fewer than two letters.
 */
export function articleRefLawPattern(query: unknown): string | null {
  const clean = String(query ?? "")
    .slice(0, ARTICLE_REF_QUERY_MAX)
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.replace(/\s/g, "").length < 2) return null;
  const words = clean.split(" ").filter(Boolean).slice(0, 6);
  return `%${words.map((w) => w.replace(/[اأإآٱؤئء]/g, "_").replace(/[ةهىي]$/, "_")).join("%")}%`;
}

export interface ArticleRefLaw {
  slug: string;
  title: string;
  lawType: string | null;
}

/** Rows → the options, best first: a title that starts with the query, then the shorter title. */
export function rankArticleRefLaws(rows: unknown, query: string, max = ARTICLE_REF_MAX_LAWS): ArticleRefLaw[] {
  if (!Array.isArray(rows)) return [];
  const q = String(query ?? "").trim();
  const seen = new Set<string>();
  const out: ArticleRefLaw[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    if (!r || typeof r.slug !== "string" || !r.slug || typeof r.title !== "string" || !r.title.trim() || seen.has(r.slug)) continue;
    seen.add(r.slug);
    out.push({ slug: r.slug, title: r.title.trim(), lawType: typeof r.type === "string" ? r.type : null });
  }
  return out
    .sort((a, b) => Number(b.title.startsWith(q)) - Number(a.title.startsWith(q)) || a.title.length - b.title.length)
    .slice(0, max);
}

/** «80» → 80: one article number, 1..9999, else null. */
export function articleRefNumber(value: unknown): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n > 0 && n <= 9999 ? n : null;
}

/** A law slug as the helper sends it: 1–200 chars, no control characters. */
export function articleRefSlug(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s && s.length <= 200 && !/[\u0000-\u001F\u007F]/.test(s) ? s : null;
}
