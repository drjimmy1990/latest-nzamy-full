/**
 * circuitsDirectoryFilter — the filter behind the one shared directory of
 * Ministry of Justice e-mails (src/data/circuits-directory.json, 2,192 rows;
 * owner note ٠٧).
 *
 * The search box runs the platform's one query grammar (multiColorSearch.ts)
 * over ALL the searchable fields of a row at once — name, category, city,
 * region, e-mail — so «تنفيذ + الرياض» finds «محكمة التنفيذ» whose city is
 * «الرياض», and «جده» / «الاحوال» / «الدائرة 1» find «جدة» / «الأحوال» /
 * «الدائرة ١». The old pages tested `field.includes(wholeQuery)` one field at
 * a time, so any two-word query spanning two fields returned nothing.
 *
 * Note: a digit term has no word boundary — «الدائرة ١» also matches
 * «الدائرة ١٢» and «٣١», as the library's search does.
 *
 * Pure, relative imports only: `node --test` loads it directly.
 */

import { compileQueryMatcher, parseHighlightQuery } from "./multiColorSearch.ts";

export interface CircuitRow {
  id: string;
  name: string;
  category: string;
  region: string;
  city: string;
  email: string;
  needsVerification: boolean;
}

export type CircuitVerification = "all" | "verified" | "needsVerification";

export interface CircuitFilter {
  query?: string;
  /** Exact region, or "" / «الكل» for every region. */
  region?: string;
  /** Exact category, or "" / «الكل» for every category. */
  category?: string;
  verification?: CircuitVerification;
}

const ANY = new Set(["", "الكل"]);

/** The fields the search box reads, in one place (the highlight uses the same). */
export function circuitSearchFields(row: CircuitRow): string[] {
  return [row.name, row.category, row.city, row.region, row.email];
}

export function filterCircuits<T extends CircuitRow>(rows: readonly T[], filter: CircuitFilter): T[] {
  const parsed = parseHighlightQuery(filter.query ?? "");
  const matches = compileQueryMatcher(parsed);
  const region = filter.region ?? "";
  const category = filter.category ?? "";
  const verification = filter.verification ?? "all";
  return rows.filter((row) => {
    if (!ANY.has(region) && row.region !== region) return false;
    if (!ANY.has(category) && row.category !== category) return false;
    if (verification === "verified" && row.needsVerification) return false;
    if (verification === "needsVerification" && !row.needsVerification) return false;
    return matches(circuitSearchFields(row));
  });
}
