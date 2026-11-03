/**
 * legislativeEvent — a law's ONE public date and its guest-safe موجز
 * (owner answers ٣١٧ / ٣١٨ / ٣١٩, 2026-10-30).
 * ─────────────────────────────────────────────────────────────────────────────
 * ٣١٧ (أ): the catalogue is browsed by ONE date — the latest official
 *   legislative event. ٣١٨ (أ, amended by the 28-Oct decision): a visitor sees
 *   «آخر تحديث تشريعي» — that date ALONE (no instrument, no number); the
 *   issue date, decree numbers and official links stay subscribers'. JSON-LD
 *   `dateModified` carries only what the visitor sees, i.e. this same date.
 * ٣١٩ (ب): the موجز stays open to everyone, but for a non-subscriber the
 *   SERVER strips decree numbers and issue dates out of it (never CSS).
 *
 * The date is the later of the two official dates the database holds:
 *   - library.laws.latest_update->>'date_hijri' (the owner's frontmatter: the
 *     latest amendment, or — for a merged file — the latest event of the whole
 *     merged container, e.g. the executive regulation issued 1448/01/08);
 *   - library.laws.issue_date_hijri.
 * It is the same date library.laws.catalogue_recency_key orders by
 * (20261025_40): hijriDateSortKey below is that SQL parser, line for line, so
 * the date a visitor reads and the order he browses in cannot disagree
 * (catalogue-order-277.test.ts pins the SQL; legislativeEvent.test.ts pins
 * this twin on the same shapes).
 *
 * Both source columns are column-locked for anon (20261004_01, T28-22): the
 * routes read them with the service role and send only what this module
 * returns.
 *
 * Pure: `node --test` loads it directly.
 */

import { isoFromParts } from "../services/dualCalendar.ts";

const DIGITS_IN = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";

function asciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => String(DIGITS_IN.indexOf(d) % 10));
}

/**
 * library.hijri_date_sort_key in JS: the FIRST Hijri date in the text as
 * YYYYMMDD (month-only YYYYMM00, year-only YYYY0000), or null.
 *   1. year first:  (13xx|14xx) [/-] M [ [/-] D ]
 *   2. day first:   D [/-] M [/-] (13xx|14xx)
 *   3. a bare year: 13xx|14xx
 */
export function hijriDateSortKey(input: unknown): number | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const t = asciiDigits(String(input));
  let y: number;
  let mo: number;
  let d: number | null;
  let m = /(?:^|[^0-9])(1[34][0-9]{2})\s*[/-]\s*([0-9]{1,2})(?![0-9])(?:\s*[/-]\s*([0-9]{1,2})(?![0-9]))?/.exec(t);
  if (m) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = m[3] === undefined ? null : Number(m[3]);
  } else {
    m = /(?:^|[^0-9])([0-9]{1,2})\s*[/-]\s*([0-9]{1,2})\s*[/-]\s*(1[34][0-9]{2})(?![0-9])/.exec(t);
    if (m) {
      d = Number(m[1]);
      mo = Number(m[2]);
      y = Number(m[3]);
    } else {
      m = /(?:^|[^0-9])(1[34][0-9]{2})(?![0-9])/.exec(t);
      return m ? Number(m[1]) * 10000 : null;
    }
  }
  if (mo < 1 || mo > 12) return null;
  if (d !== null && (d < 1 || d > 30)) return null;
  return y * 10000 + mo * 100 + (d ?? 0);
}

/** «1448/01/08هـ», «1446/02هـ», «1446هـ» — Western digits, the way the reader prints dates. */
export function formatHijriKey(key: number | null | undefined): string {
  if (!key || !Number.isInteger(key) || key < 13000000) return "";
  const y = Math.floor(key / 10000);
  const mo = Math.floor((key % 10000) / 100);
  const d = key % 100;
  if (mo === 0) return `${y}هـ`;
  const mm = String(mo).padStart(2, "0");
  return d === 0 ? `${y}/${mm}هـ` : `${y}/${mm}/${String(d).padStart(2, "0")}هـ`;
}

/** The Gregorian ISO day (YYYY-MM-DD) of a full Hijri key, or null (month/year-only keys have no day). */
export function isoFromHijriKey(key: number | null | undefined): string | null {
  if (!key || !Number.isInteger(key)) return null;
  const y = Math.floor(key / 10000);
  const mo = Math.floor((key % 10000) / 100);
  const d = key % 100;
  if (mo === 0 || d === 0) return null;
  return isoFromParts("hijri", y, mo, d);
}

export interface LegislativeEventSource {
  /** library.laws.latest_update (jsonb) as read with the service role. */
  latest_update?: unknown;
  /** library.laws.issue_date_hijri. */
  issue_date_hijri?: unknown;
}

export interface LegislativeEvent {
  /** YYYYMMDD Hijri, the catalogue_recency_key value. */
  key: number;
  /** «1448/01/08هـ» — the date alone: what a visitor may see (٣١٨). */
  dateHijri: string;
  /** Gregorian YYYY-MM-DD for JSON-LD, null when the date has no day or does not convert. */
  iso: string | null;
  /** Which source won: an amendment / later event, or the issue itself. */
  kind: "update" | "issue";
}

function latestUpdateDate(v: unknown): unknown {
  if (!v || typeof v !== "object") return null;
  return (v as Record<string, unknown>).date_hijri ?? null;
}

/** The law's latest official legislative event (٣١٧), or null when neither date reads. */
export function latestLegislativeEvent(law: LegislativeEventSource): LegislativeEvent | null {
  const updateKey = hijriDateSortKey(latestUpdateDate(law.latest_update));
  const issueKey = hijriDateSortKey(law.issue_date_hijri);
  const key = Math.max(updateKey ?? 0, issueKey ?? 0);
  if (!key) return null;
  return {
    key,
    dateHijri: formatHijriKey(key),
    iso: isoFromHijriKey(key),
    kind: updateKey !== null && updateKey === key && updateKey !== issueKey ? "update" : "issue",
  };
}

/* ── ٣١٩: the موجز a non-subscriber receives ─────────────────────────────── */

const D = "[0-9٠-٩۰-۹]";
const HIJRI_MONTHS =
  "محرم|المحرم|صفر|ربيع الأول|ربيع الأولى|ربيع الآخر|ربيع الثاني|ربيع الاخر|جمادى الأولى|جمادى الأول|جمادى الآخرة|جمادى الآخر|جمادى الثانية|جمادى الاخرة|رجب|شعبان|رمضان|شوال|ذو القعدة|ذي القعدة|ذو الحجة|ذي الحجة";
const GREG_MONTHS =
  "يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر";
const BIDI = /[‎‏؜‪-‮⁦-⁩]/g;
const ERA = `\\s*(?:هـ|ه|م)?(?![\\p{L}])`;

/** Dates in every shape the corpus uses (numeric with / - . and named months). */
const DATE_PATTERNS: RegExp[] = [
  new RegExp(`${D}{1,4}\\s*[/.\\-]\\s*${D}{1,2}\\s*[/.\\-]\\s*${D}{1,4}${ERA}`, "gu"),
  new RegExp(`(?:${D}{1,2}\\s+)?(?:${HIJRI_MONTHS}|${GREG_MONTHS})\\s+(?:سنة|عام|لعام)?\\s*${D}{3,4}${ERA}`, "gu"),
  new RegExp(`(?:سنة|عام|لعام)\\s+${D}{3,4}${ERA}`, "gu"),
  new RegExp(`(?<![0-9٠-٩۰-۹/])(?:1[34]|١[٣٤]|۱[۳۴])${D}{2}\\s*(?:هـ|ه)(?![\\p{L}])`, "gu"),
  new RegExp(`(?<![0-9٠-٩۰-۹/])(?:19|20|١٩|٢٠|۱۹|۲۰)${D}{2}\\s*م(?![\\p{L}])`, "gu"),
];

/** An instrument's number: «رقم (م/14)», «رقم م/١٤», «(م/14)», «رقم (43)», «رقم 5595». */
const INSTRUMENT_NUMBER: RegExp[] = [
  new RegExp(`\\s*(?:ذي\\s+|ذو\\s+)?(?:ال)?رقم\\s*\\(?\\s*(?:[أا]/|م\\s*/|[\\p{L}]{1,3}\\s*/)?\\s*${D}[0-9٠-٩۰-۹/.\\-]*\\s*\\)?`, "gu"),
  new RegExp(`\\s*\\(\\s*(?:[أا]|م)\\s*/\\s*${D}[0-9٠-٩۰-۹/.\\-]*\\s*\\)`, "gu"),
  new RegExp(`(?<![\\p{L}])(?:[أا]|م)\\s*/\\s*${D}[0-9٠-٩۰-۹/.\\-]*`, "gu"),
];

/** Connectors left behind once the number and date are gone. */
const DANGLING: Array<[RegExp, string]> = [
  [/\s*(?:و|ب)?(?:تاريخ|بتاريخ)\s*(?=[،,.؛;:)\]»]|$|\s+(?:و|ثم|،))/gu, ""],
  [/\s*(?:و|ب)?تاريخ\s*$/gu, ""],
  [/\(\s*\)/g, ""],
  [/\s+([،,.؛;:])/g, "$1"],
  [/([،,؛;])\s*\1+/g, "$1"],
  [/ {2,}/g, " "],
];

/** What must never survive in a guest's موجز: an instrument number or a Hijri/Gregorian date. */
const GUEST_SUMMARY_FORBIDDEN = [
  new RegExp(`(?:[أا]|م)\\s*/\\s*${D}`, "u"),
  new RegExp(`${D}{1,4}\\s*[/.\\-]\\s*${D}{1,2}\\s*[/.\\-]\\s*${D}{1,4}`, "u"),
  new RegExp(`(?:1[34]|١[٣٤]|۱[۳۴])${D}{2}\\s*(?:هـ|ه)(?![\\p{L}])`, "u"),
  new RegExp(`رقم\\s*\\(?\\s*${D}`, "u"),
  new RegExp(`(?:${HIJRI_MONTHS})\\s+${D}{3,4}`, "u"),
];

/** True when the text still holds a decree number or a date (the fail-closed check). */
export function summaryLeaksOfficialRefs(text: string): boolean {
  const t = text.replace(BIDI, "");
  return GUEST_SUMMARY_FORBIDDEN.some((re) => re.test(t));
}

/**
 * The موجز with decree numbers and issue dates removed (٣١٩). Line structure
 * (markdown bullets, paragraphs) is kept. A line that still leaks after the
 * cleaning is DROPPED (fail closed) — a shorter summary, never a leaked
 * number. Other numbers («٣٠ يوماً», «المادة ١٢») are untouched.
 */
export function stripOfficialRefsFromSummary(summary: string | null | undefined): string {
  const src = String(summary ?? "");
  if (!src.trim()) return "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    let line = raw.replace(BIDI, "");
    for (const re of DATE_PATTERNS) line = line.replace(re, "");
    for (const re of INSTRUMENT_NUMBER) line = line.replace(re, "");
    for (const [re, to] of DANGLING) line = line.replace(re, to);
    line = line.replace(/\s+$/u, "");
    if (summaryLeaksOfficialRefs(line)) continue;
    // A bullet or heading whose whole content was the date / number.
    if (/^\s*(?:[-*•]|#+|\d+[.)])?\s*[:：]?\s*$/u.test(line) && raw.trim() !== "") continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The موجز for one viewer: whole for a subscriber, stripped (٣١٩) for anyone else. */
export function summaryForViewer(summary: string | null | undefined, isSubscriber: boolean): string {
  if (isSubscriber) return String(summary ?? "");
  return stripOfficialRefsFromSummary(summary);
}
