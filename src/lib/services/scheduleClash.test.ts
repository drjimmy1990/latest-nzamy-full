import { test } from "node:test";
import assert from "node:assert/strict";
import { riyadhSlotMs } from "./consultationSchedule.ts";
import {
  clashMessageAr,
  consultationItems,
  findScheduleClashes,
  hearingDurationMinutes,
  hearingItems,
  hearingQueryDays,
  hearingQueryMinuteFilter,
  hearingStartMs,
  intervalsOverlap,
} from "./scheduleClash.ts";

const at = (day: string, time: string) => riyadhSlotMs(day, time) as number;

// A hearing 09:00–10:00 Riyadh on 10 Nov 2026 (stored as Postgres "HH:MM:SS").
const hearingRow = { id: "h1", hearing_date: "2026-11-10", hearing_time: "09:00:00", duration_minutes: null };
// A consultation 13:30–14:30 Riyadh the same day (stored as an instant, 10:30Z).
const consultationRow = { id: "c1", scheduled_at: "2026-11-10T10:30:00.000Z", duration_minutes: 60 };

test("q357: a hearing's wall clock is Riyadh time", () => {
  assert.equal(new Date(hearingStartMs("2026-11-10", "09:00:00")!).toISOString(), "2026-11-10T06:00:00.000Z");
  assert.equal(hearingStartMs("2026-11-10", "9:05"), at("2026-11-10", "09:05"));
  assert.equal(hearingStartMs("2026-11-10", null), null);
  assert.equal(hearingStartMs("2026-02-30", "09:00"), null);
});

test("q357: a new consultation that overlaps a scheduled hearing is flagged (consultation → hearing)", () => {
  const items = [...hearingItems([hearingRow]), ...consultationItems([])];
  const clashes = findScheduleClashes(at("2026-11-10", "09:30"), 60, items);
  assert.deepEqual(clashes, [{ kind: "hearing", id: "h1", scheduledAt: "2026-11-10T06:00:00.000Z", durationMinutes: 60 }]);
});

test("q357: a new hearing that overlaps a scheduled consultation is flagged (hearing → consultation)", () => {
  const start = hearingStartMs("2026-11-10", "14:00")!;
  const clashes = findScheduleClashes(start, hearingDurationMinutes(90), [...consultationItems([consultationRow])]);
  assert.deepEqual(clashes, [{ kind: "consultation", id: "c1", scheduledAt: "2026-11-10T10:30:00.000Z", durationMinutes: 60 }]);
});

test("q357: touching ends are not a clash, in either direction", () => {
  const items = [...hearingItems([hearingRow]), ...consultationItems([consultationRow])];
  // consultation 10:00–11:00 starts when the hearing ends
  assert.deepEqual(findScheduleClashes(at("2026-11-10", "10:00"), 60, items), []);
  // hearing 12:30–13:30 ends when the consultation starts
  assert.deepEqual(findScheduleClashes(hearingStartMs("2026-11-10", "12:30")!, 60, items), []);
  assert.equal(intervalsOverlap(0, 60, 60 * 60_000, 60), false);
  assert.equal(intervalsOverlap(0, 61, 60 * 60_000, 60), true);
});

test("q357: a hearing with no hour holds a day, not a slot — it is skipped", () => {
  const items = hearingItems([{ id: "h2", hearing_date: "2026-11-10", hearing_time: null, duration_minutes: 120 }]);
  assert.deepEqual(items, []);
  assert.deepEqual(findScheduleClashes(at("2026-11-10", "00:30"), 60, items), []);
});

test("q357: a hearing longer than 480 minutes keeps its length (not the consultation default)", () => {
  assert.equal(hearingDurationMinutes(600), 600);
  assert.equal(hearingDurationMinutes(1440), 1440);
  assert.equal(hearingDurationMinutes(1441), 60);
  assert.equal(hearingDurationMinutes(null), 60);
  const long = hearingItems([{ id: "h3", hearing_date: "2026-11-10", hearing_time: "08:00", duration_minutes: 600 }]);
  // 08:00 + 600 min = 18:00, so a 17:00 consultation still collides
  assert.equal(findScheduleClashes(at("2026-11-10", "17:00"), 30, long).length, 1);
  assert.equal(findScheduleClashes(at("2026-11-10", "18:00"), 30, long).length, 0);
});

test("q357: the row being saved is excluded by kind and id; another kind with the same id is not", () => {
  const items = [...hearingItems([{ ...hearingRow, id: "x" }]), ...consultationItems([{ ...consultationRow, id: "x", scheduled_at: "2026-11-10T06:00:00.000Z" }])];
  const start = at("2026-11-10", "09:15");
  assert.deepEqual(findScheduleClashes(start, 30, items, { kind: "hearing", id: "x" }).map((c) => c.kind), ["consultation"]);
  assert.deepEqual(findScheduleClashes(start, 30, items, { kind: "consultation", id: "x" }).map((c) => c.kind), ["hearing"]);
});

test("q357: the hearing query covers the day before (a long sitting may still run) through the end day", () => {
  assert.deepEqual(hearingQueryDays(at("2026-11-10", "09:00"), 60), { fromDay: "2026-11-09", toDay: "2026-11-10" });
  assert.deepEqual(hearingQueryDays(at("2026-11-10", "23:30"), 60), { fromDay: "2026-11-09", toDay: "2026-11-11" });
});

test("final review M1: the hearing read is cut to the minute — from 1440 minutes before the slot to its end", () => {
  // 09:00–10:00 on 10 Nov: from 09:00 on the 9th, up to (not including) 10:00 on the 10th.
  assert.equal(
    hearingQueryMinuteFilter(at("2026-11-10", "09:00"), 60),
    'and(hearing_date.eq."2026-11-09",hearing_time.gte."09:00"),' +
      'and(hearing_date.gt."2026-11-09",hearing_date.lt."2026-11-10"),' +
      'and(hearing_date.eq."2026-11-10",hearing_time.lt."10:00")',
  );
  // A slot past midnight: three days, the middle one whole.
  assert.equal(
    hearingQueryMinuteFilter(at("2026-11-10", "23:30"), 60),
    'and(hearing_date.eq."2026-11-09",hearing_time.gte."23:30"),' +
      'and(hearing_date.gt."2026-11-09",hearing_date.lt."2026-11-11"),' +
      'and(hearing_date.eq."2026-11-11",hearing_time.lt."00:30")',
  );
  assert.equal(hearingQueryMinuteFilter(Number.NaN, 60), null);
});

test("final review M1: every hearing the filter drops is one the clash rule would not report", () => {
  const start = at("2026-11-10", "09:00");
  const minutes = 60;
  const filter = hearingQueryMinuteFilter(start, minutes) as string;
  // Evaluate the filter's three branches over hearing rows, as PostgREST would.
  const branches = [...filter.matchAll(/and\(([^)]*)\)/g)].map((m) => m[1].split(","));
  const keeps = (date: string, time: string) =>
    branches.some((conds) =>
      conds.every((c) => {
        const [col, op, quoted] = c.split(".");
        const value = quoted.replace(/^"(.*)"$/, "$1");
        const v = col === "hearing_date" ? date : time;
        return op === "eq" ? v === value : op === "gt" ? v > value : op === "gte" ? v >= value : op === "lt" ? v < value : false;
      }),
    );
  for (const date of ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]) {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        // The longest sitting (1440 minutes): if even that cannot clash, dropping the row is safe.
        const clashes = findScheduleClashes(start, minutes, hearingItems([{ id: "x", hearing_date: date, hearing_time: `${time}:00`, duration_minutes: 1440 }]), null).length > 0;
        if (clashes) assert.ok(keeps(date, time), `${date} ${time} clashes but is filtered out`);
      }
    }
  }
});

test("q357: a «موعد طعن / نهائي» row (kind deadline) is not a clash — it marks a day, it holds no hour", () => {
  const items = hearingItems([{ ...hearingRow, id: "d1", kind: "deadline" }]);
  assert.deepEqual(items, []);
  assert.equal(hearingItems([{ ...hearingRow, kind: "judicial" }]).length, 1);
  assert.equal(hearingItems([{ ...hearingRow, kind: "client_meet" }]).length, 1);
});

test("q357: the warning names a sitting جلسة, another diary row موعد, a consultation استشارة", () => {
  const one = clashMessageAr([{ kind: "hearing", id: "h1", scheduledAt: "2026-11-10T06:00:00.000Z", durationMinutes: 60, hearingKind: "judicial" }]);
  assert.match(one, /^يتعارض هذا الموعد مع جلسة مجدولة: /);
  assert.match(one, /٩:٠٠ ص بتوقيت الرياض \(٦٠ دقيقة\)/);
  assert.match(one, /أكّد الحفظ رغم التعارض/);
  assert.match(clashMessageAr([{ kind: "hearing", id: "m", scheduledAt: "2026-11-10T06:00:00.000Z", durationMinutes: 60, hearingKind: "client_meet" }]),
    /^يتعارض هذا الموعد مع موعد مجدول: /);
  assert.match(clashMessageAr([{ kind: "consultation", id: "c", scheduledAt: "2026-11-10T10:30:00.000Z", durationMinutes: 60 }]),
    /^يتعارض هذا الموعد مع استشارة مجدولة: /);
  const two = clashMessageAr([
    { kind: "hearing", id: "h1", scheduledAt: "2026-11-10T06:00:00.000Z", durationMinutes: 60 },
    { kind: "consultation", id: "c1", scheduledAt: "2026-11-10T10:30:00.000Z", durationMinutes: 60 },
  ]);
  assert.match(two, /مع موعدين في جدولك: جلسة .*، استشارة /);
  const three = clashMessageAr(Array.from({ length: 3 }, (_, i) => ({ kind: "consultation" as const, id: `c${i}`, scheduledAt: "2026-11-10T10:30:00.000Z", durationMinutes: 60 })));
  assert.match(three, /مع ٣ مواعيد في جدولك: /);
});
