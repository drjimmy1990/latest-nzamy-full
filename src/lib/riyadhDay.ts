/**
 * riyadhDay.ts — the ONE "what day is it" for the lawyer dashboard.
 * ─────────────────────────────────────────────────────────
 * Owner live test LIVE-F38 (2026-10-30): at 21:00 UTC — already 30 October
 * in Riyadh, still 29 October on a Cairo-zoned Windows clock — three parts of
 * one screen disagreed: the header read the browser's local day, the task
 * filters read `toISOString()` (the UTC day), and the date picker's «اليوم»
 * read Riyadh's day. A task due 30 October fell out of «اليوم» while the
 * picker's «اليوم» chose 30 October.
 *
 * Every "today", "tomorrow", "in N days" on those screens is now a Riyadh
 * calendar day, as a "YYYY-MM-DD" string, built here and nowhere else. Day
 * arithmetic is done on that string (deadlineEngine's addDays on a local
 * wall-clock date), never through `toISOString()` — that call converts to UTC
 * and moves the day for anyone east of Greenwich after their local midnight.
 *
 * Pure: no React, no I/O — `node --test` loads it. The React side
 * (`useRiyadhToday`) only decides WHEN to re-read it.
 */

import { saudiCalendarDate } from "./services/enactmentCountdown.ts";
import { addDays, isoDate, parseIsoDate } from "./services/deadlineEngine.ts";

/** Riyadh's calendar day at `now`, "YYYY-MM-DD". */
export function riyadhToday(now: Date = new Date()): string {
  return saudiCalendarDate(now);
}

/** `day` moved by `n` calendar days ("2026-10-30" + 1 → "2026-10-31"). */
export function shiftDay(day: string, n: number): string {
  const d = parseIsoDate(day);
  if (!d) return day;
  return isoDate(addDays(d, n));
}

/** Riyadh's day plus `n` days. */
export function riyadhDayIn(n: number, now: Date = new Date()): string {
  return shiftDay(riyadhToday(now), n);
}

/** Riyadh's day one calendar month (or `months`) ahead, clamped to month end. */
export function riyadhMonthsAhead(months: number, now: Date = new Date()): string {
  const d = parseIsoDate(riyadhToday(now));
  if (!d) return riyadhToday(now);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return isoDate(target);
}

/**
 * The first "YYYY-MM-DD" of a stored value: a date column ("2026-10-30") is
 * returned as is; a timestamp ("2026-10-29T22:30:00Z") is read as the Riyadh
 * day it falls on — 22:30 UTC on the 29th is 01:30 on the 30th in Riyadh.
 */
export function riyadhDayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return null;
  return saudiCalendarDate(t);
}

/**
 * Milliseconds from `now` until the next Riyadh midnight (+1 s of slack so
 * the timer lands inside the new day, not on its edge). Riyadh has no DST, so
 * the offset is a fixed +03:00.
 */
export function msUntilNextRiyadhMidnight(now: Date = new Date()): number {
  const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const riyadhMs = now.getTime() + RIYADH_OFFSET_MS;
  const sinceMidnight = ((riyadhMs % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - sinceMidnight + 1000;
}

/** Whole days from `today` to `day` (negative when `day` is past). */
export function daysBetween(today: string, day: string): number | null {
  const a = parseIsoDate(today);
  const b = parseIsoDate(day);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * The honest Arabic phrase for how far `day` is from `today` — never
 * «خلال -3 أيام» (CODE-F29). `digits` turns 3 into ٣ when the caller wants.
 */
export function relativeDayAr(
  today: string,
  day: string,
  digits: (n: number) => string = (n) => String(n),
): string {
  const n = daysBetween(today, day);
  if (n === null) return "";
  if (n === 0) return "اليوم";
  if (n === 1) return "غداً";
  if (n === -1) return "متأخرة يوماً واحداً";
  if (n < 0) return `متأخرة ${digits(-n)} ${-n <= 10 ? "أيام" : "يوماً"}`;
  return `خلال ${digits(n)} ${n <= 10 ? "أيام" : "يوماً"}`;
}

/** One meaning per colour, by days left — the same everywhere (CODE-F29). */
export type DayUrgency = "overdue" | "today" | "soon" | "later";

export function dayUrgency(today: string, day: string, soonDays = 3): DayUrgency | null {
  const n = daysBetween(today, day);
  if (n === null) return null;
  if (n < 0) return "overdue";
  if (n === 0) return "today";
  if (n <= soonDays) return "soon";
  return "later";
}
