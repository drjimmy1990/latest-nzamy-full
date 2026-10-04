/**
 * _bookingDate.test.ts — the booking modal refuses a past date (T28-13).
 *
 * Run: npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingDateError, PAST_BOOKING_DATE_AR } from "./_bookingDate.ts";
import { saudiCalendarDate } from "../../../../lib/services/enactmentCountdown.ts";

test("a blank date is allowed (the consultation stays unscheduled)", () => {
  assert.equal(bookingDateError("", "2026-09-28"), null);
});

test("today and later dates are allowed", () => {
  assert.equal(bookingDateError("2026-09-28", "2026-09-28"), null);
  assert.equal(bookingDateError("2026-10-01", "2026-09-28"), null);
  assert.equal(bookingDateError("2027-01-01", "2026-12-31"), null);
});

test("a past date is refused with the Arabic message", () => {
  assert.equal(bookingDateError("2026-09-27", "2026-09-28"), PAST_BOOKING_DATE_AR);
  assert.equal(bookingDateError("2025-12-31", "2026-01-01"), PAST_BOOKING_DATE_AR);
});

test("a malformed date is refused, not silently accepted", () => {
  assert.notEqual(bookingDateError("28/09/2026", "2026-09-28"), null);
});

test("today is the Saudi civil date, not UTC", () => {
  // 22:30 UTC on the 27th is already 01:30 on the 28th in Riyadh (UTC+3).
  const today = saudiCalendarDate(new Date("2026-09-27T22:30:00Z"));
  assert.equal(today, "2026-09-28");
  assert.equal(bookingDateError("2026-09-27", today), PAST_BOOKING_DATE_AR);
});
