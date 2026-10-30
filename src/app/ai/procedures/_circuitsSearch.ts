/**
 * _circuitsSearch.ts — the search behind «الدوائر القضائية» and «الجهات
 * الحكومية» on /ai/procedures (owner notes ١٩ / ٢٠, live test LIVE-F13).
 * ─────────────────────────────────────────────────────────────────────────────
 * The box used to split the query on spaces and require every piece, so the
 * `+` of «التجارية + الرياض» became a "word" no row contains and every query
 * with an operator returned nothing. The grammar is now the platform's one
 * engine (src/lib/search/multiColorSearch.ts): space or `+` = AND, `/` = OR,
 * `"…"` = phrase, `word*` = prefix, `-word` = excluded, with Arabic folding.
 *
 * When nothing matches (owner note ١٩ §٣) the result also carries:
 *   - `unmatchedTerms`: the words no row contains at all (within the region /
 *     category already chosen);
 *   - `suggestions`: «هل تقصد؟» — up to 10 rows ranked by how many of the
 *     typed words they hold (excluded words still drop a row);
 *   - `mentionsProsecution`: the query names النيابة / تحقيق / ادعاء / أموال,
 *     which this Ministry-of-Justice directory has no row for — the page
 *     shows the public prosecution's own channels instead.
 *
 * Pure, relative imports only: `node --test` loads it directly.
 */

import {
  matchesQuery,
  parseHighlightQuery,
  termPatternSource,
  type HighlightTerm,
  type ParsedHighlightQuery,
} from "../../../lib/search/multiColorSearch.ts";
import { normalizeSearch } from "../../../utils/normalizeArabic.ts";

export const SUGGESTION_LIMIT = 10;

/** The supported syntax, shown under every search box on the page. */
export const SEARCH_SYNTAX_HINT = "+ أو مسافة للجمع · / للاختيار · - للاستبعاد · «عبارة كاملة» بين علامتي تنصيص · * لبداية الكلمة";

export interface CircuitSearchResult<T> {
  parsed: ParsedHighlightQuery;
  matches: T[];
  /** Positive words no row in scope contains. Empty when something matched. */
  unmatchedTerms: HighlightTerm[];
  /** «هل تقصد؟» rows, only when `matches` is empty and words were typed. */
  suggestions: T[];
  mentionsProsecution: boolean;
}

function termRegex(term: Pick<HighlightTerm, "label" | "kind">): RegExp | null {
  const source = termPatternSource(term);
  return source ? new RegExp(source, "iu") : null;
}

/** Folded stems that point at the public prosecution, not the MoJ (owner note ١٩ §٣). */
const PROSECUTION_STEMS = ["نيابه", "تحقيق", "ادعا", "اموال"];

export function queryMentionsProsecution(parsed: ParsedHighlightQuery): boolean {
  return parsed.terms.some((t) => {
    const folded = normalizeSearch(t.label).replace(/[ً-ْٰـ]/g, "");
    return PROSECUTION_STEMS.some((stem) => folded.includes(stem));
  });
}

/**
 * Filter `rows` (already narrowed by region / category) by `query`.
 * `fieldsOf` returns the searchable text of a row — the same text the page
 * highlights, so the filter and the highlight never disagree.
 */
export function searchRows<T>(
  rows: readonly T[],
  query: string,
  fieldsOf: (row: T) => ReadonlyArray<string | null | undefined>,
): CircuitSearchResult<T> {
  const parsed = parseHighlightQuery(query);
  const mentionsProsecution = queryMentionsProsecution(parsed);
  const matches = rows.filter((r) => matchesQuery(fieldsOf(r), parsed));
  if (matches.length > 0 || parsed.terms.length === 0) {
    return { parsed, matches, unmatchedTerms: [], suggestions: [], mentionsProsecution };
  }

  const termRes = parsed.terms.map(termRegex);
  const excludedRes = parsed.excluded.map(termRegex).filter((r): r is RegExp => r !== null);
  const seen = parsed.terms.map(() => false);
  const scored: { row: T; score: number; index: number }[] = [];
  rows.forEach((row, index) => {
    const hay = fieldsOf(row).filter((f): f is string => typeof f === "string" && f.length > 0).join("\n");
    let score = 0;
    termRes.forEach((re, i) => {
      if (re && re.test(hay)) {
        score += 1;
        seen[i] = true;
      }
    });
    if (score === 0) return;
    if (excludedRes.some((re) => re.test(hay))) return;
    scored.push({ row, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return {
    parsed,
    matches,
    unmatchedTerms: parsed.terms.filter((_, i) => !seen[i]),
    suggestions: scored.slice(0, SUGGESTION_LIMIT).map((s) => s.row),
    mentionsProsecution,
  };
}

/** The fields one circuit row is searched (and highlighted) on. */
export interface CircuitSearchFields {
  name: string;
  category: string;
  city: string;
  region: string;
  email: string;
}

export const circuitFields = (r: CircuitSearchFields) => [r.name, r.category, r.city, r.region, r.email];
