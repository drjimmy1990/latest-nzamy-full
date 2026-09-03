/**
 * deadlineEngine.ts — the ONE place a Saudi filing period becomes a date.
 * ─────────────────────────────────────────────────────────
 * Pure: no I/O, no framework. Runs on the server (API routes, the cron) and in
 * the browser (the calculator page) alike, so both can never disagree.
 *
 * The rules it encodes (نظام المرافعات الشرعية):
 *   • المادة (٢٢): a period is counted from the day AFTER the event, and if
 *     its last day falls on an official holiday it runs to the first working
 *     day after it. Weekend = Friday + Saturday.
 *   • A period of N days that starts the day after the event ends N days
 *     after the event (day 1 = event+1 … day N = event+N).
 *
 * Holidays come from `public.court_holidays` (migration 20260904_phase5):
 * fixed Gregorian days, recurring Hijri ranges, or explicit date ranges.
 * Hijri recurrences are resolved with the platform's single Umm al-Qura
 * implementation (hijri.ts → Intl `islamic-umalqura`). On a runtime without
 * that data `hijriAvailable()` is false, Hijri holidays are skipped, and the
 * result says so (`hijriResolved: false`) — a caller must show that, never
 * silently roll past a holiday it could not see.
 *
 * All dates are wall-clock "YYYY-MM-DD" strings, parsed at LOCAL midnight.
 * A Riyadh deadline is a Riyadh date.
 */

import { gregorianFromHijri, hijriAvailable, hijriLabelAr, hijriPartsOf } from "./hijri.ts";

/** JS getDay(): 0 = Sunday … 5 = Friday, 6 = Saturday. */
export const WEEKEND_DAYS: ReadonlySet<number> = new Set([5, 6]);

export type HolidayKind = "gregorian_fixed" | "hijri_recurring" | "date_range";

/** Mirrors public.court_holidays. */
export interface HolidayRule {
  id: string;
  titleAr: string;
  kind: HolidayKind;
  gregMonth?: number | null;
  gregDay?: number | null;
  hijriMonth?: number | null;
  hijriDay?: number | null;
  lengthDays: number;
  startDate?: string | null;
  endDate?: string | null;
  approximate: boolean;
  active: boolean;
}

// ─── date helpers (local wall-clock) ─────────────────────────────────────────

export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  // reject 2026-02-31-style overflow
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

/** Whole days from `today` to `dueDate` (negative when overdue). */
export function daysUntil(dueDate: string, today: Date = new Date()): number | null {
  const due = parseIsoDate(dueDate);
  if (!due) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - t.getTime()) / 86_400_000);
}

// ─── holidays ────────────────────────────────────────────────────────────────

export interface ResolvedHolidays {
  /** ISO date → the rule that makes it a holiday. */
  dates: Map<string, HolidayRule>;
  /** false when a hijri_recurring rule could not be resolved on this runtime. */
  hijriResolved: boolean;
}

/**
 * Expand holiday rules into concrete dates for every Gregorian year in
 * [fromYear, toYear]. Hijri ranges are resolved for every Hijri year that
 * overlaps that span.
 */
export function resolveHolidayDates(rules: HolidayRule[], fromYear: number, toYear: number): ResolvedHolidays {
  const dates = new Map<string, HolidayRule>();
  let hijriResolved = true;
  const put = (d: Date, rule: HolidayRule) => { dates.set(isoDate(d), rule); };

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.kind === "gregorian_fixed" && rule.gregMonth && rule.gregDay) {
      for (let y = fromYear; y <= toYear; y++) {
        const d = new Date(y, rule.gregMonth - 1, rule.gregDay);
        for (let i = 0; i < rule.lengthDays; i++) put(addDays(d, i), rule);
      }
    } else if (rule.kind === "date_range" && rule.startDate && rule.endDate) {
      const s = parseIsoDate(rule.startDate); const e = parseIsoDate(rule.endDate);
      if (!s || !e) continue;
      for (let d = s; d.getTime() <= e.getTime(); d = addDays(d, 1)) put(d, rule);
    } else if (rule.kind === "hijri_recurring" && rule.hijriMonth && rule.hijriDay) {
      if (!hijriAvailable()) { hijriResolved = false; continue; }
      const hFrom = hijriPartsOf(new Date(fromYear, 0, 1));
      const hTo = hijriPartsOf(new Date(toYear, 11, 31));
      if (!hFrom || !hTo) { hijriResolved = false; continue; }
      for (let hy = hFrom.year; hy <= hTo.year; hy++) {
        const start = gregorianFromHijri(rule.hijriDay, rule.hijriMonth, hy);
        if (!start) continue; // e.g. 30th of a 29-day month that year
        for (let i = 0; i < rule.lengthDays; i++) {
          const d = addDays(start, i);
          if (d.getFullYear() >= fromYear && d.getFullYear() <= toYear) put(d, rule);
        }
      }
    }
  }
  return { dates, hijriResolved };
}

export interface NonWorking {
  nonWorking: boolean;
  reason: "weekend" | "holiday" | null;
  holiday?: HolidayRule;
}

export function isNonWorkingDay(d: Date, holidays: Map<string, HolidayRule>): NonWorking {
  if (WEEKEND_DAYS.has(d.getDay())) return { nonWorking: true, reason: "weekend" };
  const h = holidays.get(isoDate(d));
  if (h) return { nonWorking: true, reason: "holiday", holiday: h };
  return { nonWorking: false, reason: null };
}

// ─── the computation ─────────────────────────────────────────────────────────

export interface ComputeInput {
  /** The event the clock starts from (judgment received, hearing held…). */
  triggerDate: string;
  periodDays: number;
  /** المادة ٢٢ — the period starts the day after the event. */
  countFromNextDay: boolean;
  rollForwardIfHoliday: boolean;
  holidays: ResolvedHolidays;
}

export interface ComputeResult {
  dueDate: string;
  /** Calendar days from trigger to the final due date (after rolling). */
  daysCount: number;
  rolledFromHoliday: boolean;
  /** How many days the roll-forward added. */
  rolledDays: number;
  /** What was rolled past, in order — for the screen's explanation. */
  rolledPast: { date: string; reason: "weekend" | "holiday"; titleAr?: string }[];
  /** «١٤ ربيع الأول ١٤٤٨ هـ», or null on a runtime without Umm al-Qura. */
  dueDateHijri: string | null;
  /** false when a Hijri holiday could not be resolved — the caller must say so. */
  hijriResolved: boolean;
}

export function computeDueDate(input: ComputeInput): ComputeResult | null {
  const trigger = parseIsoDate(input.triggerDate);
  if (!trigger) return null;
  if (!Number.isInteger(input.periodDays) || input.periodDays <= 0) return null;

  // day 1 = event+1 … day N = event+N; or day 1 = the event itself.
  let due = addDays(trigger, input.countFromNextDay ? input.periodDays : input.periodDays - 1);

  const rolledPast: ComputeResult["rolledPast"] = [];
  if (input.rollForwardIfHoliday) {
    // bounded: a run of holidays is at most a few weeks
    for (let guard = 0; guard < 60; guard++) {
      const nw = isNonWorkingDay(due, input.holidays.dates);
      if (!nw.nonWorking) break;
      rolledPast.push({ date: isoDate(due), reason: nw.reason!, titleAr: nw.holiday?.titleAr });
      due = addDays(due, 1);
    }
  }

  const dueIso = isoDate(due);
  return {
    dueDate: dueIso,
    daysCount: Math.round((due.getTime() - trigger.getTime()) / 86_400_000),
    rolledFromHoliday: rolledPast.length > 0,
    rolledDays: rolledPast.length,
    rolledPast,
    dueDateHijri: hijriLabelAr(due),
    hijriResolved: input.holidays.hijriResolved,
  };
}

/** Which reminder offsets are still in the future for a due date. */
export function pendingReminderOffsets(dueDate: string, offsets: number[], today: Date = new Date()): number[] {
  const left = daysUntil(dueDate, today);
  if (left === null) return [];
  return offsets.filter((o) => Number.isInteger(o) && o >= 0 && o <= left).sort((a, b) => b - a);
}
