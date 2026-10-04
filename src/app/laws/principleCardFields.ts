/**
 * principleCardFields — the court badge and year shown on a principle card.
 *
 * Owner test 2026-09-28 (T28-04): every card carried «م ع» (المحكمة العليا),
 * including principles from ديوان المظالم, and a missing year was filled with
 * a made-up 1445هـ — printed next to the year already inside the reference
 * («… لعام ١٤٢٨هـ … 1445هـ»). Both now come from the row or are left empty.
 *
 * Pure, no imports: loaded by `node --test` (principleCardFields.test.ts).
 */

/** The four badges the owner asked for, keyed by the court text we hold. */
const COURT_BADGES: Array<{ match: RegExp; abbr: string }> = [
  { match: /المحكمة\s+العليا|المحكمه\s+العليا/, abbr: "م ع" },
  { match: /ديوان\s+المظالم|المحكمة\s+الإدارية|المحاكم\s+الإدارية/, abbr: "د م" },
  { match: /المجلس\s+الأعلى\s+للقضاء|مجلس\s+القضاء/, abbr: "م س" },
  { match: /لجنة|لجان/, abbr: "ل ج" },
];

/** Badge for a court/issuing-body string, or "" when it is not one of the four. */
export function courtBadge(court: string | null | undefined): string {
  const text = (court ?? "").trim();
  if (!text) return "";
  for (const { match, abbr } of COURT_BADGES) {
    if (match.test(text)) return abbr;
  }
  return "";
}

/**
 * The Hijri year to print beside the reference, or "" when there is none —
 * or when the reference already names a year (it would be printed twice).
 */
export function principleYear(
  year: number | string | null | undefined,
  ref: string | null | undefined,
): string {
  const y = year == null ? "" : String(year).trim();
  if (!y || y === "0") return "";
  const r = ref ?? "";
  if (/لعام|عام\s*[0-9٠-٩]{4}|[0-9٠-٩]{4}\s*هـ/.test(r)) return "";
  return y;
}
