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
 * (ministry departments) — neither hears a case — and, since the source file
 * files some administrative units under court categories (review M1), every
 * row whose name names no court («محكم» / «دائر» / «ديوان») or starts like an
 * office («إدارة»، «وكالة»، «وكيل»، «سكرتارية»، «مركز»، «شؤون»، «أخبار»).
 * Names that repeat (one per city) are offered once.
 *
 * Each kept row carries its CLASSIFICATION (`directoryCourtClass`, review
 * I1): one of the 14, from the row's category, or — for the mixed
 * «محاكم ودوائر قضائية» group — from its name. The picker saves it beside the
 * name as `metadata.courtClass`, and courtClassOf (courtTypes.ts) reads it,
 * so «محكمة الاستئناف بالرياض» is an appeal case on the board, not «ابتدائي».
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
  /** One of COURT_CHOICES, or null when neither the category nor the name says. */
  courtClass: string | null;
}

export type CourtOption =
  | { kind: "type"; value: string }
  | { kind: "directory"; value: string; city: string; category: string; courtClass: string | null };

/** Directory categories that are not courts. */
export const NON_COURT_CATEGORIES: ReadonlySet<string> = new Set(["كتابة عدل", "إدارة وفروع الوزارة"]);

/** Hamza, ة/ه, ى/ي, harakat and tatweel folded, for the name rules below. */
export function foldCourtName(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

const COURT_WORD = /محكم|دائر|ديوان/;
const OFFICE_START = /^(ال)?ادار|^وكال|^وكيل|^سكرتاري|^مركز|^شؤون|^اخبار/;

/** A directory row a case can be filed at: it names a court and is not an office (review M1). */
export function isCourtRowName(name: string): boolean {
  const n = foldCourtName(name);
  return COURT_WORD.test(n) && !OFFICE_START.test(n);
}

/** Directory category → classification (the five that are one court type). */
const CATEGORY_CLASS: Readonly<Record<string, string>> = {
  "محكمة عامة": "المحكمة العامة",
  "محكمة جزائية": "المحكمة الجزائية",
  "محكمة تنفيذ": "محكمة التنفيذ",
  "استئناف": "محكمة الاستئناف",
  "محكمة تجارية": "المحكمة التجارية",
};

/**
 * Name rules for the mixed «محاكم ودوائر قضائية» group, on the folded name,
 * first match wins. A circuit is classed by the court it sits in («… بمحكمة
 * الأحوال الشخصية بالدمام»), which the name always carries.
 */
const NAME_CLASS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^المحكمه العليا/, "المحكمة العليا"],
  [/احوال الشخصيه|احوال شخصيه/, "محكمة الأحوال الشخصية"],
  [/جزائي/, "المحكمة الجزائية"],
  [/تنفيذ/, "محكمة التنفيذ"],
  [/تجاري/, "المحكمة التجارية"],
  [/عمالي/, "المحكمة العمالية"],
  [/المحكمه العامه|الدائره القضائيه|دائره قضائيه/, "المحكمة العامة"],
];

/**
 * The classification of one directory row (one of COURT_CHOICES), or null.
 * Any name that carries «استئناف» is an appeal court or one of its circuits,
 * whatever its category says (23 «الدائرة الجزائية … بمحكمة الاستئناف» rows
 * are filed under «محكمة جزائية»); otherwise the category decides, and the
 * mixed group falls to NAME_CLASS.
 */
export function directoryCourtClass(row: { name: string; category: string }): string | null {
  const n = foldCourtName(row.name);
  if (/استئناف/.test(n)) return "محكمة الاستئناف";
  const byCategory = CATEGORY_CLASS[row.category];
  if (byCategory) return byCategory;
  for (const [re, cls] of NAME_CLASS) if (re.test(n)) return cls;
  return null;
}

/** How many directory rows one search shows; the reader narrows by typing more. */
export const COURT_DIRECTORY_LIMIT = 30;

/** The directory rows a case can be filed at, one per name, in file order. */
export function courtDirectoryEntries(rows: readonly CourtDirectoryRow[]): CourtDirectoryEntry[] {
  const seen = new Set<string>();
  const out: CourtDirectoryEntry[] = [];
  for (const r of rows) {
    const name = (r.name ?? "").trim();
    if (!name || NON_COURT_CATEGORIES.has(r.category) || !isCourtRowName(name) || seen.has(name)) continue;
    seen.add(name);
    const category = r.category ?? "";
    out.push({ name, city: r.city ?? "", category, courtClass: directoryCourtClass({ name, category }) });
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
    out.push({ kind: "directory", value: e.name, city: e.city, category: e.category, courtClass: e.courtClass });
    n++;
  }
  return out;
}
