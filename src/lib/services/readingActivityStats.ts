/**
 * readingActivityStats.ts — pure week/month rolling-window reset + increment
 * logic for the reading-activity counters (nzamy_activity localStorage key
 * for guests → preferences.readingActivity for signed-in users, Phase 6).
 *
 * Kept free of Next.js/Supabase/"@/" imports so it is testable with plain
 * `node --test` (same reasoning as preferencesMerge.ts's own runtime copy of
 * this shape — see that file's header comment). The `ReadingActivity` shape
 * mirrors preferencesService.ts / preferencesMerge.ts exactly: change all
 * three together if it ever changes.
 *
 * Before this module existed, src/app/laws/[slug]/page.tsx duplicated this
 * exact reset/increment block twice (a copy-paste artifact — two near-
 * identical `useEffect`s each reading+resetting+writing `nzamy_activity`),
 * so a single page view could double-count. One pure function, called once
 * per law opened, removes the duplication and is unit-testable without a
 * browser.
 */

export interface ReadingActivity {
  lawsThisWeek: number;
  lawsThisMonth: number;
  articles: number;
  principles: number;
  feqhPages: number;
  /** ISO 8601, or null if the week window has never been started. */
  lastWeekReset: string | null;
  /** ISO 8601, or null if the month window has never been started. */
  lastMonthReset: string | null;
}

export const EMPTY_READING_ACTIVITY: ReadingActivity = {
  lawsThisWeek: 0,
  lawsThisMonth: 0,
  articles: 0,
  principles: 0,
  feqhPages: 0,
  lastWeekReset: null,
  lastMonthReset: null,
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Parses a stored reset timestamp defensively: anything that is not a valid
 * ISO string (missing, wrong type, or a stale numeric `Date.now()` value
 * from before this module existed) is treated as "no reset yet", which is
 * the safe direction — it makes the window look elapsed rather than fresh,
 * so a corrupt/legacy value causes an extra reset instead of silently
 * suppressing one.
 */
function parseResetTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Applies the week/month rolling-window reset (when the window has elapsed,
 * or was never started) and records one more law opened. `now` is
 * injectable so tests do not depend on the wall clock.
 *
 * Fields the reset/increment logic does not touch (`articles`, `principles`,
 * `feqhPages`) pass through unchanged — this function only ever advances the
 * "law opened" counters.
 */
export function recordLawOpened(
  prev: Partial<ReadingActivity> | null | undefined,
  now: number = Date.now(),
): ReadingActivity {
  const base: ReadingActivity = { ...EMPTY_READING_ACTIVITY, ...(prev ?? {}) };
  const nowIso = new Date(now).toISOString();

  const lastWeek = parseResetTimestamp(base.lastWeekReset);
  const weekElapsed = lastWeek === null || now - lastWeek > WEEK_MS;

  const lastMonth = parseResetTimestamp(base.lastMonthReset);
  const monthElapsed = lastMonth === null || now - lastMonth > MONTH_MS;

  return {
    ...base,
    lawsThisWeek: (weekElapsed ? 0 : base.lawsThisWeek) + 1,
    lastWeekReset: weekElapsed ? nowIso : base.lastWeekReset,
    lawsThisMonth: (monthElapsed ? 0 : base.lawsThisMonth) + 1,
    lastMonthReset: monthElapsed ? nowIso : base.lastMonthReset,
  };
}
