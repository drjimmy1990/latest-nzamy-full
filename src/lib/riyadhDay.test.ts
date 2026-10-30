import { test } from "node:test";
import assert from "node:assert/strict";
import {
  riyadhToday, shiftDay, riyadhDayIn, riyadhMonthsAhead, riyadhDayOf,
  msUntilNextRiyadhMidnight, daysBetween, relativeDayAr, dayUrgency,
} from "./riyadhDay.ts";

// LIVE-F38's exact instant: 21:00 UTC on 29 October = 00:00 on 30 October in Riyadh.
const T_2100_UTC = new Date("2026-10-29T21:00:00Z");

test("LIVE-F38: at 21:00 UTC the day is already the 30th in Riyadh, whatever the runtime zone", () => {
  assert.equal(riyadhToday(T_2100_UTC), "2026-10-30");
  assert.equal(riyadhToday(new Date("2026-10-29T20:59:59Z")), "2026-10-29");
  // the UTC slice the tasks page used gives the wrong day at that instant
  assert.equal(T_2100_UTC.toISOString().slice(0, 10), "2026-10-29");
});

test("day offsets are calendar days on the Riyadh day, not UTC slices", () => {
  assert.equal(riyadhDayIn(0, T_2100_UTC), "2026-10-30");
  assert.equal(riyadhDayIn(1, T_2100_UTC), "2026-10-31");
  assert.equal(riyadhDayIn(7, T_2100_UTC), "2026-11-06");
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDay("not-a-day", 3), "not-a-day");
});

test("a month ahead clamps to the month's last day", () => {
  assert.equal(riyadhMonthsAhead(1, new Date("2026-01-31T09:00:00Z")), "2026-02-28");
  assert.equal(riyadhMonthsAhead(3, T_2100_UTC), "2027-01-30");
});

test("riyadhDayOf: date columns pass through, timestamps land on their Riyadh day", () => {
  assert.equal(riyadhDayOf("2026-11-01"), "2026-11-01");
  assert.equal(riyadhDayOf("2026-10-29T22:30:00Z"), "2026-10-30");
  assert.equal(riyadhDayOf("2026-10-29T10:00:00+03:00"), "2026-10-29");
  assert.equal(riyadhDayOf(null), null);
  assert.equal(riyadhDayOf("garbage"), null);
});

test("the midnight timer lands just inside the next Riyadh day", () => {
  const ms = msUntilNextRiyadhMidnight(new Date("2026-10-29T20:00:00Z")); // 23:00 Riyadh
  assert.equal(ms, 60 * 60 * 1000 + 1000);
  const at = new Date(new Date("2026-10-29T20:00:00Z").getTime() + ms);
  assert.equal(riyadhToday(at), "2026-10-30");
});

test("CODE-F29: never «خلال -N أيام» — past days read as late", () => {
  const digits = (n: number) => String(n);
  assert.equal(relativeDayAr("2026-10-30", "2026-10-30", digits), "اليوم");
  assert.equal(relativeDayAr("2026-10-30", "2026-10-31", digits), "غداً");
  assert.equal(relativeDayAr("2026-10-30", "2026-11-02", digits), "خلال 3 أيام");
  assert.equal(relativeDayAr("2026-10-30", "2026-10-29", digits), "متأخرة يوماً واحداً");
  assert.equal(relativeDayAr("2026-10-30", "2026-10-27", digits), "متأخرة 3 أيام");
  assert.doesNotMatch(relativeDayAr("2026-10-30", "2026-10-20", digits), /-/);
  assert.equal(daysBetween("2026-10-30", "bad"), null);
});

test("one urgency per day distance", () => {
  assert.equal(dayUrgency("2026-10-30", "2026-10-29"), "overdue");
  assert.equal(dayUrgency("2026-10-30", "2026-10-30"), "today");
  assert.equal(dayUrgency("2026-10-30", "2026-11-02"), "soon");
  assert.equal(dayUrgency("2026-10-30", "2026-11-03"), "later");
});
