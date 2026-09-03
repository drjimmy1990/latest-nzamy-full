import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDueDate, resolveHolidayDates, isNonWorkingDay, daysUntil, parseIsoDate, isoDate, addDays,
  pendingReminderOffsets, type HolidayRule,
} from "./deadlineEngine.ts";
import { hijriAvailable, gregorianFromHijri, hijriPartsOf } from "./hijri.ts";

const NATIONAL_DAY: HolidayRule = { id: "n", titleAr: "اليوم الوطني", kind: "gregorian_fixed", gregMonth: 9, gregDay: 23, lengthDays: 1, approximate: false, active: true };
const EID_FITR: HolidayRule = { id: "f", titleAr: "عطلة عيد الفطر", kind: "hijri_recurring", hijriMonth: 10, hijriDay: 1, lengthDays: 4, approximate: true, active: true };
const RANGE: HolidayRule = { id: "r", titleAr: "عطلة معلنة", kind: "date_range", startDate: "2026-11-10", endDate: "2026-11-12", lengthDays: 3, approximate: false, active: true };
const NONE = resolveHolidayDates([], 2026, 2027);

test("dates are wall-clock and overflow is refused", () => {
  assert.equal(isoDate(parseIsoDate("2026-09-04")!), "2026-09-04");
  assert.equal(parseIsoDate("2026-02-31"), null);
  assert.equal(parseIsoDate("4/9/2026"), null);
  assert.equal(isoDate(addDays(parseIsoDate("2026-12-31")!, 1)), "2027-01-01");
});

test("المادة ٢٢: a 30-day period starting the day after the event ends 30 days after it", () => {
  // 2026-09-01 is a Tuesday; +30 = 2026-10-01, a Thursday — no roll.
  const r = computeDueDate({ triggerDate: "2026-09-01", periodDays: 30, countFromNextDay: true, rollForwardIfHoliday: true, holidays: NONE })!;
  assert.equal(r.dueDate, "2026-10-01");
  assert.equal(r.daysCount, 30);
  assert.equal(r.rolledFromHoliday, false);
});

test("counting from the event day itself ends one day earlier", () => {
  const r = computeDueDate({ triggerDate: "2026-09-01", periodDays: 30, countFromNextDay: false, rollForwardIfHoliday: false, holidays: NONE })!;
  assert.equal(r.dueDate, "2026-09-30");
});

test("a last day on Friday rolls past the weekend to Sunday, and the result says why", () => {
  // 2026-09-02 (Wed) + 30 = 2026-10-02, a Friday.
  assert.equal(parseIsoDate("2026-10-02")!.getDay(), 5, "fixture: 2026-10-02 is a Friday");
  const r = computeDueDate({ triggerDate: "2026-09-02", periodDays: 30, countFromNextDay: true, rollForwardIfHoliday: true, holidays: NONE })!;
  assert.equal(r.dueDate, "2026-10-04");
  assert.equal(r.rolledDays, 2);
  assert.deepEqual(r.rolledPast.map((p) => p.reason), ["weekend", "weekend"]);
  assert.equal(r.daysCount, 32);
});

test("an official holiday rolls the last day forward and names itself", () => {
  const hol = resolveHolidayDates([NATIONAL_DAY], 2026, 2026);
  // 2026-08-24 (Mon) + 30 = 2026-09-23 (Wed) = اليوم الوطني
  const r = computeDueDate({ triggerDate: "2026-08-24", periodDays: 30, countFromNextDay: true, rollForwardIfHoliday: true, holidays: hol })!;
  assert.equal(r.dueDate, "2026-09-24");
  assert.equal(r.rolledDays, 1);
  assert.equal(r.rolledPast[0].reason, "holiday");
  assert.equal(r.rolledPast[0].titleAr, "اليوم الوطني");
});

test("rolling is a per-rule choice — off means the Friday stays", () => {
  const r = computeDueDate({ triggerDate: "2026-09-02", periodDays: 30, countFromNextDay: true, rollForwardIfHoliday: false, holidays: NONE })!;
  assert.equal(r.dueDate, "2026-10-02");
  assert.equal(r.rolledFromHoliday, false);
});

test("a date-range holiday covers every day in the range", () => {
  const hol = resolveHolidayDates([RANGE], 2026, 2026);
  assert.equal(hol.dates.size, 3);
  assert.equal(isNonWorkingDay(parseIsoDate("2026-11-11")!, hol.dates).reason, "holiday");
  assert.equal(isNonWorkingDay(parseIsoDate("2026-11-13")!, hol.dates).nonWorking, true, "2026-11-13 is a Friday");
  assert.equal(isNonWorkingDay(parseIsoDate("2026-11-16")!, hol.dates).nonWorking, false);
});

test("a Hijri recurring holiday resolves through Umm al-Qura into consecutive Gregorian days", { skip: !hijriAvailable() && "runtime has no islamic-umalqura data" }, () => {
  const hol = resolveHolidayDates([EID_FITR], 2026, 2026);
  assert.equal(hol.hijriResolved, true);
  const hy = hijriPartsOf(new Date(2026, 5, 1))!.year;         // the Hijri year running mid-2026
  const start = gregorianFromHijri(1, 10, hy)!;                 // ١ شوال of that year
  const expected = [0, 1, 2, 3].map((i) => isoDate(addDays(start, i)));
  for (const d of expected) assert.equal(hol.dates.get(d)?.titleAr, "عطلة عيد الفطر", `${d} should be Eid`);
  assert.ok(!hol.dates.has(isoDate(addDays(start, 4))), "the day after the range is a working day");
});

test("the result carries the Hijri label of the final date, or null, never a wrong one", () => {
  const r = computeDueDate({ triggerDate: "2026-09-01", periodDays: 30, countFromNextDay: true, rollForwardIfHoliday: true, holidays: NONE })!;
  if (hijriAvailable()) assert.ok(r.dueDateHijri && r.dueDateHijri.endsWith("هـ"));
  else assert.equal(r.dueDateHijri, null);
});

test("invalid input is null, not a guess", () => {
  assert.equal(computeDueDate({ triggerDate: "nope", periodDays: 30, countFromNextDay: true, rollForwardIfHoliday: true, holidays: NONE }), null);
  assert.equal(computeDueDate({ triggerDate: "2026-09-01", periodDays: 0, countFromNextDay: true, rollForwardIfHoliday: true, holidays: NONE }), null);
});

test("days left and the reminders still ahead", () => {
  const today = parseIsoDate("2026-09-20")!;
  assert.equal(daysUntil("2026-10-01", today), 11);
  assert.equal(daysUntil("2026-09-18", today), -2);
  assert.deepEqual(pendingReminderOffsets("2026-10-01", [7, 3, 1, 30], today), [7, 3, 1]);
  assert.deepEqual(pendingReminderOffsets("2026-09-18", [7, 3, 1], today), []);
});
