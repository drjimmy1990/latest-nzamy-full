/**
 * consultationSchedule.test.ts — owner findings LIVE-F34, LIVE-F35, LIVE-F37,
 * CODE-F31 (30-Oct package).
 *
 * Nothing here may depend on the machine's zone — that dependence IS LIVE-F37.
 * Run it under two zones to prove it:
 *   TZ=UTC           node --test src/lib/services/consultationSchedule.test.ts
 *   TZ=Africa/Cairo  node --test src/lib/services/consultationSchedule.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSULTATION_OVERLAP_CODE,
  DEFAULT_CONSULTATION_MINUTES,
  SLOT_BAD_DATE_AR,
  SLOT_BAD_TIME_AR,
  SLOT_NO_ZONE_AR,
  SLOT_PARTIAL_AR,
  checkDayTimeSlot,
  checkInstantSlot,
  findOverlaps,
  formatClockAr,
  formatRiyadhSlotAr,
  formatRiyadhTimeAr,
  isClockTime,
  isValidDuration,
  overlapMessageAr,
  overlapQueryWindow,
  riyadhSlotIso,
  riyadhWallClock,
} from "./consultationSchedule.ts";

// 29 Oct 2026, 21:00 Riyadh (18:00Z) — the evening of the owner's CONS09 test.
const EVENING_29_OCT = Date.UTC(2026, 9, 29, 18, 0);

test("LIVE-F37: 15:15 Riyadh is stored as 12:15Z and read back as 15:15, whatever the machine zone", () => {
  const iso = riyadhSlotIso("2026-10-30", "15:15");
  assert.equal(iso, "2026-10-30T12:15:00.000Z");
  assert.deepEqual(riyadhWallClock(iso), { date: "2026-10-30", time: "15:15" });
  assert.equal(formatRiyadhTimeAr(iso), "٣:١٥ م");
  assert.equal(formatRiyadhSlotAr(iso), "٣٠ أكتوبر ٢٠٢٦ · ٣:١٥ م بتوقيت الرياض");
});

test("LIVE-F37: the instant the database trigger stores (at time zone 'Asia/Riyadh') round-trips", () => {
  // What Postgres returns for '2026-10-30 15:15'::timestamp at time zone 'Asia/Riyadh'.
  assert.deepEqual(riyadhWallClock("2026-10-30T12:15:00+00:00"), { date: "2026-10-30", time: "15:15" });
});

test("Riyadh's day changes at 21:00Z, not at the machine's midnight", () => {
  assert.deepEqual(riyadhWallClock("2026-10-29T21:30:00Z"), { date: "2026-10-30", time: "00:30" });
  assert.deepEqual(riyadhWallClock("2026-10-29T20:59:00Z"), { date: "2026-10-29", time: "23:59" });
  assert.equal(riyadhSlotIso("2026-10-30", "01:01"), "2026-10-29T22:01:00.000Z");
});

test("no daylight saving: the offset is +3 in January and in July", () => {
  assert.equal(riyadhSlotIso("2026-01-15", "09:00"), "2026-01-15T06:00:00.000Z");
  assert.equal(riyadhSlotIso("2026-07-15", "09:00"), "2026-07-15T06:00:00.000Z");
});

test("clock formatting covers midnight and noon", () => {
  assert.equal(formatClockAr("00:05"), "١٢:٠٥ ص");
  assert.equal(formatClockAr("12:00"), "١٢:٠٠ م");
  assert.equal(formatClockAr("23:59"), "١١:٥٩ م");
  assert.equal(formatClockAr("24:00"), null);
});

test("CODE-F31: both blank is an unscheduled request, never a slot", () => {
  assert.deepEqual(checkDayTimeSlot("", "", EVENING_29_OCT), { kind: "unscheduled" });
  assert.deepEqual(checkDayTimeSlot(undefined, undefined, EVENING_29_OCT), { kind: "unscheduled" });
  assert.deepEqual(checkDayTimeSlot(null, " ", EVENING_29_OCT), { kind: "unscheduled" });
});

test("CODE-F31: a date without a time, or a time without a date, is refused", () => {
  assert.deepEqual(checkDayTimeSlot("2026-11-01", "", EVENING_29_OCT), { kind: "invalid", error: SLOT_PARTIAL_AR });
  assert.deepEqual(checkDayTimeSlot("", "10:00", EVENING_29_OCT), { kind: "invalid", error: SLOT_PARTIAL_AR });
});

test("an impossible date or time is refused, not normalised", () => {
  assert.deepEqual(checkDayTimeSlot("2026-02-31", "10:00", EVENING_29_OCT), { kind: "invalid", error: SLOT_BAD_DATE_AR });
  assert.deepEqual(checkDayTimeSlot("30/10/2026", "10:00", EVENING_29_OCT), { kind: "invalid", error: SLOT_BAD_DATE_AR });
  assert.deepEqual(checkDayTimeSlot("2026-11-01", "25:00", EVENING_29_OCT), { kind: "invalid", error: SLOT_BAD_TIME_AR });
  assert.deepEqual(checkDayTimeSlot("2026-11-01", "9:00", EVENING_29_OCT), { kind: "invalid", error: SLOT_BAD_TIME_AR });
  assert.deepEqual(checkDayTimeSlot(20261101, "10:00", EVENING_29_OCT), { kind: "invalid", error: SLOT_BAD_DATE_AR });
  assert.equal(isClockTime("23:59"), true);
  assert.equal(isClockTime("23:60"), false);
});

test("LIVE-F34: 01:01 today, entered in the evening, is refused — the day alone is not enough", () => {
  const r = checkDayTimeSlot("2026-10-29", "01:01", EVENING_29_OCT);
  assert.equal(r.kind, "invalid");
  assert.match((r as { error: string }).error, /وقت مضى/);
  assert.match((r as { error: string }).error, /٩:٠٠ م بتوقيت الرياض/);
});

test("LIVE-F34: the current minute is refused, the next one is accepted", () => {
  // 21:00 Riyadh exactly.
  assert.equal(checkDayTimeSlot("2026-10-29", "21:00", EVENING_29_OCT).kind, "invalid");
  const next = checkDayTimeSlot("2026-10-29", "21:01", EVENING_29_OCT);
  assert.equal(next.kind, "slot");
  assert.equal((next as { startIso: string }).startIso, "2026-10-29T18:01:00.000Z");
});

test("LIVE-F34: later today and tomorrow are accepted", () => {
  assert.equal(checkDayTimeSlot("2026-10-29", "23:30", EVENING_29_OCT).kind, "slot");
  assert.equal(checkDayTimeSlot("2026-10-30", "01:01", EVENING_29_OCT).kind, "slot");
});

test("LIVE-F37: an API instant must carry its zone", () => {
  assert.deepEqual(checkInstantSlot("2026-10-30T15:15", EVENING_29_OCT, true), { kind: "invalid", error: SLOT_NO_ZONE_AR });
  const plus3 = checkInstantSlot("2026-10-30T15:15:00+03:00", EVENING_29_OCT, true);
  assert.equal(plus3.kind, "slot");
  assert.equal((plus3 as { startIso: string }).startIso, "2026-10-30T12:15:00.000Z");
  assert.equal(checkInstantSlot("2026-10-30T12:15:00.000Z", EVENING_29_OCT, true).kind, "slot");
});

test("LIVE-F34: an API instant in the past is refused only when a future slot is required", () => {
  assert.equal(checkInstantSlot("2026-10-29T10:00:00Z", EVENING_29_OCT, true).kind, "invalid");
  assert.equal(checkInstantSlot("2026-10-29T10:00:00Z", EVENING_29_OCT, false).kind, "slot");
});

test("durations: integers 5..480 only", () => {
  for (const ok of [5, 30, 60, 480]) assert.equal(isValidDuration(ok), true, String(ok));
  for (const bad of [4, 481, 60.5, -60, "60", null, Number.NaN]) assert.equal(isValidDuration(bad), false, String(bad));
});

test("LIVE-F35: 13:30 and 14:00, both 60 minutes, overlap", () => {
  const first = { id: "a", scheduledAt: riyadhSlotIso("2026-10-30", "13:30") as string, durationMinutes: 60 };
  const startMs = Date.parse(riyadhSlotIso("2026-10-30", "14:00") as string);
  const conflicts = findOverlaps(startMs, 60, [first]);
  assert.deepEqual(conflicts, [{ id: "a", scheduledAt: "2026-10-30T10:30:00.000Z", durationMinutes: 60 }]);
  assert.match(overlapMessageAr(conflicts), /١:٣٠ م بتوقيت الرياض \(٦٠ دقيقة\)/);
});

test("LIVE-F35: back-to-back slots do not overlap; the row itself is excluded", () => {
  const first = { id: "a", scheduledAt: riyadhSlotIso("2026-10-30", "13:00") as string, durationMinutes: 60 };
  const startMs = Date.parse(riyadhSlotIso("2026-10-30", "14:00") as string);
  assert.deepEqual(findOverlaps(startMs, 60, [first]), []);
  // Before the first one, ending exactly as it starts.
  assert.deepEqual(findOverlaps(startMs - 2 * 3_600_000, 60, [first]), []);
  // Rescheduling row "a" onto itself is not a conflict.
  assert.deepEqual(findOverlaps(Date.parse(first.scheduledAt) + 15 * 60_000, 60, [first], "a"), []);
});

test("LIVE-F35: a stored row with no duration counts as the default 60 minutes", () => {
  const legacy = { id: "b", scheduledAt: riyadhSlotIso("2026-10-30", "10:00") as string, durationMinutes: null };
  assert.equal(DEFAULT_CONSULTATION_MINUTES, 60);
  assert.equal(findOverlaps(Date.parse(riyadhSlotIso("2026-10-30", "10:59") as string), 30, [legacy]).length, 1);
  assert.equal(findOverlaps(Date.parse(riyadhSlotIso("2026-10-30", "11:00") as string), 30, [legacy]).length, 0);
});

test("LIVE-F35: a long slot that started earlier is caught by the query window", () => {
  const startMs = Date.parse(riyadhSlotIso("2026-10-30", "14:00") as string);
  const { fromIso, toIso } = overlapQueryWindow(startMs, 60);
  assert.equal(fromIso, "2026-10-30T03:00:00.000Z"); // 8 hours before
  assert.equal(toIso, "2026-10-30T12:00:00.000Z");
  const eightHours = { id: "c", scheduledAt: "2026-10-30T03:30:00.000Z", durationMinutes: 480 };
  assert.equal(findOverlaps(startMs, 60, [eightHours]).length, 1);
});

test("the 409 code is the one the client matches on", () => {
  assert.equal(CONSULTATION_OVERLAP_CODE, "consultation_overlap");
});
