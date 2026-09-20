import assert from "node:assert/strict";
import test from "node:test";
import { daysUntilEffectiveDate, saudiCalendarDate } from "./enactmentCountdown.ts";

const today = new Date("2026-09-14T20:30:00Z");

test("counts Saudi calendar days without depending on the browser timezone", () => {
  assert.equal(daysUntilEffectiveDate("2026-09-15", today), 1);
  assert.equal(daysUntilEffectiveDate("2026-10-01", today), 17);
});

test("Saudi midnight advances the countdown even while UTC is on the previous date", () => {
  const afterSaudiMidnight = new Date("2026-09-14T21:30:00Z");
  assert.equal(saudiCalendarDate(afterSaudiMidnight), "2026-09-15");
  assert.equal(daysUntilEffectiveDate("2026-09-15", afterSaudiMidnight), 0);
});

test("an effective or past law has zero days remaining", () => {
  assert.equal(daysUntilEffectiveDate("2026-09-14", today), 0);
  assert.equal(daysUntilEffectiveDate("2020-01-01", today), 0);
});

test("invalid source dates are rejected instead of guessed", () => {
  assert.equal(daysUntilEffectiveDate("soon", today), null);
  assert.equal(daysUntilEffectiveDate("", today), null);
  assert.equal(daysUntilEffectiveDate("2026-02-31", today), null);
});
