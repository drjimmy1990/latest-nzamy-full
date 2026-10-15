import test from "node:test";
import assert from "node:assert/strict";

import { formatTimeOfDayAr, parseTimeOfDay } from "./_timeOfDay.ts";

/** What the rest of the dashboard renders for the same hour and minute. */
function arSaClock(h: number, m: number): string {
  return new Date(Date.UTC(1970, 0, 1, h, m)).toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

test("a stored Postgres time loses its seconds", () => {
  assert.equal(formatTimeOfDayAr("13:54:00"), "٠١:٥٤ م");
  assert.ok(!formatTimeOfDayAr("13:54:00").includes(":٠٠ "));
});

test("matches the app's ar-SA 2-digit clock across the day", () => {
  const cases: Array<[string, number, number]> = [
    ["00:05", 0, 5],
    ["09:30", 9, 30],
    ["12:00", 12, 0],
    ["13:54:00", 13, 54],
    ["23:59:59", 23, 59],
    ["7:05", 7, 5],
  ];
  for (const [raw, h, m] of cases) {
    assert.equal(formatTimeOfDayAr(raw), arSaClock(h, m), raw);
  }
});

test("midnight and noon read as 12, not 0", () => {
  assert.equal(formatTimeOfDayAr("00:00:00"), "١٢:٠٠ ص");
  assert.equal(formatTimeOfDayAr("12:00:00"), "١٢:٠٠ م");
});

test("an unreadable value is shown as stored, not dropped or invented", () => {
  assert.equal(formatTimeOfDayAr("بعد الظهر"), "بعد الظهر");
  assert.equal(formatTimeOfDayAr("25:00"), "25:00");
  assert.equal(formatTimeOfDayAr(""), "");
  assert.equal(formatTimeOfDayAr(undefined), "");
  assert.equal(formatTimeOfDayAr(null), "");
});

test("parseTimeOfDay keeps accepting the shapes the calendar link relies on", () => {
  assert.deepEqual(parseTimeOfDay("13:54:00"), { h: 13, m: 54 });
  assert.deepEqual(parseTimeOfDay(" 9:05"), { h: 9, m: 5 });
  assert.equal(parseTimeOfDay("24:00"), null);
  assert.equal(parseTimeOfDay("10:60"), null);
  assert.equal(parseTimeOfDay(undefined), null);
});
