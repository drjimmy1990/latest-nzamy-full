/**
 * Time-of-day helpers for hearings.
 * ─────────────────────────────────────────────────────────────────────────
 * `lawyer_hearings.hearing_time` is a Postgres `time`, so it arrives as
 * "HH:MM:SS" — and the schedule and the dashboard printed it as-is («13:54:00»).
 * Every other time in the lawyer dashboard is drawn with
 * `toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })`, which
 * renders «٠١:٥٤ م». `formatTimeOfDayAr` produces exactly that string from the
 * stored value, by hand rather than through a Date: a time of day has no date
 * and no zone, and building one would let the server's and the browser's zones
 * disagree during hydration.
 *
 * Pure module, no imports: `node --test` loads it directly.
 */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

function toArabicDigits2(n: number): string {
  return String(n).padStart(2, "0").replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

/**
 * "HH:MM" → {h,m}, or null when there is no readable hour.
 *
 * Deliberately not `^\d{2}:\d{2}$`: `<input type="time">` emits "HH:MM:SS" once
 * its step is sub-minute, and `metadata.time` on older rows is whatever string
 * was stored. A regex that misses would fall back to the all-day URL silently —
 * so this accepts a leading H:MM and a trailing remainder, and range-checks
 * what it read.
 */
export function parseTimeOfDay(raw: string | null | undefined): { h: number; m: number } | null {
  const hit = /^\s*(\d{1,2}):(\d{2})/.exec(raw ?? "");
  if (!hit) return null;
  const h = Number(hit[1]);
  const m = Number(hit[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/**
 * «hh:mm ص/م» in Arabic-Indic digits — the app's ar-SA 2-digit convention.
 * A value with no readable hour is returned unchanged rather than hidden: it is
 * whatever the lawyer stored, and dropping it would lose information.
 */
export function formatTimeOfDayAr(raw: string | null | undefined): string {
  const at = parseTimeOfDay(raw);
  if (!at) return raw ?? "";
  const h12 = at.h % 12 === 0 ? 12 : at.h % 12;
  const period = at.h < 12 ? "ص" : "م";
  return `${toArabicDigits2(h12)}:${toArabicDigits2(at.m)} ${period}`;
}
