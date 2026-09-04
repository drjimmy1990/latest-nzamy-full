import test from "node:test";
import assert from "node:assert/strict";
import { purgeCutoffIso, PURGE_AFTER_DAYS } from "./attachmentPurge.ts";

test("PURGE_AFTER_DAYS is 30, per DECISION 3", () => {
  assert.equal(PURGE_AFTER_DAYS, 30);
});

test("the cutoff is exactly 30×24h before the given instant", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  const cutoff = purgeCutoffIso(now);
  assert.equal(cutoff, "2026-08-05T12:00:00.000Z");
  const diffMs = now.getTime() - new Date(cutoff).getTime();
  assert.equal(diffMs, 30 * 24 * 60 * 60 * 1000);
});

test("crosses a leap-year February boundary correctly", () => {
  // 2028 is a leap year — 30 days before 2028-03-01 must land inside a
  // 29-day February, not silently skip or double a day.
  const now = new Date("2028-03-01T00:00:00.000Z");
  assert.equal(purgeCutoffIso(now), "2028-01-31T00:00:00.000Z");
});

test("crosses a year boundary correctly", () => {
  const now = new Date("2027-01-10T00:00:00.000Z");
  assert.equal(purgeCutoffIso(now), "2026-12-11T00:00:00.000Z");
});

test("the default argument reads the real clock, within a second of Date.now() - 30d", () => {
  const expected = Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const actual = new Date(purgeCutoffIso()).getTime();
  assert.ok(Math.abs(actual - expected) < 1000, `expected within 1s of ${expected}, got ${actual}`);
});

test("output is a valid ISO-8601 UTC string round-trippable by Date", () => {
  const cutoff = purgeCutoffIso(new Date("2026-06-15T08:30:00.000Z"));
  assert.match(cutoff, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(new Date(cutoff).toISOString(), cutoff);
});
