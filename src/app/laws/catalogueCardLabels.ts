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
 * law → «…»). Shared by mergedFileName and mergedIncludesLine, and (batch l10)
 * by the server's dedupe of linked children against the merged names
 * (src/app/api/library/laws/[slug]/_children.ts), so both compare one form.
 */
export function subsidiaryNamesUnderBase(base: string, subsidiaryNames: readonly unknown[]): string[] {
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
 * names, joined by « • ». The rest is counted on a line of its own
 * (mergedMoreLabel, owner file 16 §7, 19 Nov: «+4 تشريعات فرعية»). The base title is not repeated (it is the card's title, just above),
 * and a name that ends with it drops the repetition, as in mergedFileName.
 * "" when there is no name — the card then shows no line. The names come from
 * library.laws.merged_regulation_names (migration 20261107_10), already
 * cleaned of decree numbers and dates for a non-subscriber by the API.
 */
export function mergedIncludesLine(baseTitle: unknown, subsidiaryNames: readonly unknown[] = []): string {
  const subs = subsidiaryNamesUnderBase(text(baseTitle), subsidiaryNames).slice(0, MERGED_INCLUDES_MAX);
  return subs.length > 0 ? `يشتمل على: ${subs.join(" • ")}` : "";
}

/**
 * Owner file 16 §7 (19 Nov 2026, screenshot 06): the card counts the
 * sub-legislation it does not name — «+4 تشريعات فرعية» — under the two names
 * of mergedIncludesLine. "" when every name is already on the card. Arabic
 * number agreement: 1 «تشريع فرعي», 2 «تشريعان فرعيان», 3–10 «تشريعات
 * فرعية», 11+ «تشريعًا فرعيًا».
 *
 * Batch l10 (library agent §1.8): §7's sub-legislation is «لائحة تنفيذية،
 * قرارات وزارية…» — the regulations merged into the file AND the documents
 * that name it in their `parent_law_id`. `linkedChildren` is the latter,
 * already without the ones whose title is one of the merged names
 * (/api/library/init's `sub_legislation_count`), so nothing counts twice.
 */
export function mergedMoreLabel(baseTitle: unknown, subsidiaryNames: readonly unknown[] = [], linkedChildren: unknown = 0): string {
  const merged = Math.max(0, subsidiaryNamesUnderBase(text(baseTitle), subsidiaryNames).length - MERGED_INCLUDES_MAX);
  const linked = typeof linkedChildren === "number" && Number.isInteger(linkedChildren) && linkedChildren > 0 ? linkedChildren : 0;
  return subLegislationCountLabel(merged + linked);
}

/** «+N تشريعات فرعية» with Arabic number agreement; "" for 0 or anything that is not a positive whole number. */
export function subLegislationCountLabel(count: unknown): string {
  const more = typeof count === "number" && Number.isInteger(count) ? count : 0;
  if (more <= 0) return "";
  const noun = more === 1 ? "تشريع فرعي" : more === 2 ? "تشريعان فرعيان" : more <= 10 ? "تشريعات فرعية" : "تشريعًا فرعيًا";
  return `+${more} ${noun}`;
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

/**
 * How a sub-legislation is named under a /laws card — the admin setting
 * library_reader_display.child_names (readerDisplaySettings.ts):
 *   "auto"  (owner Q172 (ب), 22 Nov, the default): short («اللائحة التنفيذية»)
 *           when the name only repeats the law's title, full when the short
 *           one would be ambiguous (shortSubLegislationName + the collision
 *           check in cardSubLegislationNames);
 *   "full"  the admin forces the full name («اللائحة التنفيذية لنظام المرور»);
 *   "short" the admin forces the old short form (subsidiaryNamesUnderBase).
 */
export type SubNameForm = "auto" | "full" | "short";

/** The API's display.childNameForm → the form; anything unknown (an older server, a missing field) is "auto". */
export function subNameFormOf(v: unknown): SubNameForm {
  return v === "full" || v === "short" ? v : "auto";
}

/**
 * A name in one comparable form: spaces collapsed and a detached «و »
 * joined to its word («المنافسات و المشتريات» → «المنافسات والمشتريات», as
 * the owner's titles spell it both ways). Harakat are kept: the short name
 * is cut from this form and shown as it is («عاشراً» stays «عاشراً»).
 */
export function normalizeLegislationName(v: unknown): string {
  return text(v)
    .normalize("NFC")
    .replace(/(^|\s)و\s+/g, "$1و")
    .replace(/\s+/g, " ")
    .trim();
}

/** The base title's forms a sub-legislation may repeat: as is, without «ولائحته التنفيذية», without a trailing «لعام 1447ه». */
function baseTitleForms(base: string): string[] {
  const forms = [base];
  const noRegulation = base.replace(/\s+ولائحته التنفيذية$/, "").trim();
  if (noRegulation && noRegulation !== base) forms.push(noRegulation);
  for (const f of [...forms]) {
    const noYear = f.replace(/\s+لعام\s+[\d٠-٩]{3,4}\s*هـ?(?:\s*\([^)]*\))?$/, "").trim();
    if (noYear && noYear !== f && !forms.includes(noYear)) forms.push(noYear);
  }
  return forms.filter((f) => f.length > 0);
}

/**
 * What may follow the repeated title and still be kept: a year, «المعدلة»,
 * «الصادرة …», a bracket — words that agree with the regulation (feminine).
 * A masculine «الصادر» / «المعدل» agrees with the LAW («… لنظام المرور الصادر
 * بالمرسوم…»): cut, it would say the regulation came by the law's decree, so
 * such a name stays full.
 */
const KEPT_TAIL = /^(?:\s+(?:لعام|المعدلة|الصادرة)(?:\s|$)|\s*\()/;
/** A word that names a law: the short name would point at another law, so the full one stays. */
const NAMES_A_LAW = /(?:^|\s)و?(?:لل|[بل]?(?:ال)?)(?:نظام|نظامي|تنظيم|قانون)(?=\s|$|[،,)])/;
/** A short name may not end on a word that waits for the title it lost. */
const DANGLING_END = /(?:^|\s)(?:و|أو|في|على|من|عن|إلى|الى|مع|بشأن|ب|ل)$/;

/**
 * Owner Q172 (ب): the short name of a sub-legislation under its law's card,
 * or null when it must stay full. Short only when the name repeats the law's
 * title after «ل» («اللائحة التنفيذية لنظام المرور» → «اللائحة التنفيذية»;
 * a year or «المعدلة» after the title is kept: «… لعام 1443ه» → «اللائحة
 * التنفيذية لعام 1443ه»). Null — the full name — when the title is not
 * repeated that way, when what is left still names a law («آلية العمل
 * التنفيذية لنظام القضاء ونظام ديوان المظالم»), or when it would end on a
 * dangling word. Ambiguity between two names is cardSubLegislationNames'.
 */
export function shortSubLegislationName(baseTitle: unknown, name: unknown): string | null {
  const base = normalizeLegislationName(baseTitle);
  const full = normalizeLegislationName(name);
  if (!base || !full || full === base) return null;
  for (const form of baseTitleForms(base)) {
    const needle = ` ل${form}`;
    const at = full.lastIndexOf(needle);
    if (at <= 0) continue;
    const tail = full.slice(at + needle.length);
    if (tail && !KEPT_TAIL.test(tail)) continue;
    const head = full.slice(0, at).trim();
    const short = tail ? `${head} ${tail.trim()}` : head;
    if (NAMES_A_LAW.test(short) || DANGLING_END.test(head)) return null;
    return short;
  }
  return null;
}

/**
 * File 03 L3 (batch l12): the sub-legislation names under a /laws card —
 * the regulations merged into the file first, then the linked documents
 * (/api/library/init `sub_legislation_titles`), duplicates once (compared
 * without the repeated base title, as the server's dedupe in _children.ts).
 * `form` is the admin setting library_reader_display.child_names:
 *   "auto"  (owner Q172 (ب), default) — each name short when it only repeats
 *           the law's title (shortSubLegislationName), but in full when its
 *           short form would read like another name on the same card (two
 *           sub-legislations shortening to one text, or a short form equal
 *           to another document's own title);
 *   "full"  every name in full;
 *   "short" the old short form, the repeated title dropped (subsidiaryNamesUnderBase).
 */
export function cardSubLegislationNames(
  baseTitle: unknown,
  mergedNames: readonly unknown[] = [],
  childTitles: readonly unknown[] = [],
  form: SubNameForm = "auto",
): string[] {
  const base = text(baseTitle);
  const all = [...(Array.isArray(mergedNames) ? mergedNames : []), ...(Array.isArray(childTitles) ? childTitles : [])];
  if (form === "short") return subsidiaryNamesUnderBase(base, all);
  const normBase = normalizeLegislationName(base);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of all) {
    const name = text(raw);
    if (!name || normalizeLegislationName(name) === normBase) continue;
    // Compared in the short form, so «اللائحة التنفيذية» and «اللائحة التنفيذية لنظام X» are one.
    const [key] = subsidiaryNamesUnderBase(normBase, [normalizeLegislationName(name)]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  if (form === "full") return names;
  const shorts = names.map((n) => shortSubLegislationName(base, n));
  const shownAs = names.map((n, i) => shorts[i] ?? normalizeLegislationName(n));
  const uses = new Map<string, number>();
  for (const s of shownAs) uses.set(s, (uses.get(s) ?? 0) + 1);
  return names.map((n, i) => (shorts[i] !== null && (uses.get(shownAs[i]) ?? 0) === 1 ? shorts[i]! : n));
}

/** The names shown before «إظهار المزيد» (owner file 03 L3: «لائحة أو لائحتان»). */
export const CARD_SUB_NAMES_SHOWN = 2;

/**
 * How many sub-legislation documents the card knows of but does not name
 * even when expanded: the linked children counted by the API beyond the
 * titles it sent. 0 when every one is named.
 */
export function unnamedSubLegislationCount(linkedCount: unknown, linkedTitlesSent: number): number {
  const n = typeof linkedCount === "number" && Number.isInteger(linkedCount) && linkedCount > 0 ? linkedCount : 0;
  return Math.max(0, n - Math.max(0, linkedTitlesSent));
}
