/**
 * monitorFeed.ts — the pure half of «راصد التشريعات» (GET /api/library/monitor).
 *
 * The monitor used to be a hard-coded array of six invented amendments. The
 * owner's ask (owner test 28-9, T28-35a): link it to the live library, newest
 * first, show what is not yet in force with the days remaining, and let every
 * card open the law itself. Everything the route needs to decide lives here so
 * `node --test` can pin it without a database or a clock.
 *
 * ── WHAT THE LIVE DATA ACTUALLY HOLDS (probed 2026-09-28, self-hosted) ─────
 *
 *   library.laws (5,899 rows)
 *     effective_date_gregorian / publication_date_gregorian   0 rows — unusable
 *     effective_date_hijri       561 rows  «1448/08/12», «1448-02-05», «1447/08/03هـ»
 *     issue_date_hijri         4,629 rows  same shapes, plus junk («1473-13-36», «1448»)
 *     publication_date_hijri     682 rows
 *     status   active 5,119 · repealed 617 · deferred_effective 7
 *   library.decrees_circulars (3,318 rows)
 *     date   every shape at once: «1448/01/03», «17/11/1436», «١٤٤٨/٠١/٠٣»,
 *            «١٩ / ١٠ / ١٤٣٩» — Arabic-Indic digits, day-first and year-first.
 *
 * So every date here is a Hijri TEXT field that has to be parsed, and the only
 * way to count days is Hijri → Gregorian through Umm al-Qura (hijri.ts, which
 * checks every candidate against ICU). A value that does not parse is left
 * out — never guessed.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT CARRY ───────────────────────────────────
 *
 * No issuing instrument, decree number, gazette number or official link: those
 * are being hidden from non-subscribers elsewhere, and a feed that re-published
 * them would be the bypass. Titles are shown as the library stores them (some
 * titles are themselves «المرسوم الملكي رقم م/٧٢ …» — that is the title).
 */

import { gregorianFromHijri, hijriPartsOf, HIJRI_MONTHS_AR } from "../services/hijri.ts";
import { daysUntilEffectiveDate, saudiCalendarDate } from "../services/enactmentCountdown.ts";
import { countPhraseAr, toArabicDigits } from "../services/arabicCount.ts";
import { lawStatusPresentation } from "../../app/laws/law-status.ts";

// ─── Hijri text → parts ──────────────────────────────────────────────────────

export interface HijriYmd {
  year: number;
  month: number;
  day: number;
}

/** Hijri years the parser accepts. A Gregorian «2026» in a Hijri column is junk, not a date. */
const MIN_HIJRI_YEAR = 1300;
const MAX_HIJRI_YEAR = 1600;

/** Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits → ASCII. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Parse one stored Hijri date, in any of the shapes the library holds, or
 * return null. Year-first («1448/08/12», «1448-02-05») and day-first
 * («17/11/1436») are both accepted, as are Arabic-Indic digits, spaces around
 * the separators and a trailing «هـ»/«ه». A month outside 1–12, a day outside
 * 1–30, a partial date («1448/03», «1448») or a year outside the Hijri range is
 * rejected: sorting or counting on a guessed day would be a false statement.
 */
export function parseHijriDate(raw: unknown): HijriYmd | null {
  if (typeof raw !== "string") return null;
  const text = toAsciiDigits(raw)
    .replace(/هـ|ه/g, "")
    .replace(/\s*([/\-.])\s*/g, "$1")
    .trim();
  if (!text) return null;

  let year: number;
  let month: number;
  let day: number;
  let m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(text);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
    if (!m) return null;
    day = Number(m[1]);
    month = Number(m[2]);
    year = Number(m[3]);
  }
  if (year < MIN_HIJRI_YEAR || year > MAX_HIJRI_YEAR) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 30) return null;
  return { year, month, day };
}

/** Negative when a is earlier than b, 0 when equal, positive when later. */
export function compareHijri(a: HijriYmd, b: HijriYmd): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** «1448/08/12» — the one spelling the feed hands out. */
export function formatHijriYmd(h: HijriYmd): string {
  return `${h.year}/${String(h.month).padStart(2, "0")}/${String(h.day).padStart(2, "0")}`;
}

/** «١٢ شعبان ١٤٤٨ هـ». */
export function hijriYmdLabelAr(h: HijriYmd): string {
  return `${toArabicDigits(h.day)} ${HIJRI_MONTHS_AR[h.month - 1]} ${toArabicDigits(h.year)} هـ`;
}

/**
 * The Gregorian ISO date (yyyy-mm-dd) for a Hijri date, through Umm al-Qura, or
 * null when there is no such day («٣٠» of a 29-day month) or the runtime has
 * no Umm al-Qura data. `gregorianFromHijri` hands back LOCAL midnight, so it is
 * read back with the local getters — `toISOString()` would shift it a day on
 * any server east of UTC.
 */
export function hijriToIsoDate(h: HijriYmd): string | null {
  const date = gregorianFromHijri(h.day, h.month, h.year);
  if (!date) return null;
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** The Umm al-Qura date of the Saudi civil day `today` falls on, or null. */
export function saudiHijriToday(today: Date): HijriYmd | null {
  const [y, m, d] = saudiCalendarDate(today).split("-").map(Number);
  const parts = hijriPartsOf(new Date(y, m - 1, d));
  return parts ? { year: parts.year, month: parts.month, day: parts.day } : null;
}

const DAY_MS = 86_400_000;

/** Signed whole days from ISO `from` to ISO `to` (positive when `to` is later). */
export function signedDayDiff(fromIso: string, toIso: string): number | null {
  const parse = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
  };
  const a = parse(fromIso);
  const b = parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

// ─── Query prefilters ────────────────────────────────────────────────────────

/**
 * Year tokens for a PostgREST `like` prefilter, in both digit systems.
 *
 * Why not `gte`: the stored text sorts lexically, so `gte.1447` admits
 * «17/11/1436» (day-first) and misses nothing only by accident; and the orders
 * table stores Arabic-Indic digits, which sort after every ASCII digit. A
 * «1448» substring cannot be produced by a day or a month (both ≤ 30), so
 * `like *1448*` matches exactly the rows of that year, whatever the shape.
 */
export function hijriYearTokens(fromYear: number, toYear: number): string[] {
  const ascii: string[] = [];
  for (let y = fromYear; y <= toYear; y += 1) ascii.push(String(y));
  return [...ascii, ...ascii.map((y) => toArabicDigits(y))];
}

/** `col.like.*1447*,col.like.*١٤٤٧*,…` — one clause per column per token, for `.or()`. */
export function likeYearClauses(columns: string[], tokens: string[]): string {
  return columns.flatMap((c) => tokens.map((t) => `${c}.like.*${t}*`)).join(",");
}

// ─── Rows in, cards out ──────────────────────────────────────────────────────

/** The columns the route selects from library.laws — nothing else is read. */
export interface MonitorLawRow {
  slug: string;
  title: string | null;
  type?: string | null;
  status?: string | null;
  issue_date_hijri?: string | null;
  publication_date_hijri?: string | null;
  effective_date_hijri?: string | null;
}

/** The columns the route selects from library.decrees_circulars. */
export interface MonitorOrderRow {
  id: string;
  title: string | null;
  instrument_ar?: string | null;
  date?: string | null;
}

export type MonitorKind = "law" | "order";
export type MonitorDateKind = "issue" | "publication" | "effective";

export interface MonitorItem {
  kind: MonitorKind;
  /** Law slug, or the order's id (orders are addressed by id). */
  slug: string;
  title: string;
  /** «نظام», «لائحة تنفيذية», «تعميم»… — the document's kind, never its number. */
  typeLabel: string | null;
  /** The law's raw status token; null for orders (the table has none). */
  status: string | null;
  statusLabel: string | null;
  href: string;
  dateKind: MonitorDateKind;
  /** «1448/08/12». */
  hijriDate: string;
  /** yyyy-mm-dd, or null when Umm al-Qura has no such day. */
  gregorianDate: string | null;
  /** «١٢ شعبان ١٤٤٨ هـ الموافق ٢٠ يناير ٢٠٢٧ م», or the Hijri alone. */
  dateLabel: string;
}

export interface UpcomingItem extends Omit<MonitorItem, "hijriDate" | "dateLabel"> {
  /** null only for a deferred law whose effective date the source does not give. */
  hijriDate: string | null;
  dateLabel: string | null;
  daysRemaining: number | null;
  countdownLabel: string;
}

export interface RecentItem extends MonitorItem {
  daysSinceEffective: number;
  countdownLabel: string;
}

/**
 * T28-22 (owner, 2026-09-28): a decree's issue date and its gazette
 * publication date are subscriber data — the catalogue (/api/library/init) and
 * the law page already withhold them from a non-subscriber, so the monitor
 * must too, or one law shows its decree date here and hides it there. The
 * effective date is the monitor's whole point and stays. The list is still
 * ORDERED by the real date on the server; only the displayed value goes.
 */
export function maskOfficialDates<T extends { dateKind: MonitorDateKind }>(
  items: T[],
  isSubscriber: boolean,
): T[] {
  if (isSubscriber) return items;
  return items.map((item) =>
    item.dateKind === "effective"
      ? item
      : ({ ...item, hijriDate: null, gregorianDate: null, dateLabel: null, dateLocked: true } as T),
  );
}

export interface MonitorFeed {
  upcoming: UpcomingItem[];
  recentlyEffective: RecentItem[];
  latest: MonitorItem[];
}

/** «نافذ حديثاً» covers today and the 14 days before it. */
export const RECENT_WINDOW_DAYS = 14;
export const LATEST_LIMIT = 30;

const DAY_FORMS = { zero: null, one: "يوم واحد", two: "يومين", few: "أيام", many: "يوماً" };

/** «يبدأ نفاذه بعد ١٢٠ يوماً» / «موعد النفاذ غير محدَّد في المصدر». */
export function countdownPhraseAr(daysRemaining: number | null): string {
  if (daysRemaining === null) return "موعد النفاذ غير محدَّد في المصدر";
  if (daysRemaining <= 0) return "يبدأ نفاذه اليوم";
  return `يبدأ نفاذه بعد ${countPhraseAr(daysRemaining, DAY_FORMS)}`;
}

/** «نافذ اليوم» / «نافذ منذ ٣ أيام». */
export function sincePhraseAr(daysSince: number): string {
  if (daysSince <= 0) return "نافذ اليوم";
  return `نافذ منذ ${countPhraseAr(daysSince, DAY_FORMS)}`;
}

export function lawHref(slug: string): string {
  return `/laws/${encodeURIComponent(slug)}`;
}

export function orderHref(id: string): string {
  return `/laws/orders/${encodeURIComponent(id)}`;
}

function clean(value: string | null | undefined): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v : null;
}

function lawBase(row: MonitorLawRow) {
  const status = clean(row.status);
  return {
    kind: "law" as const,
    slug: row.slug,
    title: clean(row.title) ?? row.slug,
    typeLabel: clean(row.type),
    status,
    statusLabel: status ? lawStatusPresentation(status).labelAr : null,
    href: lawHref(row.slug),
  };
}

const AR_GREGORIAN_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

/**
 * «١٢ شعبان ١٤٤٨ هـ الموافق ٢٠ يناير ٢٠٢٧ م» — Hijri first (the calendar the
 * library records and courts file against), Gregorian after «الموافق», or the
 * Hijri alone when Umm al-Qura has no such day. Not describeDateAr(): its «·»
 * separator sits next to an Arabic-Indic digit and reads as a zero
 * («١٢ ·» → «١٢٠»), which is how it rendered on a phone.
 */
export function monitorDateLabelAr(h: HijriYmd, gregorianIso: string | null): string {
  const hijri = hijriYmdLabelAr(h);
  const m = gregorianIso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(gregorianIso) : null;
  if (!m) return hijri;
  const gregorian = `${toArabicDigits(Number(m[3]))} ${AR_GREGORIAN_MONTHS[Number(m[2]) - 1]} ${toArabicDigits(m[1])} م`;
  return `${hijri} الموافق ${gregorian}`;
}

function dated(h: HijriYmd) {
  const gregorianDate = hijriToIsoDate(h);
  return {
    hijriDate: formatHijriYmd(h),
    gregorianDate,
    dateLabel: monitorDateLabelAr(h, gregorianDate),
  };
}

/**
 * Laws whose effective date is after the Saudi `today`, soonest first, then
 * the deferred laws the source gives no effective date for (daysRemaining
 * null — shown as such, never assigned an invented date). Repealed rows are
 * left out whatever their date says.
 */
export function buildUpcoming(rows: MonitorLawRow[], today: Date): UpcomingItem[] {
  const todayIso = saudiCalendarDate(today);
  const datedItems: UpcomingItem[] = [];
  const undated: UpcomingItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.slug || seen.has(row.slug)) continue;
    const base = lawBase(row);
    if (base.status === "repealed") continue;
    const h = parseHijriDate(row.effective_date_hijri);
    const iso = h ? hijriToIsoDate(h) : null;
    const diff = iso ? signedDayDiff(todayIso, iso) : null;

    if (h && iso && diff !== null && diff > 0) {
      const daysRemaining = daysUntilEffectiveDate(iso, today);
      if (daysRemaining === null) continue;
      seen.add(row.slug);
      datedItems.push({
        ...base,
        dateKind: "effective",
        ...dated(h),
        daysRemaining,
        countdownLabel: countdownPhraseAr(daysRemaining),
      });
    } else if (!h && base.status === "deferred_effective") {
      seen.add(row.slug);
      undated.push({
        ...base,
        dateKind: "effective",
        hijriDate: null,
        gregorianDate: null,
        dateLabel: null,
        daysRemaining: null,
        countdownLabel: countdownPhraseAr(null),
      });
    }
  }

  datedItems.sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0) || a.title.localeCompare(b.title, "ar"));
  undated.sort((a, b) => a.title.localeCompare(b.title, "ar"));
  return [...datedItems, ...undated];
}

/**
 * Laws that came into force today or within the previous `windowDays` Saudi
 * days, most recent first. Repealed rows are left out.
 */
export function buildRecentlyEffective(
  rows: MonitorLawRow[],
  today: Date,
  windowDays = RECENT_WINDOW_DAYS,
): RecentItem[] {
  const todayIso = saudiCalendarDate(today);
  const items: RecentItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.slug || seen.has(row.slug)) continue;
    const base = lawBase(row);
    if (base.status === "repealed") continue;
    const h = parseHijriDate(row.effective_date_hijri);
    if (!h) continue;
    const iso = hijriToIsoDate(h);
    const diff = iso ? signedDayDiff(todayIso, iso) : null;
    if (diff === null || diff > 0 || diff < -windowDays) continue;
    seen.add(row.slug);
    const daysSinceEffective = diff === 0 ? 0 : -diff; // never -0
    items.push({
      ...base,
      dateKind: "effective",
      ...dated(h),
      daysSinceEffective,
      countdownLabel: sincePhraseAr(daysSinceEffective),
    });
  }

  items.sort((a, b) => a.daysSinceEffective - b.daysSinceEffective || a.title.localeCompare(b.title, "ar"));
  return items;
}

/**
 * The newest laws and orders by the best date each row carries: a law's issue
 * date, else its publication date; an order's own date. A row with no parsable
 * date is left out rather than sorted on a guess. When `todayHijri` is known,
 * an issue date later than today is treated as a typo and left out too — a
 * «latest issued» list headed by a date that has not happened yet would be the
 * first thing a lawyer stops trusting.
 */
export function buildLatest(
  laws: MonitorLawRow[],
  orders: MonitorOrderRow[],
  todayHijri: HijriYmd | null,
  limit = LATEST_LIMIT,
): MonitorItem[] {
  type Candidate = { h: HijriYmd; item: () => MonitorItem };
  const candidates: Candidate[] = [];
  const notFuture = (h: HijriYmd) => !todayHijri || compareHijri(h, todayHijri) <= 0;
  const seenLaws = new Set<string>();
  const seenOrders = new Set<string>();

  for (const row of laws) {
    if (!row.slug || seenLaws.has(row.slug)) continue;
    const issue = parseHijriDate(row.issue_date_hijri);
    const publication = parseHijriDate(row.publication_date_hijri);
    const pick = issue && notFuture(issue)
      ? { h: issue, dateKind: "issue" as const }
      : publication && notFuture(publication)
        ? { h: publication, dateKind: "publication" as const }
        : null;
    if (!pick) continue;
    seenLaws.add(row.slug);
    candidates.push({
      h: pick.h,
      item: () => ({ ...lawBase(row), dateKind: pick.dateKind, ...dated(pick.h) }),
    });
  }

  for (const row of orders) {
    if (!row.id || seenOrders.has(row.id)) continue;
    const h = parseHijriDate(row.date);
    if (!h || !notFuture(h)) continue;
    seenOrders.add(row.id);
    candidates.push({
      h,
      item: () => ({
        kind: "order",
        slug: row.id,
        title: clean(row.title) ?? "بدون عنوان",
        typeLabel: clean(row.instrument_ar),
        status: null,
        statusLabel: null,
        href: orderHref(row.id),
        dateKind: "issue",
        ...dated(h),
      }),
    });
  }

  candidates.sort((a, b) => compareHijri(b.h, a.h));
  // Only the rows that survive the cut pay for the Umm al-Qura conversion.
  return candidates.slice(0, Math.max(0, limit)).map((c) => c.item());
}
