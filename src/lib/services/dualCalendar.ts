/**
 * dualCalendar.ts — the pure arithmetic behind the shared Hijri/Gregorian date
 * picker (owner decision ١٢٧, src/components/ui/DualDatePicker.tsx).
 *
 * THE STORED VALUE NEVER CHANGES SHAPE. Every field the picker replaced held a
 * Gregorian wall-clock day, "YYYY-MM-DD", and so does the picker. The Hijri
 * view is a way of FINDING that day, not a second value: the database, the
 * routes and deadlineEngine.ts see exactly what an `<input type="date">` sent.
 *
 * ONE HIJRI CALENDAR. Nothing here converts on its own. Hijri parts come from
 * hijri.ts (Intl `islamic-umalqura`, i.e. Umm al-Qura), and wall-clock days
 * are parsed, printed and stepped with deadlineEngine.ts's own helpers — local
 * midnight, overflow-rejecting — so a day the picker shows is the same day the
 * deadline engine counts from. A month grid is built by finding its 1st once
 * and then walking forward a day at a time until the month number changes, so
 * a month's length is whatever Umm al-Qura says, never 29.5 on average.
 *
 * Every function returns `null` rather than guessing: the 30th of a 29-day
 * Hijri month, 2026-02-31, a runtime with no Umm al-Qura data. The picker
 * renders nothing (or Gregorian only) for a null, for the reason at the top of
 * hijri.ts — an absent Hijri date is a gap, a wrong one is a false statement
 * about a court date.
 *
 * Pure: no React, no clock. Unit-tested with `node --test`.
 */

import { describeDateAr, gregorianFromHijri, hijriPartsOf, toArabicDigits, HIJRI_MONTHS_AR, type HijriParts } from "./hijri.ts";
import { addDays, isoDate, parseIsoDate } from "./deadlineEngine.ts";

export type CalendarKind = "hijri" | "gregorian";

/** One month in one calendar. `month` is 1–12. */
export interface MonthRef {
  calendar: CalendarKind;
  year: number;
  month: number;
}

export interface DayCell {
  /** The stored value: a Gregorian wall-clock day. */
  iso: string;
  gregorian: { year: number; month: number; day: number };
  /** null only on a runtime without Umm al-Qura data. */
  hijri: HijriParts | null;
  /** 0 = Sunday … 6 = Saturday, as `Date.prototype.getDay`. */
  weekday: number;
}

/** Gregorian month names as Saudi users write them, index 0 = January. */
export const GREGORIAN_MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

/** Sunday-first, the Saudi working week's order. */
export const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

/** The month names for a calendar, index 0 = month 1. */
export function monthNamesAr(calendar: CalendarKind): readonly string[] {
  return calendar === "hijri" ? HIJRI_MONTHS_AR : GREGORIAN_MONTHS_AR;
}

function cellOf(date: Date): DayCell {
  return {
    iso: isoDate(date),
    gregorian: { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() },
    hijri: hijriPartsOf(date),
    weekday: date.getDay(),
  };
}

/** The year/month/day of `iso` in `calendar`, or null. */
export function partsOf(iso: string, calendar: CalendarKind): { year: number; month: number; day: number } | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  if (calendar === "gregorian") {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
  const h = hijriPartsOf(date);
  return h ? { year: h.year, month: h.month, day: h.day } : null;
}

/**
 * The stored ISO day for a day typed or picked in either calendar, or null when
 * there is no such day — «٣٠ رمضان ١٤٤٦» and 2026-02-31 alike.
 */
export function isoFromParts(calendar: CalendarKind, year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (calendar === "gregorian") {
    if (year < 1 || year > 9999) return null;
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return parseIsoDate(iso) ? iso : null;
  }
  const date = gregorianFromHijri(day, month, year);
  return date ? isoDate(date) : null;
}

/** Every day of `ref`, in order, or null when the month cannot be resolved. */
export function monthDays(ref: MonthRef): DayCell[] | null {
  if (ref.month < 1 || ref.month > 12) return null;
  if (ref.calendar === "gregorian") {
    const first = parseIsoDate(isoFromParts("gregorian", ref.year, ref.month, 1) ?? "");
    if (!first) return null;
    const out: DayCell[] = [];
    for (let d = first; d.getMonth() === first.getMonth(); d = addDays(d, 1)) out.push(cellOf(d));
    return out;
  }
  const first = gregorianFromHijri(1, ref.month, ref.year);
  if (!first) return null;
  const out: DayCell[] = [];
  // At most 30 steps: stop the day Umm al-Qura turns the month.
  for (let d = first, i = 0; i < 30; d = addDays(d, 1), i += 1) {
    const cell = cellOf(d);
    if (!cell.hijri || cell.hijri.month !== ref.month || cell.hijri.year !== ref.year) break;
    out.push(cell);
  }
  return out.length >= 29 ? out : null;
}

/** 28–31 for Gregorian, 29 or 30 for Umm al-Qura; 0 when unresolvable. */
export function monthLength(ref: MonthRef): number {
  if (ref.calendar === "gregorian") {
    if (ref.month < 1 || ref.month > 12) return 0;
    return new Date(ref.year, ref.month, 0).getDate();
  }
  return monthDays(ref)?.length ?? 0;
}

/** Blank cells before the 1st in a Sunday-first week. */
export function weekStartOffset(ref: MonthRef): number {
  const first = isoFromParts(ref.calendar, ref.year, ref.month, 1);
  const date = first ? parseIsoDate(first) : null;
  return date ? date.getDay() : 0;
}

/** The month of `calendar` that contains `iso`. */
export function monthOf(iso: string, calendar: CalendarKind): MonthRef | null {
  const p = partsOf(iso, calendar);
  return p ? { calendar, year: p.year, month: p.month } : null;
}

export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const index = ref.year * 12 + (ref.month - 1) + delta;
  return { calendar: ref.calendar, year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 };
}

/**
 * The same day-of-month `delta` months away in `calendar`, clamped to the last
 * day of a shorter month — 31 January → 28 February, 30 Ramadan → 29 Shawwal —
 * so PageDown never lands in the month after the one it names.
 */
export function shiftIsoByMonths(iso: string, calendar: CalendarKind, delta: number): string | null {
  const p = partsOf(iso, calendar);
  if (!p) return null;
  const target = shiftMonth({ calendar, year: p.year, month: p.month }, delta);
  const len = monthLength(target);
  if (!len) return null;
  return isoFromParts(calendar, target.year, target.month, Math.min(p.day, len));
}

/**
 * Where the focused day goes for a key in the picker's grid, or null when the
 * key is not a grid key. The grid is right-to-left, so the NEXT day is to the
 * LEFT: ArrowLeft is +1, ArrowRight is −1. Home/End are the week's Sunday and
 * Saturday; PageUp/PageDown a month in the calendar being viewed, a year with
 * Shift (the APG date-picker grid keys).
 */
export function moveByKey(iso: string, key: string, calendar: CalendarKind, shift = false): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  switch (key) {
    case "ArrowLeft": return isoDate(addDays(date, 1));
    case "ArrowRight": return isoDate(addDays(date, -1));
    case "ArrowDown": return isoDate(addDays(date, 7));
    case "ArrowUp": return isoDate(addDays(date, -7));
    case "Home": return isoDate(addDays(date, -date.getDay()));
    case "End": return isoDate(addDays(date, 6 - date.getDay()));
    case "PageUp": return shiftIsoByMonths(iso, calendar, shift ? -12 : -1);
    case "PageDown": return shiftIsoByMonths(iso, calendar, shift ? 12 : 1);
    default: return null;
  }
}

/** ISO days compare as strings. An empty or missing bound is open. */
export function isWithinRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/**
 * `describeDateAr(iso)` as its two calendars, for a field two lines tall:
 *   gregorian «الأربعاء ٢ سبتمبر ٢٠٢٦ م»   (the weekday stays here — it is what
 *                                           a day/month transposition breaks)
 *   hijri     «٢٠ ربيع الأول ١٤٤٨ هـ»      (null without Umm al-Qura data)
 * Split from describeDateAr rather than re-spelled, so the field and every
 * read-back in the app can never word one day two ways.
 */
export function describeDateLinesAr(iso: string): { gregorian: string; hijri: string | null } | null {
  const text = describeDateAr(iso);
  if (!text) return null;
  const at = text.indexOf(" · ");
  return at === -1
    ? { gregorian: text, hijri: null }
    : { gregorian: text.slice(0, at), hijri: text.slice(at + 3) };
}

/** «ربيع الأول ١٤٤٨ هـ» / «سبتمبر ٢٠٢٦ م». */
export function monthTitleAr(ref: MonthRef): string {
  const name = monthNamesAr(ref.calendar)[ref.month - 1] ?? "";
  return `${name} ${toArabicDigits(ref.year)} ${ref.calendar === "hijri" ? "هـ" : "م"}`;
}

/** The years of `calendar` from the one containing `min` to the one containing `max`. */
export function yearRange(calendar: CalendarKind, min: string, max: string): number[] {
  const from = partsOf(min, calendar)?.year;
  const to = partsOf(max, calendar)?.year;
  if (from === undefined || to === undefined || from > to) return [];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * The widest span the picker offers when a field sets no bound of its own:
 * 1940–2076, inside the 1300–1600 AH band ICU holds real Umm al-Qura tables
 * for (outside it ICU quietly switches to arithmetic). Case, contract and
 * client dates all fall well inside it.
 */
export const PICKER_MIN_ISO = "1940-01-01";
export const PICKER_MAX_ISO = "2076-12-31";

/** "YYYY-MM-DDTHH:mm" (a `datetime-local` value) → the picker's day and a time input's value. */
export function splitLocalDateTime(value: string): { date: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return m ? { date: m[1], time: m[2] } : { date: "", time: "" };
}

/** The inverse: "" until both halves are present, since half an appointment is not an instant. */
export function joinLocalDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time}` : "";
}
