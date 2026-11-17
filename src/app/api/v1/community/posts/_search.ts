/**
 * Server search over community posts (owner TODO N05-C8) — pure, so
 * `node --test` can import it.
 *
 * The index side is `community_posts.search_fts`
 * (supabase/migrations/20261125_53_community_votes_saves_best.sql):
 * to_tsvector('simple', community_fold(title || ' ' || body)). community_fold
 * is normalizeSearch() + stripTashkeel() written in SQL, so the query below is
 * folded by the same rules before it reaches the database: أ/إ/آ → ا, ة → ه,
 * ى → ي, tashkeel and tatweel out, Arabic-Indic digits → 0-9, lower case.
 *
 * The config is 'simple' — LIBRARY_FTS_CONFIG, the one the library search uses
 * (never the schema-qualified `library.arabic`, which PostgREST cannot parse).
 *
 * Each word becomes an OR of its article forms (prefixForms — «قرار» also
 * finds «القرار», «بالقرار», «للقرار») with a prefix match (`:*`), and the
 * words are ANDed. Only Arabic letters, a-z and 0-9 survive into a word, so no
 * tsquery operator (`& | ! ( ) : * '` …) a visitor types can reach to_tsquery.
 */

import { normalizeSearch, prefixForms, stripTashkeel } from "../../../../../utils/normalizeArabic.ts";

export const COMMUNITY_SEARCH_CONFIG = "simple";

/** At most this many words of one query are searched. */
export const MAX_SEARCH_WORDS = 8;
/** A longer word is cut to this many characters (a prefix match still finds it). */
export const MAX_SEARCH_WORD_LENGTH = 40;

/** Arabic letters (hamza … yaa, tatweel excluded by stripTashkeel), a-z, 0-9. */
const NOT_A_WORD_CHAR = /[^ء-غف-يa-z0-9]+/;

/** The folded words of a query, in order, de-duplicated. */
export function communitySearchWords(raw: string | null | undefined): string[] {
  const folded = normalizeSearch(stripTashkeel(String(raw ?? "")));
  const words: string[] = [];
  for (const part of folded.split(NOT_A_WORD_CHAR)) {
    const word = Array.from(part).slice(0, MAX_SEARCH_WORD_LENGTH).join("");
    if (word && !words.includes(word)) words.push(word);
    if (words.length >= MAX_SEARCH_WORDS) break;
  }
  return words;
}

/**
 * The to_tsquery text for `.textSearch("search_fts", …, { config: "simple" })`,
 * or `null` when nothing searchable is left (the caller answers "no results").
 */
export function buildCommunityTsQuery(raw: string | null | undefined): string | null {
  const words = communitySearchWords(raw);
  if (words.length === 0) return null;
  return words
    .map((word) => {
      const forms = prefixForms(word).filter((f) => !NOT_A_WORD_CHAR.test(f));
      const alternatives = (forms.length > 0 ? forms : [word]).map((f) => `${f}:*`);
      return alternatives.length === 1 ? alternatives[0] : `(${alternatives.join(" | ")})`;
    })
    .join(" & ");
}

export type CommunitySort = "hot" | "new" | "top";

/** The feed's three sorts, read from `?sort=`. Anything else is «الأحدث». */
export function communitySortFor(raw: string | null | undefined): CommunitySort {
  return raw === "hot" || raw === "top" ? raw : "new";
}

/** The ORDER BY of each sort: [column, ascending]… — newest breaks ties. */
export function communitySortColumns(sort: CommunitySort): Array<[string, boolean]> {
  if (sort === "hot") return [["vote_count", false], ["created_at", false]];
  if (sort === "top") return [["answer_count", false], ["created_at", false]];
  return [["created_at", false]];
}
