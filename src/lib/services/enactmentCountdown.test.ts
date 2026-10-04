import assert from "node:assert/strict";
import test from "node:test";
import {
  RECENT_ENACTMENT_WINDOW_DAYS,
  daysSinceEffectiveDate,
  daysUntilEffectiveDate,
  isRecentlyInForce,
  recentEnactmentWindowStart,
  saudiCalendarDate,
} from "./enactmentCountdown.ts";

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

test("the recently-in-force window is 14 days and includes the effective day", () => {
  assert.equal(RECENT_ENACTMENT_WINDOW_DAYS, 14);
  // 2026-09-14 in Riyadh (20:30Z is 23:30 AST).
  assert.equal(daysSinceEffectiveDate("2026-09-14", today), 0);
  assert.equal(daysSinceEffectiveDate("2026-09-13", today), 1);
  assert.equal(daysSinceEffectiveDate("2026-08-31", today), 14);
  assert.equal(daysSinceEffectiveDate("2026-08-30", today), 15);
  assert.equal(isRecentlyInForce("2026-09-14", today), true);
  assert.equal(isRecentlyInForce("2026-08-31", today), true);
  assert.equal(isRecentlyInForce("2026-08-30", today), false);
  assert.equal(recentEnactmentWindowStart(today), "2026-08-31");
});

test("a law effective today is recent, not upcoming: the two lists split at today", () => {
  // The upcoming list is effective_date > today (daysRemaining >= 1 for it);
  // today itself is day 0 of the recent window.
  assert.equal(daysSinceEffectiveDate(saudiCalendarDate(today), today), 0);
  assert.equal(isRecentlyInForce(saudiCalendarDate(today), today), true);
  assert.equal(daysUntilEffectiveDate("2026-09-15", today), 1);
  assert.equal(isRecentlyInForce("2026-09-15", today), false);
});

test("a future date is never counted as in force (days since is not clamped)", () => {
  assert.equal(daysSinceEffectiveDate("2026-09-15", today), null);
  assert.equal(daysSinceEffectiveDate("2027-01-01", today), null);
});

test("Saudi midnight moves the window even while UTC is on the previous date", () => {
  const afterSaudiMidnight = new Date("2026-09-14T21:30:00Z"); // 2026-09-15 00:30 AST
  assert.equal(daysSinceEffectiveDate("2026-09-15", afterSaudiMidnight), 0);
  assert.equal(daysSinceEffectiveDate("2026-09-14", afterSaudiMidnight), 1);
  assert.equal(recentEnactmentWindowStart(afterSaudiMidnight), "2026-09-01");
});

test("the window start crosses month, year and leap-day boundaries", () => {
  assert.equal(recentEnactmentWindowStart(new Date("2026-03-10T09:00:00Z")), "2026-02-24");
  assert.equal(recentEnactmentWindowStart(new Date("2028-03-10T09:00:00Z")), "2028-02-25");
  assert.equal(recentEnactmentWindowStart(new Date("2027-01-05T09:00:00Z")), "2026-12-22");
  assert.equal(daysSinceEffectiveDate("2028-02-29", new Date("2028-03-01T09:00:00Z")), 1);
  assert.equal(daysSinceEffectiveDate("2026-12-31", new Date("2027-01-01T09:00:00Z")), 1);
});

test("invalid dates are rejected by the window helpers too", () => {
  assert.equal(daysSinceEffectiveDate("2026-02-31", today), null);
  assert.equal(daysSinceEffectiveDate("", today), null);
  assert.equal(isRecentlyInForce("soon", today), false);
});
