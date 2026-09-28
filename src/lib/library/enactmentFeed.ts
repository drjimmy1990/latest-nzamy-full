/**
 * The two lists behind the /laws countdown widget (GET /api/library/enactments):
 * laws that take effect soon, and laws that took effect in the last 14 days
 * (owner decision T28-27, option ب).
 *
 * Why this exists: the route used to filter on `effective_date_gregorian`, and
 * that column is EMPTY on every one of the 5,899 laws (probed 2026-09-28) — so
 * the widget never showed anything. The dates live in `effective_date_hijri`
 * (561 rows, mixed shapes «1448/08/12», «1448-02-05», «…هـ»). Each row's
 * effective day is therefore resolved here: the stored Gregorian date when one
 * exists, otherwise the Hijri date through Umm al-Qura — the same parser and
 * calendar the legislative monitor uses (monitorFeed.ts), so the widget and
 * «راصد التشريعات» never disagree about a law.
 *
 * Pure except for the runtime's Umm al-Qura calendar; `node --test` loads it.
 */
import { hijriToIsoDate, parseHijriDate } from "./monitorFeed.ts";
import {
  RECENT_ENACTMENT_WINDOW_DAYS,
  daysSinceEffectiveDate,
  daysUntilEffectiveDate,
} from "../services/enactmentCountdown.ts";

export interface EnactmentRow {
  slug?: unknown;
  status?: unknown;
  effective_date_gregorian?: unknown;
  effective_date_hijri?: unknown;
  [key: string]: unknown;
}

export const ENACTMENT_LIST_LIMIT = 12;

/** The row's effective day as YYYY-MM-DD, or null when it has none we trust. */
export function resolveEffectiveIso(row: EnactmentRow): string | null {
  const g = typeof row.effective_date_gregorian === "string" ? row.effective_date_gregorian.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(g)) return g;
  const h = parseHijriDate(row.effective_date_hijri);
  return h ? hijriToIsoDate(h) : null;
}

export interface SplitEnactments<T> {
  upcoming: Array<T & { effectiveIso: string; daysRemaining: number }>;
  recent: Array<T & { effectiveIso: string; daysSinceEffective: number }>;
}

/**
 * Upcoming = effective AFTER today (soonest first); recent = effective today or
 * in the 14 days before (newest first). A repealed law is in neither. One `now`
 * for both lists, so a request that straddles Saudi midnight cannot put a law
 * in both or in neither.
 */
export function splitEnactments<T extends EnactmentRow>(
  rows: T[],
  now: Date,
  limit = ENACTMENT_LIST_LIMIT,
): SplitEnactments<T> {
  const upcoming: SplitEnactments<T>["upcoming"] = [];
  const recent: SplitEnactments<T>["recent"] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.status === "repealed") continue;
    const key = typeof row.slug === "string" ? row.slug : "";
    if (key && seen.has(key)) continue;
    const effectiveIso = resolveEffectiveIso(row);
    if (!effectiveIso) continue;
    const since = daysSinceEffectiveDate(effectiveIso, now);
    if (since === null) {
      const daysRemaining = daysUntilEffectiveDate(effectiveIso, now);
      if (daysRemaining === null || daysRemaining < 1) continue;
      upcoming.push({ ...row, effectiveIso, daysRemaining });
    } else if (since <= RECENT_ENACTMENT_WINDOW_DAYS) {
      recent.push({ ...row, effectiveIso, daysSinceEffective: since });
    } else {
      continue;
    }
    if (key) seen.add(key);
  }
  const bySlug = (a: T, b: T) => String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining || bySlug(a, b));
  recent.sort((a, b) => a.daysSinceEffective - b.daysSinceEffective || bySlug(a, b));
  return { upcoming: upcoming.slice(0, limit), recent: recent.slice(0, limit) };
}
