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

/** The title already names its regulation(s): the badge does not say it again. */
const TITLE_NAMES_REGULATION = /و(?:لائحته|لوائحه|قواعده|ضوابطه)(?:\s+التنفيذية)?/;

/**
 * ١٢-٤ — the merged-file badge, or "" for a law with nothing merged.
 *   `count` = how many subsidiary instruments are merged, when the data says
 *   (library.laws carries only the `has_merged_regulation` flag today, so the
 *   catalogue passes null and the badge names «اللائحة التنفيذية»).
 */
export function mergedFileBadge(hasMerged: unknown, count: number | null = null, title: unknown = ""): string {
  if (hasMerged !== true) return "";
  if (typeof count === "number" && Number.isFinite(count) && count >= 2) {
    return `📚 ملف مدمج · شامل ${count} ${count <= 10 ? "لوائح وقواعد" : "لائحة وقاعدة"}`;
  }
  if (TITLE_NAMES_REGULATION.test(text(title))) return "📚 ملف مدمج";
  return "📚 ملف مدمج · شامل اللائحة التنفيذية";
}

/**
 * ١٢-٥ — the merged file's name: the base law + at most two subsidiary
 * instruments + «+ N أخرى». A subsidiary name that repeats the base title
 * («اللائحة التنفيذية لنظام المرافعات الشرعية» under «نظام المرافعات
 * الشرعية») drops the repetition («اللائحة التنفيذية»). Blank and duplicate
 * names are skipped. With no subsidiary names the base title is returned as
 * it is.
 *
 * DATA-DEPENDENT: the names (merged_regulation_details) are not in the
 * database yet, and the wording of the first regulation is an open owner
 * question (note ١٢ §٥: full name or «لوائحه التنفيذية»). The card does not
 * call this until the data and the answer arrive.
 */
export function mergedFileName(baseTitle: unknown, subsidiaryNames: readonly unknown[] = [], maxShown = 2): string {
  const base = text(baseTitle);
  const seen = new Set<string>();
  const subs: string[] = [];
  for (const raw of subsidiaryNames) {
    let name = text(raw);
    if (!name) continue;
    if (base && name.endsWith(` ل${base}`)) name = name.slice(0, -(base.length + 2)).trim();
    else if (base && name.endsWith(` ${base}`)) name = name.slice(0, -(base.length + 1)).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    subs.push(name);
  }
  if (subs.length === 0) return base;
  const shown = subs.slice(0, Math.max(0, maxShown));
  const rest = subs.length - shown.length;
  return [base, ...shown].filter(Boolean).join(" + ") + (rest > 0 ? ` + ${rest} أخرى` : "");
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
