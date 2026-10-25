import test from "node:test";
import assert from "node:assert/strict";
import { buildCaseTimeline, riyadhDayAndTime, riyadhWallClockMs, type TimelineInput } from "./buildCaseTimeline.ts";

const labels: TimelineInput["labels"] = {
  degree: (d) => ({ first_instance: "ابتدائي", appeal: "استئناف" } as Record<string, string>)[d] ?? "ابتدائي",
  outcome: (o) => ({ won: "كسب القضية" } as Record<string, string>)[o] ?? null,
  ledgerTitle: (dir, _ch, title) => `${dir === "out" ? "صادر" : "وارد"}: ${title}`,
};
const NOW = Date.parse("2026-10-25T09:00:00Z");

test("a Riyadh wall clock is +03:00, never UTC midnight", () => {
  assert.equal(riyadhWallClockMs("2026-10-25", "01:00"), Date.parse("2026-10-24T22:00:00Z"));
  assert.equal(riyadhWallClockMs("2026-10-25"), Date.parse("2026-10-24T21:00:00Z"));
  assert.equal(riyadhWallClockMs("2026-10-25", "09:30:00"), Date.parse("2026-10-25T06:30:00Z"));
  assert.equal(riyadhWallClockMs("25/10/2026"), null);
  assert.equal(riyadhWallClockMs("2026-10-25", "25:00"), null);
  assert.deepEqual(riyadhDayAndTime(Date.parse("2026-10-24T22:30:00Z")), { day: "2026-10-25", time: "01:30" });
});

test("one line, newest first, across the four sources", () => {
  const items = buildCaseTimeline({
    nowMs: NOW,
    labels,
    hearings: [
      { id: "h-early", date: "2026-10-25", time: "01:00", title: "جلسة فجرية", status: "held", location: "المحكمة العامة" },
      { id: "h-next", date: "2026-11-02", time: "09:00", title: "جلسة قادمة", status: "scheduled" },
    ],
    stages: [{ id: "s1", degree: "first_instance", courtName: "المحكمة التجارية", openedOn: "2026-09-01", closedOn: "2026-10-01", outcome: "won", createdAt: "2026-09-05T10:00:00Z" }],
    ledger: [{ id: "l1", direction: "out", channel: "najiz", title: "مذكرة", notes: "  قُدّمت إلكترونياً ", occurredAt: "2026-10-24T23:00:00Z" }],
    notes: [{ id: "n1", body: "تذكير", visibility: "case_team", createdAt: "2026-10-10T08:00:00Z", authorName: "سارة", source: "case_note" }],
  });
  assert.deepEqual(items.map((i) => i.key), [
    "hearing:h-next", "ledger:l1", "hearing:h-early", "case_note:n1", "stage:s1:closed", "stage:s1:opened",
  ], "the 01:00 Riyadh hearing (22:00Z the day before) sorts BEFORE the 23:00Z ledger entry");
  const next = items[0];
  assert.equal(next.upcoming, true);
  assert.equal(next.day, "2026-11-02");
  assert.equal(next.time, "09:00");
  const ledger = items[1];
  assert.equal(ledger.day, "2026-10-25", "23:00Z is already the 25th in Riyadh");
  assert.equal(ledger.time, "02:00");
  assert.equal(ledger.title, "صادر: مذكرة");
  assert.equal(ledger.detail, "قُدّمت إلكترونياً");
  assert.equal(items[2].upcoming, false, "a held hearing is not upcoming");
  assert.equal(items[2].detail, "المحكمة العامة");
  assert.equal(items[4].detail, "النتيجة: كسب القضية");
  assert.equal(items[5].day, "2026-09-01", "a stage opens on its own date, not its creation time");
  assert.equal(items[5].time, null);
});

test("a stage without an opening date sits at its creation; malformed rows are skipped, not invented", () => {
  const items = buildCaseTimeline({
    nowMs: NOW,
    labels,
    stages: [{ id: "s2", degree: "appeal", createdAt: "2026-10-01T21:30:00Z" }],
    hearings: [{ id: "bad", date: "tomorrow", title: "x", status: "scheduled" }],
    ledger: [{ id: "bad", direction: "in", channel: "hand", title: "x", occurredAt: "never" }],
    notes: [{ id: "bad", body: "x", visibility: "private", createdAt: "" , source: "dashboard_note" }],
  });
  assert.deepEqual(items.map((i) => i.key), ["stage:s2:opened"]);
  assert.equal(items[0].day, "2026-10-02");
  assert.equal(items[0].time, "00:30");
  assert.equal(items[0].title, "بدء درجة التقاضي: استئناف");
});

test("a scheduled hearing with no time is upcoming for its whole Riyadh day", () => {
  const h = (nowIso: string) => buildCaseTimeline({ nowMs: Date.parse(nowIso), labels, hearings: [{ id: "h", date: "2026-10-25", time: null, title: "x", status: "scheduled" }] })[0];
  assert.equal(h("2026-10-24T21:30:00Z").time, null);
  assert.equal(h("2026-10-24T21:30:00Z").upcoming, true, "00:30 Riyadh on the day");
  assert.equal(h("2026-10-25T20:59:00Z").upcoming, true, "23:59 Riyadh on the day");
  assert.equal(h("2026-10-25T21:00:00Z").upcoming, false, "the next Riyadh day");
});

test("long notes are cut to an excerpt", () => {
  const [n] = buildCaseTimeline({ nowMs: NOW, labels, notes: [{ id: "n", body: "م".repeat(400), visibility: "firm", createdAt: "2026-10-01T00:00:00Z", source: "dashboard_note" }] });
  assert.ok((n.detail ?? "").length <= 161);
  assert.ok((n.detail ?? "").endsWith("…"));
});
