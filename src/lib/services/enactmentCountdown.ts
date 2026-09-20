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

/** Whole Saudi-calendar days until a YYYY-MM-DD effective date, never negative. */
export function daysUntilEffectiveDate(effectiveDate: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return null;
  const [year, month, day] = effectiveDate.split("-").map(Number);
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

  const [currentYear, currentMonth, currentDay] = saudiCalendarDate(today)
    .split("-")
    .map(Number);
  const current = Date.UTC(currentYear, currentMonth - 1, currentDay);
  return Math.max(0, Math.ceil((target - current) / DAY_MS));
}
