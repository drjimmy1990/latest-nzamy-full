import test from "node:test";
import assert from "node:assert/strict";
import {
  HEARING_REMINDER_STAGES,
  NO_TIME_ANCHOR,
  hearingStageTargets,
  parseHearingDate,
  parseHearingTime,
} from "./hearingReminderStages.ts";

const pick = (date: string, time: string | null) =>
  hearingStageTargets(date, time).map((t) => [t.key, `${t.at.date} ${t.at.time}`, t.minutesBeforeStart]);

test("the default stages are 7d, 3d, the previous evening and the hearing morning — one constant", () => {
  assert.deepEqual(HEARING_REMINDER_STAGES.map((s) => s.key), ["7d", "3d", "eve", "morning"]);
  assert.equal(NO_TIME_ANCHOR, "09:00");
});

test("a 09:00 hearing: same hour 7 and 3 days before, 20:00 the day before, 07:00 the same day", () => {
  assert.deepEqual(pick("2026-11-10", "09:00"), [
    ["7d", "2026-11-03 09:00", 7 * 1440],
    ["3d", "2026-11-07 09:00", 3 * 1440],
    ["eve", "2026-11-09 20:00", 13 * 60],
    ["morning", "2026-11-10 07:00", 2 * 60],
  ]);
});

test("the previous evening is the previous CALENDAR day at 20:00, whatever the hearing's hour", () => {
  const eve = (time: string) => hearingStageTargets("2026-11-10", time).find((t) => t.key === "eve");
  assert.equal(eve("08:00")?.at.time, "20:00");
  assert.equal(eve("08:00")?.at.date, "2026-11-09");
  assert.equal(eve("13:30")?.minutesBeforeStart, 17 * 60 + 30);
});

test("an early hearing moves the morning reminder to one hour before it; one just after midnight loses it", () => {
  const morning = (time: string) => hearingStageTargets("2026-11-10", time).find((t) => t.key === "morning");
  assert.deepEqual(morning("06:30")?.at, { date: "2026-11-10", time: "05:30" });
  assert.deepEqual(morning("07:00")?.at, { date: "2026-11-10", time: "06:00" });
  assert.deepEqual(morning("07:01")?.at, { date: "2026-11-10", time: "07:00" });
  assert.equal(morning("00:30"), undefined, "05:30 the day before is the eve reminder's job, not the morning's");
  assert.equal(morning("01:00")?.at.time, "00:00");
});

test("a hearing at 20:00 or earlier keeps its 20:00 eve reminder a full day ahead", () => {
  const t = hearingStageTargets("2026-11-10", "20:00");
  assert.equal(t.find((x) => x.key === "eve")?.minutesBeforeStart, 1440);
});

test("month, year and leap-day boundaries are calendar arithmetic", () => {
  assert.deepEqual(pick("2027-01-01", "10:00").map((r) => r[1]), [
    "2026-12-25 10:00", "2026-12-29 10:00", "2026-12-31 20:00", "2027-01-01 07:00",
  ]);
  assert.deepEqual(pick("2028-03-01", "10:00").map((r) => r[1]), [
    "2028-02-23 10:00", "2028-02-27 10:00", "2028-02-29 20:00", "2028-03-01 07:00",
  ]);
});

test("no recorded hour: day stages anchor at 09:00, offsets are from the day's midnight (all-day start)", () => {
  assert.deepEqual(pick("2026-11-10", null), [
    ["7d", "2026-11-03 09:00", 7 * 1440 - 9 * 60],
    ["3d", "2026-11-07 09:00", 3 * 1440 - 9 * 60],
    ["eve", "2026-11-09 20:00", 4 * 60],
    ["morning", "2026-11-10 07:00", -7 * 60],
  ]);
  assert.deepEqual(pick("2026-11-10", "not a time"), pick("2026-11-10", null), "an unreadable hour is no hour");
});

test("malformed dates give no stages", () => {
  for (const bad of ["", "2026-02-30", "2026-13-01", "10/11/2026", "2026-1-5", "x"]) {
    assert.deepEqual(hearingStageTargets(bad, "09:00"), [], bad);
    assert.equal(parseHearingDate(bad), null, bad);
  }
});

test("time parsing accepts Postgres HH:MM:SS and rejects out-of-range values", () => {
  assert.deepEqual(parseHearingTime("13:54:00"), { h: 13, m: 54 });
  assert.deepEqual(parseHearingTime("7:05"), { h: 7, m: 5 });
  assert.equal(parseHearingTime("24:00"), null);
  assert.equal(parseHearingTime("12:60"), null);
  assert.equal(parseHearingTime(null), null);
});

test("a custom stage list is honoured and results are sorted soonest-first", () => {
  const t = hearingStageTargets("2026-11-10", "09:00", [
    { key: "morning", rule: "day_at", dayOffset: 0, at: "07:00", labelAr: "", bodyAr: "" },
    { key: "7d", rule: "days_before", days: 7, labelAr: "", bodyAr: "" },
  ]);
  assert.deepEqual(t.map((x) => x.key), ["7d", "morning"]);
});

test("the result does not depend on the process time zone", () => {
  // Pure calendar math: nothing here reads the local zone. Re-running the
  // whole file under TZ=America/New_York must give the same answers.
  assert.equal(hearingStageTargets("2026-03-08", "02:30")[0].at.time, "02:30");
});
