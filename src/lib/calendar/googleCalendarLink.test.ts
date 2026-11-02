import test from "node:test";
import assert from "node:assert/strict";
import { googleCalendarDates, googleCalendarUrl } from "./googleCalendarLink.ts";

const base = { title: "جلسة نظر الدعوى", date: "2026-11-10", time: "09:00:00", durationMinutes: 90, details: "الموكل: شركة س", location: "المحكمة التجارية بالرياض" };

test("q352: the link names Asia/Riyadh and carries Riyadh wall-clock stamps", () => {
  const url = new URL(googleCalendarUrl(base)!);
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("ctz"), "Asia/Riyadh");
  assert.equal(url.searchParams.get("dates"), "20261110T090000/20261110T103000");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), base.title);
  assert.equal(url.searchParams.get("location"), base.location);
});

test("q352: no duration → one hour; a block that crosses midnight ends the next day", () => {
  assert.equal(googleCalendarDates("2026-11-10", "23:30", null), "20261110T233000/20261111T003000");
  assert.equal(googleCalendarDates("2026-12-31", "23:00", 120), "20261231T230000/20270101T010000");
});

test("q352: the stamps do not depend on the machine's zone", () => {
  const before = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/New_York", "Europe/Berlin", "Asia/Riyadh"]) {
      process.env.TZ = tz;
      assert.equal(googleCalendarDates("2026-03-29", "01:30", 60), "20260329T013000/20260329T023000", tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test("no hour → an all-day link; a bad day → no link", () => {
  assert.equal(googleCalendarDates("2026-11-10", null), "20261110/20261110");
  assert.equal(googleCalendarDates("2026-11-10", "bad"), "20261110/20261110");
  assert.equal(googleCalendarUrl({ ...base, date: "2026-02-30" }), null);
});
