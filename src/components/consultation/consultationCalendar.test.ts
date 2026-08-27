/**
 * consultationCalendar.test.ts — run with:
 *   node --test src/components/consultation/consultationCalendar.test.ts
 * or with the whole suite: npm run test:unit
 *
 * The defect under test is a public one: /book/consultation offered a fixed
 * 6–12 April week to visitors in August, with two of those days greyed out as
 * unavailable. What is pinned below is therefore (a) the days are real and
 * follow the date handed in, across month, year and leap-day boundaries, and
 * (b) no day is ever presented as unavailable, because nothing in this codebase
 * knows whether it is.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConsultationDays,
  CONSULTATION_DAY_COUNT,
  CONSULTATION_PREFERRED_TIMES,
} from "./consultationCalendar.ts";

// 2026-08-27 is a Thursday. Local-midnight constructor, matching the module.
const THU_27_AUG_2026 = new Date(2026, 7, 27);

test("offers seven days and starts with tomorrow", () => {
  const days = buildConsultationDays(THU_27_AUG_2026);

  assert.equal(days.length, CONSULTATION_DAY_COUNT);
  assert.equal(days.length, 7);
  assert.equal(days[0].date, "28 أغسطس");
  assert.equal(days[0].dateEn, "Aug 28");
  assert.equal(days[6].date, "3 سبتمبر");
});

test("weekday names are the real ones for those dates", () => {
  const days = buildConsultationDays(THU_27_AUG_2026);

  // Thursday 27 August 2026 → Friday 28th onward.
  assert.deepEqual(
    days.map((d) => d.dayAr),
    ["الجمعة", "السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"],
  );
  assert.deepEqual(
    days.map((d) => d.dayEn),
    ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"],
  );
});

test("rolls over the end of a month", () => {
  // Monday 31 August 2026 → the whole window falls in September.
  const days = buildConsultationDays(new Date(2026, 7, 31));

  assert.equal(days[0].date, "1 سبتمبر");
  assert.equal(days[0].dayAr, "الثلاثاء");
  assert.equal(days[6].date, "7 سبتمبر");
});

test("rolls over the end of a year", () => {
  const days = buildConsultationDays(new Date(2026, 11, 29));

  assert.deepEqual(
    days.map((d) => d.dateEn),
    ["Dec 30", "Dec 31", "Jan 1", "Jan 2", "Jan 3", "Jan 4", "Jan 5"],
  );
  assert.equal(days[2].date, "1 يناير");
});

test("counts 29 February in a leap year", () => {
  const days = buildConsultationDays(new Date(2028, 1, 25));

  assert.deepEqual(
    days.map((d) => d.date),
    ["26 فبراير", "27 فبراير", "28 فبراير", "29 فبراير", "1 مارس", "2 مارس", "3 مارس"],
  );
});

// ── the honesty invariants ───────────────────────────────────────────────────

test("no day is presented as unavailable", () => {
  // StepScheduling greys out and disables any day whose `times` is empty. An
  // empty array is therefore a statement — «no lawyer is free that day» — and
  // there is no availability source behind it. Every day carries times.
  for (const seed of [THU_27_AUG_2026, new Date(2026, 11, 31), new Date(2027, 5, 1)]) {
    for (const day of buildConsultationDays(seed)) {
      assert.deepEqual(day.times, CONSULTATION_PREFERRED_TIMES, day.date);
      assert.ok(day.times.length > 0, day.date);
    }
  }
});

test("each day gets its own times array", () => {
  // Shared references would make one card's edit show up on all seven.
  const days = buildConsultationDays(THU_27_AUG_2026);
  assert.notEqual(days[0].times, days[1].times);
});

// ── the lookups StepScheduling performs ──────────────────────────────────────

test("the Arabic weekday is unique, because the day lookup keys on it", () => {
  // StepScheduling stores the picked day as `calDay = dayAr` and resolves the
  // time list with `.find(d => d.dayAr === calDay)`. A repeated name would
  // silently resolve to the wrong card — which is what would happen the moment
  // the window grew past seven days.
  const days = buildConsultationDays(THU_27_AUG_2026);
  assert.equal(new Set(days.map((d) => d.dayAr)).size, 7);
  assert.equal(new Set(days.map((d) => d.dayEn)).size, 7);
});

test("the date string is unique and starts with the day number", () => {
  // `key={d.date}` and `d.date.split(" ")[0]` in StepScheduling.
  const days = buildConsultationDays(new Date(2026, 7, 31));
  assert.equal(new Set(days.map((d) => d.date)).size, 7);
  for (const day of days) {
    assert.match(day.date.split(" ")[0], /^\d{1,2}$/);
  }
});

test("dayShortAr distinguishes the days, unlike a two-character slice", () => {
  const days = buildConsultationDays(THU_27_AUG_2026);

  assert.equal(new Set(days.map((d) => d.dayShortAr)).size, 7);
  // Why the field exists at all: every Arabic weekday begins with «ال».
  assert.equal(new Set(days.map((d) => d.dayAr.slice(0, 2))).size, 1);
});

test("the same date always produces the same week", () => {
  assert.deepEqual(
    buildConsultationDays(THU_27_AUG_2026),
    buildConsultationDays(new Date(2026, 7, 27)),
  );
});
