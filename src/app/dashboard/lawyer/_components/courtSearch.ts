/**
 * courtSearch — the search behind the case form's court field (owner q351:
 * «بحث فوري في شجرة المحاكم كاملة، مع «أخرى» ونص حر»).
 *
 * Two kinds of answer, in this order:
 *   1. the 14 court CLASSIFICATIONS of courtTypes.ts (COURT_CHOICES). These
 *      are listed first on purpose: the cases board files a case by the exact
 *      string (`courtToDegree`, the court filter), so a classification keeps
 *      the case under its degree and inside every court filter;
 *   2. the named courts and circuits of the Ministry of Justice directory
 *      (src/data/circuits-directory.json, the same file the procedures guide
 *      lists). A pick from here is saved as its name, exactly as a typed
 *      «أخرى» name is saved today — the board shows it, but files it as
 *      «ابتدائي» because the name is not one of the 14 classifications.
 *
 * Left out of the directory: «كتابة عدل» (notaries) and «إدارة وفروع الوزارة»
 * (ministry departments) — neither hears a case. Names that repeat (6 in the
 * file, one per city) are offered once: the saved value is the name only.
 *
 * Matching is the platform's one query grammar (multiColorSearch.ts): hamza,
 * ة/ه, ى/ي and digit folding, several words AND-ed across name + city.
 *
 * Pure, relative imports only: `node --test` loads it directly.
 */

import { compileQueryMatcher, parseHighlightQuery } from "../../../../lib/search/multiColorSearch.ts";
import { COURT_CHOICES } from "./courtTypes.ts";

/** One row of circuits-directory.json, the fields this search reads. */
export interface CourtDirectoryRow {
  name: string;
  category: string;
  city: string;
  region?: string;
}

export interface CourtDirectoryEntry {
  name: string;
  city: string;
  category: string;
}

export type CourtOption =
  | { kind: "type"; value: string }
  | { kind: "directory"; value: string; city: string; category: string };

/** Directory categories that are not courts. */
export const NON_COURT_CATEGORIES: ReadonlySet<string> = new Set(["كتابة عدل", "إدارة وفروع الوزارة"]);

/** How many directory rows one search shows; the reader narrows by typing more. */
export const COURT_DIRECTORY_LIMIT = 30;

/** The directory rows a case can be filed at, one per name, in file order. */
export function courtDirectoryEntries(rows: readonly CourtDirectoryRow[]): CourtDirectoryEntry[] {
  const seen = new Set<string>();
  const out: CourtDirectoryEntry[] = [];
  for (const r of rows) {
    const name = (r.name ?? "").trim();
    if (!name || NON_COURT_CATEGORIES.has(r.category) || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, city: r.city ?? "", category: r.category ?? "" });
  }
  return out;
}

/**
 * The options for one query: matching classifications first (all 14 for an
 * empty query), then up to `limit` matching directory courts (none for an
 * empty query — 1,900 names are not a list to scroll). A directory name equal
 * to a classification is not repeated.
 */
export function searchCourtOptions(
  query: string,
  directory: readonly CourtDirectoryEntry[],
  limit: number = COURT_DIRECTORY_LIMIT,
): CourtOption[] {
  const q = query.trim();
  const choices = COURT_CHOICES as readonly string[];
  if (!q) return choices.map((value) => ({ kind: "type" as const, value }));
  const matches = compileQueryMatcher(parseHighlightQuery(q));
  const out: CourtOption[] = choices
    .filter((value) => matches([value]))
    .map((value) => ({ kind: "type" as const, value }));
  let n = 0;
  for (const e of directory) {
    if (n >= limit) break;
    if (choices.includes(e.name) || !matches([e.name, e.city])) continue;
    out.push({ kind: "directory", value: e.name, city: e.city, category: e.category });
    n++;
  }
  return out;
}
