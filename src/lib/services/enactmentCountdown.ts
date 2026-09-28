const DAY_MS = 24 * 60 * 60 * 1000;

/** The current civil date in Saudi Arabia, independent of server location. */
export function saudiCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A strict YYYY-MM-DD calendar date as UTC midnight ms, or null ("2026-02-31" is null). */
function calendarDateUtc(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(target)) return null;
  const targetDate = new Date(target);
  if (
    targetDate.getUTCFullYear() !== year ||
    targetDate.getUTCMonth() !== month - 1 ||
    targetDate.getUTCDate() !== day
  ) {
    return null;
  }
  return target;
}

/** Today's Saudi civil date as UTC midnight ms. */
function saudiTodayUtc(today: Date): number {
  const [currentYear, currentMonth, currentDay] = saudiCalendarDate(today)
    .split("-")
    .map(Number);
  return Date.UTC(currentYear, currentMonth - 1, currentDay);
}

/** Whole Saudi-calendar days until a YYYY-MM-DD effective date, never negative. */
export function daysUntilEffectiveDate(effectiveDate: string, today = new Date()): number | null {
  const target = calendarDateUtc(effectiveDate);
  if (target === null) return null;
  return Math.max(0, Math.ceil((target - saudiTodayUtc(today)) / DAY_MS));
}

/**
 * How long a law counts as "recently in force" (owner decision T28-27, option
 * ب): the day it takes effect and the 14 days after it.
 */
export const RECENT_ENACTMENT_WINDOW_DAYS = 14;

/**
 * Whole Saudi-calendar days since a YYYY-MM-DD effective date: 0 on the day it
 * takes effect. Null for an invalid date or one still in the future — unlike
 * daysUntilEffectiveDate, this is not clamped, so a future date can never read
 * as "in force today".
 */
export function daysSinceEffectiveDate(effectiveDate: string, today = new Date()): number | null {
  const target = calendarDateUtc(effectiveDate);
  if (target === null) return null;
  const days = Math.round((saudiTodayUtc(today) - target) / DAY_MS);
  return days < 0 ? null : days;
}

/**
 * The first Saudi date of the "recently in force" window, YYYY-MM-DD:
 * today − RECENT_ENACTMENT_WINDOW_DAYS. The window is [this, today] inclusive.
 */
export function recentEnactmentWindowStart(today = new Date()): string {
  const start = new Date(saudiTodayUtc(today) - RECENT_ENACTMENT_WINDOW_DAYS * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
}

/** True when a law took effect today or within the window before it. */
export function isRecentlyInForce(effectiveDate: string, today = new Date()): boolean {
  const days = daysSinceEffectiveDate(effectiveDate, today);
  return days !== null && days <= RECENT_ENACTMENT_WINDOW_DAYS;
}
