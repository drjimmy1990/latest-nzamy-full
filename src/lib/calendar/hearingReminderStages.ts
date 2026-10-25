/**
 * hearingReminderStages.ts — WHEN a hearing is reminded, defined once.
 * ─────────────────────────────────────────────────────────────────────────
 * Two consumers read this module and must never disagree:
 *   - the .ics download (src/lib/calendar/hearingIcs.ts) turns each stage into
 *     a VALARM with a relative TRIGGER, and
 *   - the in-platform reminder engine (src/lib/hearingReminders.ts) turns each
 *     stage into a notification_outbox row.
 * The stage list is ONE constant (`HEARING_REMINDER_STAGES`). Owner question
 * ٢٦٥ (which stages, and whether the lawyer may add his own) is still open;
 * whatever he answers is an edit to that array and nothing else.
 *
 * ── Time semantics ───────────────────────────────────────────────────────
 * `hearings.hearing_date` / `hearing_time` are a WALL-CLOCK date and time
 * (20260903_phase1_case_tables.sql), not an instant, and the Google Calendar
 * link on the hearings page keeps them floating. Everything here therefore
 * works in wall-clock minutes computed with `Date.UTC` on the stored strings —
 * no local `Date`, so the server's and the browser's zones cannot shift a day.
 *
 *   7d / 3d     the hearing's own hour, N calendar days earlier. A hearing
 *               with no recorded hour is anchored at NO_TIME_ANCHOR (09:00).
 *   eve         the previous CALENDAR day at 20:00 — independent of the
 *               hearing's hour (a 08:00 and a 13:30 hearing both get 20:00).
 *   morning     the hearing day at 07:00. A hearing at or before 07:00 gets it
 *               EARLY_HEARING_LEAD_MINUTES (60) before its start instead; if
 *               that falls on the previous day (a hearing before 01:00) the
 *               stage is dropped — the eve reminder already covers that night.
 *   any stage   at or after the hearing's start is dropped.
 *
 * `minutesBeforeStart` is measured from the hearing's start: its hour, or for
 * a hearing with no hour the day's 00:00 (the start of an all-day event). It
 * is what the .ics writes as a relative TRIGGER, so a calendar app fires the
 * alarm at the same wall clock in the viewer's own zone. The server engine
 * instead reads the wall clock as Asia/Riyadh (see hearingReminders.ts).
 *
 * Pure, no imports: `node --test` loads it directly.
 */

export type HearingStageKey = "7d" | "3d" | "eve" | "morning";

interface StageBase {
  key: HearingStageKey;
  /** Short Arabic name of the stage («قبل الجلسة بأسبوع»). */
  labelAr: string;
  /** The reminder sentence («موعد الجلسة بعد أسبوع»). */
  bodyAr: string;
}

export type HearingStage =
  | (StageBase & { rule: "days_before"; days: number })
  | (StageBase & { rule: "day_at"; dayOffset: number; at: string });

/** The default stages (owner ٤٥ axis 2; question ٢٦٥ pending). */
export const HEARING_REMINDER_STAGES: readonly HearingStage[] = [
  { key: "7d", rule: "days_before", days: 7, labelAr: "قبل الجلسة بأسبوع", bodyAr: "موعد الجلسة بعد أسبوع" },
  { key: "3d", rule: "days_before", days: 3, labelAr: "قبل الجلسة بثلاثة أيام", bodyAr: "موعد الجلسة بعد ثلاثة أيام" },
  { key: "eve", rule: "day_at", dayOffset: -1, at: "20:00", labelAr: "مساء اليوم السابق", bodyAr: "موعد الجلسة غداً" },
  { key: "morning", rule: "day_at", dayOffset: 0, at: "07:00", labelAr: "صباح يوم الجلسة", bodyAr: "موعد الجلسة اليوم" },
];

/** The hour a hearing with no recorded time is reminded at, for the day-count stages. */
export const NO_TIME_ANCHOR = "09:00";
/** How long before an early hearing the morning reminder moves to. */
export const EARLY_HEARING_LEAD_MINUTES = 60;

export interface WallClock {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
}

export interface StageTarget {
  key: HearingStageKey;
  labelAr: string;
  bodyAr: string;
  at: WallClock;
  /** Minutes from this reminder to the hearing's start (negative = after an all-day start). */
  minutesBeforeStart: number;
}

const DAY = 1440;

/** "YYYY-MM-DD" → wall-clock minutes of that day's 00:00, or null when it is not a real date. */
export function parseHearingDate(raw: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms / 60000;
}

/** "HH:MM[:SS]" (or "H:MM") → {h, m}, or null when there is no readable hour. */
export function parseHearingTime(raw: string | null | undefined): { h: number; m: number } | null {
  const hit = /^\s*(\d{1,2}):(\d{2})/.exec(raw ?? "");
  if (!hit) return null;
  const h = Number(hit[1]);
  const m = Number(hit[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

function hhmmToMinutes(s: string): number {
  const t = parseHearingTime(s);
  return t ? t.h * 60 + t.m : 0;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Wall-clock minutes → {date, time}. */
export function minutesToWallClock(minutes: number): WallClock {
  const d = new Date(minutes * 60000);
  return {
    date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
  };
}

/**
 * The reminders of one hearing, soonest first. `[]` for an unreadable date.
 * See the module header for every rule applied here.
 */
export function hearingStageTargets(
  date: string,
  time: string | null | undefined,
  stages: readonly HearingStage[] = HEARING_REMINDER_STAGES,
): StageTarget[] {
  const day0 = parseHearingDate(date);
  if (day0 === null) return [];
  const t = parseHearingTime(time);
  const timed = t !== null;
  const start = timed ? day0 + t.h * 60 + t.m : day0;
  const anchor = timed ? start : day0 + hhmmToMinutes(NO_TIME_ANCHOR);

  const out: StageTarget[] = [];
  const seen = new Set<number>();
  for (const stage of stages) {
    let at: number;
    if (stage.rule === "days_before") {
      if (!Number.isInteger(stage.days) || stage.days < 1) continue;
      at = anchor - stage.days * DAY;
    } else {
      if (!Number.isInteger(stage.dayOffset) || stage.dayOffset > 0) continue;
      at = day0 + stage.dayOffset * DAY + hhmmToMinutes(stage.at);
      if (timed && stage.dayOffset === 0 && at >= start) {
        at = start - EARLY_HEARING_LEAD_MINUTES;
        if (at < day0) continue;
      }
    }
    if (timed && at >= start) continue;
    if (seen.has(at)) continue;
    seen.add(at);
    out.push({
      key: stage.key,
      labelAr: stage.labelAr,
      bodyAr: stage.bodyAr,
      at: minutesToWallClock(at),
      minutesBeforeStart: start - at,
    });
  }
  return out.sort((a, b) => b.minutesBeforeStart - a.minutesBeforeStart);
}
