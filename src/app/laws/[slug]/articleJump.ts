/**
 * «انتقل إلى مادة» — the law reader's sidebar box (BUG-LIB-04, S1 Task 11).
 *
 * The box NAVIGATES: it lists the articles a reader means by a number
 * («١٢», «12») or a locator / title («الثامنة», «تعريفات»), and a click jumps
 * there. It never searches article text — the one search bar of the reader is
 * ScopedSearchPanel (server-side, the library grammar, the read quota).
 *
 * A query that is only a number matches that number exactly (article 12, not
 * 112 or 120): against `number`, else a whole number inside `num` /
 * `numberText`. Any other query goes through the library's highlight grammar
 * (compileQueryMatcher(parseHighlightQuery(q))) over `num`, `numberText` and
 * `title` only. Pure: `node --test` loads it directly.
 */
import { toWesternDigits } from "../../../utils/normalizeArabic.ts";
import { compileQueryMatcher, parseHighlightQuery } from "../../../lib/search/multiColorSearch.ts";
import type { LawArticle } from "../data.ts";

export type JumpArticle = Pick<LawArticle, "id" | "num" | "number" | "numberText" | "title">;

/** Whole Western-digit runs in a text («المادة ١٢» → ["12"]). */
function numbersIn(text: string | null | undefined): string[] {
  return toWesternDigits(String(text ?? "")).match(/\d+/g) ?? [];
}

/** The ids of the articles the jump box query names, in article order. */
export function matchArticleJump(query: string, articles: readonly JumpArticle[]): string[] {
  const q = String(query ?? "").trim();
  if (!q) return [];
  const digits = toWesternDigits(q);
  if (/^\d+$/.test(digits)) {
    const wanted = String(Number(digits));
    return articles
      .filter((a) => {
        if (a.number !== null && a.number !== undefined && String(a.number).trim() !== "") {
          return numbersIn(String(a.number)).some((n) => String(Number(n)) === wanted);
        }
        return [...numbersIn(a.num), ...numbersIn(a.numberText)].some((n) => String(Number(n)) === wanted);
      })
      .map((a) => a.id);
  }
  const parsed = parseHighlightQuery(q);
  if (parsed.terms.length === 0) return [];
  const matches = compileQueryMatcher(parsed);
  return articles.filter((a) => matches([a.num, a.numberText ?? null, a.title])).map((a) => a.id);
}
