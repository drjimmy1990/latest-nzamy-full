/**
 * The /laws catalogue's local filters (BUG-LIB-03, S1 Task 11): the cards the
 * page lists before a server search starts (0–1 characters typed, and demo
 * mode) match with the library grammar, never a literal `includes`: «الاثبات»
 * finds «نظام الإثبات», and «نظام -الإثبات» drops it.
 *
 * The matcher is built once per query (the page calls this for every card on
 * every render) and reused until the query changes.
 */
import { compileQueryMatcher, parseHighlightQuery } from "../../lib/search/multiColorSearch.ts";

type Matcher = (fields: ReadonlyArray<string | null | undefined>) => boolean;

let lastQuery: string | null = null;
let lastMatcher: Matcher = () => true;

/** Does a card whose searchable fields are `fields` match the catalogue query `q`? */
export function catalogueMatches(q: string, fields: ReadonlyArray<string | null | undefined>): boolean {
  if (q !== lastQuery) {
    lastQuery = q;
    lastMatcher = compileQueryMatcher(parseHighlightQuery(q));
  }
  return lastMatcher(fields);
}
