/**
 * scheduleClash.ts — ONE overlap rule for a lawyer's diary: consultations AND
 * hearings, checked in both directions (owner q357).
 *
 * LIVE-F35 gave consultations a warn-then-confirm overlap check, but it read
 * consultations only, and saving a hearing checked nothing. Now:
 *   - saving a consultation slot also reads the lawyer's scheduled hearings;
 *   - saving a hearing (new, edited hour/duration, postponed, reopened) reads
 *     the lawyer's scheduled consultations and other scheduled hearings.
 * The policy is unchanged: WARN AND CONFIRM, NOT BLOCK — a 409 with the
 * conflicts, and the same request with `confirmOverlap: true` is saved.
 *
 * ── Hearings are Riyadh wall clock ───────────────────────────────────────
 * A hearing row stores `hearing_date` + `hearing_time` with no zone; that wall
 * clock is the Kingdom's (UTC+3, no DST), the same rule hearingIcs.ts writes
 * as TZID=Asia/Riyadh. Consultations store an instant. Both are compared as
 * instants (ms) here. `hearing_time` arrives as "HH:MM:SS" from Postgres —
 * parseHearingTime reads it.
 *
 * A hearing with NO hour is skipped: it holds a day, not a slot, and
 * inventing an hour for it would warn about clashes that do not exist.
 *
 * Durations: a consultation keeps its own bounds (5..480, else 60); a
 * hearing's are 5..1440 (item 59), else 60. They are normalised separately
 * — the consultation rule would turn a 10-hour sitting into one hour.
 *
 * Touching ends do NOT overlap: 09:00–10:00 then 10:00–11:00 is no clash.
 *
 * Pure, relative imports only: `node --test` loads it directly.
 */

import {
  DEFAULT_CONSULTATION_MINUTES,
  formatRiyadhSlotAr,
  isValidDuration,
  riyadhSlotMs,
  riyadhWallClock,
} from "./consultationSchedule.ts";
import { parseHearingTime } from "../calendar/hearingReminderStages.ts";
import { isIsoDate } from "../riyadhToday.ts";

export type ScheduleKind = "consultation" | "hearing";

/** One booked slot of the diary, as an instant. */
export interface ScheduleItem {
  kind: ScheduleKind;
  id: string;
  startMs: number;
  durationMinutes: number;
}

/** What a 409 lists: the same shape the consultation guard always returned, plus `kind`. */
export interface ScheduleConflict {
  kind: ScheduleKind;
  id: string;
  scheduledAt: string;
  durationMinutes: number;
}

/** The 409 `code` the hearing routes return for an unconfirmed overlap. */
export const HEARING_OVERLAP_CODE = "hearing_overlap";

export const DEFAULT_HEARING_MINUTES = 60;
export const MIN_HEARING_MINUTES = 5;
export const MAX_HEARING_MINUTES = 1440;

const MINUTE_MS = 60 * 1000;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** A hearing's stored length, or the 60-minute default (5..1440 is a real length). */
export function hearingDurationMinutes(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_HEARING_MINUTES && value <= MAX_HEARING_MINUTES
    ? value
    : DEFAULT_HEARING_MINUTES;
}

/** The instant a hearing starts (Riyadh wall clock), or null for a bad day or no hour. */
export function hearingStartMs(date: string | null | undefined, time: string | null | undefined): number | null {
  if (!date || !isIsoDate(date)) return null;
  const t = parseHearingTime(time);
  if (!t) return null;
  return riyadhSlotMs(date, `${pad2(t.h)}:${pad2(t.m)}`);
}

export interface ConsultationSlotRow {
  id: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
}

export interface HearingSlotRow {
  id: string;
  hearing_date: string;
  hearing_time: string | null;
  duration_minutes: number | null;
}

export function consultationItems(rows: readonly ConsultationSlotRow[]): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (const r of rows) {
    const startMs = r.scheduled_at ? Date.parse(r.scheduled_at) : NaN;
    if (!Number.isFinite(startMs)) continue;
    const durationMinutes = isValidDuration(r.duration_minutes) ? r.duration_minutes : DEFAULT_CONSULTATION_MINUTES;
    out.push({ kind: "consultation", id: r.id, startMs, durationMinutes });
  }
  return out;
}

/** Timed hearings only — a row with no hour is skipped (see the header). */
export function hearingItems(rows: readonly HearingSlotRow[]): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (const r of rows) {
    const startMs = hearingStartMs(r.hearing_date, r.hearing_time);
    if (startMs === null) continue;
    out.push({ kind: "hearing", id: r.id, startMs, durationMinutes: hearingDurationMinutes(r.duration_minutes) });
  }
  return out;
}

/** [aStart, aEnd) and [bStart, bEnd) share a minute; touching ends do not. */
export function intervalsOverlap(aStartMs: number, aMinutes: number, bStartMs: number, bMinutes: number): boolean {
  return aStartMs < bStartMs + bMinutes * MINUTE_MS && bStartMs < aStartMs + aMinutes * MINUTE_MS;
}

/**
 * The booked slots that share any minute with [startMs, startMs + duration),
 * soonest first. `exclude` is the row being saved (its own old slot).
 */
export function findScheduleClashes(
  startMs: number,
  durationMinutes: number,
  items: readonly ScheduleItem[],
  exclude?: { kind: ScheduleKind; id: string } | null,
): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  for (const it of items) {
    if (exclude && it.kind === exclude.kind && it.id === exclude.id) continue;
    if (!intervalsOverlap(startMs, durationMinutes, it.startMs, it.durationMinutes)) continue;
    out.push({ kind: it.kind, id: it.id, scheduledAt: new Date(it.startMs).toISOString(), durationMinutes: it.durationMinutes });
  }
  return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/**
 * The Riyadh days a hearing query must cover for a slot: from the day before
 * its start (a sitting of up to 1440 minutes can still be running) to the day
 * it ends.
 */
export function hearingQueryDays(startMs: number, durationMinutes: number): { fromDay: string; toDay: string } {
  const from = riyadhWallClock(startMs - MAX_HEARING_MINUTES * MINUTE_MS);
  const to = riyadhWallClock(startMs + durationMinutes * MINUTE_MS);
  return { fromDay: from?.date ?? "", toDay: to?.date ?? "" };
}

function arDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

const KIND_AR: Record<ScheduleKind, string> = { consultation: "استشارة", hearing: "جلسة" };

/** «يتعارض هذا الموعد مع جلسة مجدولة: ٣٠ أكتوبر ٢٠٢٦ · ٩:٠٠ ص بتوقيت الرياض (٦٠ دقيقة). …» */
export function clashMessageAr(conflicts: readonly ScheduleConflict[]): string {
  const slot = (c: ScheduleConflict) => `${formatRiyadhSlotAr(c.scheduledAt)} (${arDigits(c.durationMinutes)} دقيقة)`;
  const tail = "أكّد الحفظ رغم التعارض أو اختر وقتاً آخر.";
  if (conflicts.length === 1) {
    return `يتعارض هذا الموعد مع ${KIND_AR[conflicts[0].kind]} مجدولة أخرى: ${slot(conflicts[0])}. ${tail}`;
  }
  const kinds = new Set(conflicts.map((c) => c.kind));
  const what = kinds.size === 1
    ? `${arDigits(conflicts.length)} ${conflicts[0].kind === "hearing" ? "جلسات" : "استشارات"} مجدولة`
    : `${arDigits(conflicts.length)} مواعيد مجدولة`;
  const list = conflicts.map((c) => `${KIND_AR[c.kind]} ${slot(c)}`).join("، ");
  return `يتعارض هذا الموعد مع ${what}: ${list}. ${tail}`;
}
