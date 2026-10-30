/**
 * consultationSchedule.ts — the ONE rule for a consultation's time slot.
 *
 * Imported by both booking screens (the lawyer's «جدولة استشارة جديدة» modal
 * and the schedule/reschedule action modal) AND by both server routes that
 * write a slot (POST /api/v1/service-requests for a new booking, PATCH
 * /api/v1/lawyer/consultations/[id] for a reschedule), so the screen and the
 * server cannot disagree about what a valid slot is.
 *
 * ── RIYADH, NOT THE BROWSER (owner finding LIVE-F37) ────────────────────────
 *
 * A consultation is entered, reviewed, stored and shown as a Riyadh wall-clock
 * time. Riyadh is UTC+3 all year — Saudi Arabia keeps no daylight saving — so
 * the conversion is a fixed offset, done with `Date.UTC` arithmetic and never
 * with the machine's zone. The owner's live test typed 15:15, saved it
 * correctly (12:15Z), and was shown 14:15 because the card formatted the
 * instant in the BROWSER's zone (UTC+2 that day). Nothing here reads the
 * machine's zone, so the same input gives the same answer on any computer.
 *
 * ── NOW IS A PARAMETER ──────────────────────────────────────────────────────
 *
 * Every check takes `nowMs` from the caller: the server passes `Date.now()`
 * per request, a screen passes a value read after mount. Never a module-level
 * `new Date()` — that is the SSR cached-date trap.
 */

import { isIsoDate } from "../riyadhToday.ts";

export const RIYADH_TIME_ZONE = "Asia/Riyadh";
/** Printed next to every consultation time, so the zone is always named. */
export const RIYADH_ZONE_LABEL_AR = "بتوقيت الرياض";
/** Riyadh is UTC+3 with no daylight saving. */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const MIN_CONSULTATION_MINUTES = 5;
export const MAX_CONSULTATION_MINUTES = 480;
/**
 * What a stored row with no `duration_minutes` is counted as when checking
 * overlap — the duration the booking modal preselects.
 */
export const DEFAULT_CONSULTATION_MINUTES = 60;

/** The 409 `code` both routes return for an unconfirmed overlap. */
export const CONSULTATION_OVERLAP_CODE = "consultation_overlap";

export const SLOT_PARTIAL_AR =
  "أدخل التاريخ والوقت معاً لتأكيد الموعد، أو اتركهما فارغين ليبقى الطلب «بانتظار الجدولة».";
export const SLOT_BAD_DATE_AR = "تاريخ الاستشارة غير صحيح.";
export const SLOT_BAD_TIME_AR = "وقت الاستشارة غير صحيح. اكتبه بصيغة ساعة:دقيقة.";
export const SLOT_NO_ZONE_AR = "موعد الاستشارة يجب أن يحمل المنطقة الزمنية.";
export const DURATION_BAD_AR = "مدة الاستشارة يجب أن تكون بين ٥ و٤٨٠ دقيقة.";

const AR_GREGORIAN_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

function arDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/** "HH:MM", 24-hour, 00:00–23:59. */
export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** The instant (ms) of a Riyadh wall-clock day + time, or null when either is not real. */
export function riyadhSlotMs(day: string, time: string): number | null {
  if (!isIsoDate(day) || !isClockTime(time)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - RIYADH_OFFSET_MS;
}

/** The ISO instant ("…Z") of a Riyadh wall-clock day + time, or null. */
export function riyadhSlotIso(day: string, time: string): string | null {
  const ms = riyadhSlotMs(day, time);
  return ms === null ? null : new Date(ms).toISOString();
}

/** Riyadh wall clock of an instant: { date: "YYYY-MM-DD", time: "HH:MM" }, or null. */
export function riyadhWallClock(instant: string | number | Date | null | undefined): { date: string; time: string } | null {
  if (instant === null || instant === undefined || instant === "") return null;
  const ms = instant instanceof Date ? instant.getTime() : typeof instant === "number" ? instant : Date.parse(instant);
  if (!Number.isFinite(ms)) return null;
  const r = new Date(ms + RIYADH_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`,
    time: `${pad(r.getUTCHours())}:${pad(r.getUTCMinutes())}`,
  };
}

/** «٣:١٥ م» — 12-hour Arabic time of an instant in Riyadh, without the zone label. */
export function formatRiyadhTimeAr(instant: string | number | Date | null | undefined): string | null {
  const wc = riyadhWallClock(instant);
  return wc ? formatClockAr(wc.time) : null;
}

/** «٣:١٥ م» from "15:15". */
export function formatClockAr(time: string): string | null {
  if (!isClockTime(time)) return null;
  const [hh, mm] = time.split(":").map(Number);
  const period = hh < 12 ? "ص" : "م";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${arDigits(h12)}:${arDigits(String(mm).padStart(2, "0"))} ${period}`;
}

/** «٣٠ أكتوبر ٢٠٢٦ · ٣:١٥ م بتوقيت الرياض», or null. */
export function formatRiyadhSlotAr(instant: string | number | Date | null | undefined): string | null {
  const wc = riyadhWallClock(instant);
  if (!wc) return null;
  const [y, m, d] = wc.date.split("-").map(Number);
  return `${arDigits(d)} ${AR_GREGORIAN_MONTHS[m - 1]} ${arDigits(y)} · ${formatClockAr(wc.time)} ${RIYADH_ZONE_LABEL_AR}`;
}

/** The refusal for a slot that is not after `nowMs`, naming the current Riyadh time. */
export function pastSlotMessageAr(nowMs: number): string {
  const nowAr = formatRiyadhTimeAr(nowMs);
  return `لا يمكن جدولة استشارة في وقت مضى. الساعة الآن ${nowAr ?? "—"} ${RIYADH_ZONE_LABEL_AR}؛ اختر وقتاً لاحقاً.`;
}

export type SlotCheck =
  | { kind: "unscheduled" }
  | { kind: "slot"; startMs: number; startIso: string }
  | { kind: "invalid"; error: string };

/**
 * A day + time pair, as the booking modal and `metadata.day`/`metadata.time`
 * carry it. Both blank = an unscheduled request («بانتظار الجدولة»); one of the
 * two = refused (the database trigger used to drop a lone date silently); both
 * = a slot, which must be a real date and time strictly after `nowMs`.
 */
export function checkDayTimeSlot(day: unknown, time: unknown, nowMs: number): SlotCheck {
  const d = typeof day === "string" ? day.trim() : day == null ? "" : null;
  const t = typeof time === "string" ? time.trim() : time == null ? "" : null;
  if (d === null) return { kind: "invalid", error: SLOT_BAD_DATE_AR };
  if (t === null) return { kind: "invalid", error: SLOT_BAD_TIME_AR };
  if (!d && !t) return { kind: "unscheduled" };
  if (!d || !t) return { kind: "invalid", error: SLOT_PARTIAL_AR };
  if (!isIsoDate(d)) return { kind: "invalid", error: SLOT_BAD_DATE_AR };
  if (!isClockTime(t)) return { kind: "invalid", error: SLOT_BAD_TIME_AR };
  const startMs = riyadhSlotMs(d, t) as number;
  if (startMs <= nowMs) return { kind: "invalid", error: pastSlotMessageAr(nowMs) };
  return { kind: "slot", startMs, startIso: new Date(startMs).toISOString() };
}

/**
 * An ISO instant from an API body. It must carry its zone ("Z" or ±HH:MM): a
 * zone-less "2026-10-30T15:15" would be read in whatever zone the reader runs
 * in, which is how a time drifts by an hour. `requireFuture` refuses a slot
 * that is not strictly after `nowMs`.
 */
export function checkInstantSlot(value: unknown, nowMs: number, requireFuture: boolean): SlotCheck {
  if (typeof value !== "string" || !value.trim()) return { kind: "invalid", error: SLOT_BAD_DATE_AR };
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(v)) {
    return { kind: "invalid", error: SLOT_NO_ZONE_AR };
  }
  const startMs = Date.parse(v);
  if (!Number.isFinite(startMs)) return { kind: "invalid", error: SLOT_BAD_DATE_AR };
  if (requireFuture && startMs <= nowMs) return { kind: "invalid", error: pastSlotMessageAr(nowMs) };
  return { kind: "slot", startMs, startIso: new Date(startMs).toISOString() };
}

/** An integer number of minutes in 5..480. */
export function isValidDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_CONSULTATION_MINUTES && value <= MAX_CONSULTATION_MINUTES;
}

export interface ScheduledSlot {
  id: string;
  scheduledAt: string;
  durationMinutes: number | null;
}

export interface SlotConflict {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
}

/**
 * The scheduled slots that share any minute with [startMs, startMs + duration).
 * Touching ends (14:00–15:00 then 15:00–16:00) do NOT overlap. A stored row
 * with no duration counts as DEFAULT_CONSULTATION_MINUTES.
 */
export function findOverlaps(
  startMs: number,
  durationMinutes: number,
  others: ScheduledSlot[],
  excludeId?: string | null,
): SlotConflict[] {
  const endMs = startMs + durationMinutes * MINUTE_MS;
  const out: SlotConflict[] = [];
  for (const o of others) {
    if (excludeId && o.id === excludeId) continue;
    const oStart = Date.parse(o.scheduledAt);
    if (!Number.isFinite(oStart)) continue;
    const oDur = isValidDuration(o.durationMinutes) ? o.durationMinutes : DEFAULT_CONSULTATION_MINUTES;
    const oEnd = oStart + oDur * MINUTE_MS;
    if (startMs < oEnd && oStart < endMs) out.push({ id: o.id, scheduledAt: new Date(oStart).toISOString(), durationMinutes: oDur });
  }
  return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** The look-back window an overlap query needs: the longest slot that could still be running at `startMs`. */
export function overlapQueryWindow(startMs: number, durationMinutes: number): { fromIso: string; toIso: string } {
  return {
    fromIso: new Date(startMs - MAX_CONSULTATION_MINUTES * MINUTE_MS).toISOString(),
    toIso: new Date(startMs + durationMinutes * MINUTE_MS).toISOString(),
  };
}

/** «يتعارض هذا الموعد مع استشارة مجدولة: ٣٠ أكتوبر ٢٠٢٦ · ١:٣٠ م بتوقيت الرياض (٦٠ دقيقة).» */
export function overlapMessageAr(conflicts: SlotConflict[]): string {
  const list = conflicts
    .map((c) => `${formatRiyadhSlotAr(c.scheduledAt)} (${arDigits(c.durationMinutes)} دقيقة)`)
    .join("، ");
  return conflicts.length === 1
    ? `يتعارض هذا الموعد مع استشارة مجدولة أخرى: ${list}. أكّد الحفظ رغم التعارض أو اختر وقتاً آخر.`
    : `يتعارض هذا الموعد مع ${arDigits(conflicts.length)} استشارات مجدولة: ${list}. أكّد الحفظ رغم التعارض أو اختر وقتاً آخر.`;
}
