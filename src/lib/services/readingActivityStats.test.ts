import test from "node:test";
import assert from "node:assert/strict";

import { recordLawOpened, EMPTY_READING_ACTIVITY } from "./readingActivityStats.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-09-04T10:00:00.000Z");

test("first call ever (no prior state) starts both counters at 1", () => {
  const result = recordLawOpened(null, T0);
  assert.equal(result.lawsThisWeek, 1);
  assert.equal(result.lawsThisMonth, 1);
  assert.equal(result.lastWeekReset, new Date(T0).toISOString());
  assert.equal(result.lastMonthReset, new Date(T0).toISOString());
});

test("a second call within the same day increments both counters without resetting", () => {
  const first = recordLawOpened(null, T0);
  const second = recordLawOpened(first, T0 + 60_000);
  assert.equal(second.lawsThisWeek, 2);
  assert.equal(second.lawsThisMonth, 2);
  // Reset timestamps unchanged — the window has not elapsed.
  assert.equal(second.lastWeekReset, first.lastWeekReset);
  assert.equal(second.lastMonthReset, first.lastMonthReset);
});

test("after the week window elapses, lawsThisWeek resets to 1 but lawsThisMonth keeps counting", () => {
  const first = recordLawOpened(null, T0);
  const eightDaysLater = T0 + 8 * DAY_MS;
  const result = recordLawOpened(first, eightDaysLater);
  assert.equal(result.lawsThisWeek, 1, "week counter must reset");
  assert.equal(result.lastWeekReset, new Date(eightDaysLater).toISOString());
  assert.equal(result.lawsThisMonth, 2, "month counter must keep accumulating");
  assert.equal(result.lastMonthReset, first.lastMonthReset, "month reset timestamp untouched");
});

test("after the month window elapses, both counters reset to 1", () => {
  const first = recordLawOpened(null, T0);
  const thirtyOneDaysLater = T0 + 31 * DAY_MS;
  const result = recordLawOpened(first, thirtyOneDaysLater);
  assert.equal(result.lawsThisWeek, 1);
  assert.equal(result.lawsThisMonth, 1);
  assert.equal(result.lastWeekReset, new Date(thirtyOneDaysLater).toISOString());
  assert.equal(result.lastMonthReset, new Date(thirtyOneDaysLater).toISOString());
});

test("exactly at the boundary (not strictly greater than the window) does not reset", () => {
  const first = recordLawOpened(null, T0);
  const exactlyOneWeekLater = T0 + 7 * DAY_MS;
  const result = recordLawOpened(first, exactlyOneWeekLater);
  assert.equal(result.lawsThisWeek, 2, "boundary itself is not yet elapsed");
  assert.equal(result.lastWeekReset, first.lastWeekReset);
});

test("fields outside the law counters pass through unchanged", () => {
  const prev = { ...EMPTY_READING_ACTIVITY, articles: 7, principles: 2, feqhPages: 9 };
  const result = recordLawOpened(prev, T0);
  assert.equal(result.articles, 7);
  assert.equal(result.principles, 2);
  assert.equal(result.feqhPages, 9);
});

test("a corrupt/legacy reset value (e.g. a stale numeric timestamp) is treated as elapsed, not fresh", () => {
  // Before this module existed, nzamy_activity stored lastWeekReset/lastMonthReset
  // as a number (Date.now()) rather than an ISO string. A stray leftover of that
  // shape must not be silently kept as "already reset" — it should trigger a
  // reset rather than accumulate on an untrusted timestamp.
  const legacy = { ...EMPTY_READING_ACTIVITY, lawsThisWeek: 4, lastWeekReset: T0 as unknown as string };
  const result = recordLawOpened(legacy, T0 + 60_000);
  assert.equal(result.lawsThisWeek, 1);
});

test("missing/undefined prior state is treated the same as null", () => {
  const result = recordLawOpened(undefined, T0);
  assert.equal(result.lawsThisWeek, 1);
  assert.equal(result.lawsThisMonth, 1);
});
