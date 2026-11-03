/**
 * dateConvert.ts — «تحويل التاريخ» in «الحاسبة القانونية» (owner finding LIVE-F31).
 *
 * The converter accepted 31 February 2026 and answered «14 رمضان 1447هـ»: the
 * old tabular (Kuwaiti) routine took any day number and rolled it over into
 * the next month without a word. A date that does not exist is now REFUSED,
 * in both directions, before anything is converted:
 *
 *   - Gregorian: the day must exist in that month of that year (29 February
 *     only in a leap year);
 *   - Hijri: the day must exist in that month of that year on Umm al-Qura,
 *     where a month has 29 or 30 days depending on the year — «30 رمضان» is
 *     refused in a year whose Ramadan has 29 days.
 *
 * ONE CALENDAR. The conversion itself now uses src/lib/services/hijri.ts —
 * Umm al-Qura through Intl `islamic-umalqura`, the same calendar as the
 * platform header and the deadline engine — instead of the page's own Kuwaiti
 * arithmetic, which was a day out from Umm al-Qura on most dates. (So the Hijri
 * day this converter shows can change by one compared with before; that is the
 * header/converter mismatch LIVE-F32 describes, owned elsewhere.)
 *
 * Bounds: Gregorian years 1900–2100 and Hijri years 1318–1525, inside the
 * range ICU publishes Umm al-Qura data for.
 */

import { gregorianFromHijri, hijriAvailable, hijriPartsOf, HIJRI_MONTHS_AR } from "../../lib/services/hijri.ts";
import { parseBounded } from "./calcInputs.ts";

export const G_MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

export const G_YEAR_MIN = 1900;
export const G_YEAR_MAX = 2100;
export const H_YEAR_MIN = 1318;
export const H_YEAR_MAX = 1525;

export const HIJRI_UNAVAILABLE_AR =
  "تعذّر التحويل: هذا المتصفح لا يحمل بيانات تقويم أم القرى. جرّب متصفحاً محدَّثاً.";

export type Conversion =
  | { ok: true; text: string; day: number; month: number; year: number }
  | { ok: false; error: string };

function arDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

function daysInGregorianMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function readParts(
  dayRaw: string, monthRaw: string, yearRaw: string, yearMin: number, yearMax: number, maxDay: number,
): { ok: true; d: number; m: number; y: number } | { ok: false; error: string } {
  const y = parseBounded(yearRaw, { label: "السنة", min: yearMin, max: yearMax, integer: true });
  if (!y.ok) return y;
  const m = parseBounded(monthRaw, { label: "الشهر", min: 1, max: 12, integer: true });
  if (!m.ok) return m;
  const d = parseBounded(dayRaw, { label: "اليوم", min: 1, max: maxDay, integer: true });
  if (!d.ok) return d;
  return { ok: true, d: d.value, m: m.value, y: y.value };
}

/** Gregorian day/month/year (as typed) → Umm al-Qura, or the refusal. */
export function convertGregorianToHijri(dayRaw: string, monthRaw: string, yearRaw: string): Conversion {
  const parts = readParts(dayRaw, monthRaw, yearRaw, G_YEAR_MIN, G_YEAR_MAX, 31);
  if (!parts.ok) return parts;
  const { d, m, y } = parts;
  const monthDays = daysInGregorianMonth(y, m);
  if (d > monthDays) {
    return {
      ok: false,
      error: `لا يوجد يوم ${arDigits(d)} في ${G_MONTHS_AR[m - 1]} ${arDigits(y)} — هذا الشهر ${arDigits(monthDays)} يوماً. صحّح اليوم ثم حوّل.`,
    };
  }
  if (!hijriAvailable()) return { ok: false, error: HIJRI_UNAVAILABLE_AR };
  // Local midnight, read back in the local zone — the convention hijri.ts documents.
  const h = hijriPartsOf(new Date(y, m - 1, d));
  if (!h) return { ok: false, error: HIJRI_UNAVAILABLE_AR };
  return { ok: true, text: `${h.day} ${h.monthName} ${h.year}هـ`, day: h.day, month: h.month, year: h.year };
}

/** Umm al-Qura day/month/year (as typed) → Gregorian, or the refusal. */
export function convertHijriToGregorian(dayRaw: string, monthRaw: string, yearRaw: string): Conversion {
  const parts = readParts(dayRaw, monthRaw, yearRaw, H_YEAR_MIN, H_YEAR_MAX, 30);
  if (!parts.ok) return parts;
  const { d, m, y } = parts;
  if (!hijriAvailable()) return { ok: false, error: HIJRI_UNAVAILABLE_AR };
  const g = gregorianFromHijri(d, m, y);
  if (!g) {
    // Day 30 of a 29-day month is the only way a 1..30 day can be missing;
    // anything else means the calendar data could not answer.
    if (d !== 30 || !gregorianFromHijri(29, m, y)) {
      return { ok: false, error: "تعذّر تحويل هذا التاريخ الهجري. تحقّق من اليوم والشهر والسنة." };
    }
    return {
      ok: false,
      error: `لا يوجد يوم ${arDigits(d)} في ${HIJRI_MONTHS_AR[m - 1]} ${arDigits(y)}هـ — هذا الشهر ٢٩ يوماً بحسب تقويم أم القرى. صحّح اليوم ثم حوّل.`,
    };
  }
  const gy = g.getFullYear();
  const gm = g.getMonth() + 1;
  const gd = g.getDate();
  return { ok: true, text: `${gd} ${G_MONTHS_AR[gm - 1]} ${gy}`, day: gd, month: gm, year: gy };
}
