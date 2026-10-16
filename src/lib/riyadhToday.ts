/**
 * Today's calendar date in Riyadh, as YYYY-MM-DD.
 *
 * The same `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" })` the
 * lawyer dashboard summary and the firm workload routes use as `saudiToday()`.
 * en-CA prints YYYY-MM-DD, which compares directly as a string with a Postgres
 * `date` and with `<input type="date">`.
 *
 * Why not `new Date().toISOString().slice(0, 10)`: that is the UTC date, which
 * is still "yesterday" in Riyadh until 03:00, so a hearing or a delegation's
 * last day would be judged against the wrong day for three hours every night.
 *
 * `now` is a parameter so tests do not have to mock the clock.
 */
export function riyadhToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}
