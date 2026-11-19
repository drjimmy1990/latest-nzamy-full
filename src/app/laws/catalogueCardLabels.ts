/**
 * catalogueCardLabels — the words on a /laws law card that owner note ١٢
 * (2026-10-30) asked for:
 *
 *   ١٢-٤  a prominent merged-file badge instead of the faint 8.5px chip, and no
 *         fixed «مُحدّث» badge on every card;
 *   ١٢-٥  the merged file's name: «الأصل + فرعي ١ + فرعي ٢ + N أخرى»;
 *   ١٢-٦  «آخر تحديث تشريعي: …هـ» in the card footer (owner ٣١٧/٣١٨: the one
 *         public date, the date alone).
 *
 * Pure, no imports: `node --test src/app/laws/catalogueCardLabels.test.ts`.
 */

function text(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/**
 * ١٢-٤ / BUG-LIB-07 (owner q382) — the merged-file badge: the one word
 * «مدمج», or "" for a law with nothing merged. Owner 2026-11-07: in the grid
 * card it sits in the top row beside «متاح», not alone under the title; the
 * subsidiary names are the grey line below the title (mergedIncludesLine).
 */
export function mergedFileBadge(hasMerged: unknown): string {
  return hasMerged === true ? "مدمج" : "";
}

/**
 * ١٢-٥ — the merged file's name: the base law + at most two subsidiary
 * instruments + «+ N أخرى». A subsidiary name that repeats the base title
 * («اللائحة التنفيذية لنظام المرافعات الشرعية» under «نظام المرافعات
 * الشرعية») drops the repetition («اللائحة التنفيذية»). Blank and duplicate
 * names are skipped. With no subsidiary names the base title is returned as
 * it is.
 *
 * Not on the card: owner 2026-11-07 chose the «يشتمل على: A • B» line
 * (mergedIncludesLine) over this «+» name.
 */
export function mergedFileName(baseTitle: unknown, subsidiaryNames: readonly unknown[] = [], maxShown = 2): string {
  const base = text(baseTitle);
  const subs = subsidiaryNamesUnderBase(base, subsidiaryNames);
  if (subs.length === 0) return base;
  const shown = subs.slice(0, Math.max(0, maxShown));
  const rest = subs.length - shown.length;
  return [base, ...shown].filter(Boolean).join(" + ") + (rest > 0 ? ` + ${rest} أخرى` : "");
}

/**
 * The subsidiary names, trimmed, blank and duplicate ones skipped, each without
 * a trailing repeat of the base title («… لنظام المرافعات الشرعية» under that
 * law → «…»). Shared by mergedFileName and mergedIncludesLine.
 */
function subsidiaryNamesUnderBase(base: string, subsidiaryNames: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const subs: string[] = [];
  for (const raw of Array.isArray(subsidiaryNames) ? subsidiaryNames : []) {
    let name = text(raw);
    if (!name) continue;
    if (base && name.endsWith(` ل${base}`)) name = name.slice(0, -(base.length + 2)).trim();
    else if (base && name.endsWith(` ${base}`)) name = name.slice(0, -(base.length + 1)).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    subs.push(name);
  }
  return subs;
}

/** The owner's cap on the names in the «يشتمل على» line (2026-11-07, q424). */
export const MERGED_INCLUDES_MAX = 2;

/**
 * Owner 2026-11-07 (screenshot 1): the grey line under a merged law's title —
 * «يشتمل على: [اسم اللائحة الأولى] • [اسم اللائحة الثانية]». At most two
 * names, joined by « • »; the merged names past those two are counted on the
 * same line, «+ N أخرى» (the convention of mergedFileName). The base title is
 * not repeated (it is the card's title, just above), and a name that ends
 * with it drops the repetition, as in mergedFileName. "" when there is no
 * name — the card then shows no line. The names come from
 * library.laws.merged_regulation_names (migration 20261107_10), already
 * cleaned of decree numbers and dates for a non-subscriber by the API.
 *
 * Batch l10: «+N تشريعات فرعية» is no longer this line's overflow. The
 * library agent's §1.8 and our file 18 بند 5 define that counter as the
 * documents linked by `parent_law_id`, and keep the two mechanisms apart
 * («ولا تُخلط الآليتان»): see subLegislationCountLabel.
 */
export function mergedIncludesLine(baseTitle: unknown, subsidiaryNames: readonly unknown[] = []): string {
  const all = subsidiaryNamesUnderBase(text(baseTitle), subsidiaryNames);
  const subs = all.slice(0, MERGED_INCLUDES_MAX);
  if (subs.length === 0) return "";
  const rest = all.length - subs.length;
  return `يشتمل على: ${subs.join(" • ")}` + (rest > 0 ? ` + ${rest} أخرى` : "");
}

/**
 * Library agent §1.8 (19 Nov 2026) / file 16 §7: «+N تشريعات فرعية» — how
 * many documents name this law in their `parent_law_id` (/api/library/init's
 * `sub_legislation_count`, counted by the law page's own rule). "" for 0 or
 * anything that is not a positive whole number. Arabic number agreement:
 * 1 «تشريع فرعي», 2 «تشريعان فرعيان», 3–10 «تشريعات فرعية», 11+ «تشريعًا
 * فرعيًا».
 */
export function subLegislationCountLabel(count: unknown): string {
  const n = typeof count === "number" && Number.isInteger(count) ? count : 0;
  if (n <= 0) return "";
  const noun = n === 1 ? "تشريع فرعي" : n === 2 ? "تشريعان فرعيان" : n <= 10 ? "تشريعات فرعية" : "تشريعًا فرعيًا";
  return `+${n} ${noun}`;
}

/** «1448/01/08هـ» → 14480108 (digits only), for comparing two Hijri dates. */
function dateDigits(v: unknown): string {
  const t = text(v).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const m = /(\d{3,4})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})/.exec(t);
  return m ? `${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}` : "";
}

export interface LawCardDates {
  /** «آخر تحديث تشريعي: 1448/01/08هـ», or "" when the API sent none. */
  update: string;
  /** «صدر: …» — a subscriber's line only, and only when it is not the same date. */
  issued: string;
}

/**
 * ١٢-٦ — the card footer dates. `latestUpdate` is
 * /api/library/init's `latest_legislative_update` (everyone, the date alone);
 * `issueDate` is the issue date a subscriber receives (a guest's list never
 * carries it — and `officialMetaLocked` hides it anyway).
 */
export function lawCardDates(latestUpdate: unknown, issueDate: unknown, officialMetaLocked: boolean): LawCardDates {
  const upd = text(latestUpdate);
  const update = upd && upd !== "—" ? `آخر تحديث تشريعي: ${upd}` : "";
  const iss = text(issueDate);
  if (officialMetaLocked || !iss || iss === "—") return { update, issued: "" };
  if (upd && dateDigits(upd) && dateDigits(upd) === dateDigits(iss)) return { update, issued: "" };
  return { update, issued: `صدر: ${iss}` };
}
