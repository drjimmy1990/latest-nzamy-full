import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  tabFromParam, nextTabIndex, currentStageOf, nextUpcomingHearing, createLatestWins,
} from "./_caseFileView.ts";

// ── LIVE-F10 / UX11 ──
test("?tab= is validated against the known ids", () => {
  const ids = ["overview", "hearings", "notes"];
  assert.equal(tabFromParam("hearings", ids), "hearings");
  assert.equal(tabFromParam("nope", ids), "overview");
  assert.equal(tabFromParam(null, ids), "overview");
});

test("tab keys: RTL arrows are mirrored, Home/End jump, both ends wrap", () => {
  assert.equal(nextTabIndex("ArrowLeft", 0, 5), 1, "RTL: left is next");
  assert.equal(nextTabIndex("ArrowRight", 0, 5), 4, "RTL: right is previous, wrapping");
  assert.equal(nextTabIndex("ArrowLeft", 4, 5), 0);
  assert.equal(nextTabIndex("ArrowRight", 2, 5, "ltr"), 3);
  assert.equal(nextTabIndex("Home", 3, 5), 0);
  assert.equal(nextTabIndex("End", 0, 5), 4);
  assert.equal(nextTabIndex("Enter", 0, 5), null);
});

// ── UX11 pinned summary ──
test("current stage = the open degree with the highest position; all closed → the last, marked closed", () => {
  const s = (degree: string, position: number, closedOn: string | null) => ({ degree, position, closedOn });
  assert.equal(currentStageOf([]), null);
  assert.deepEqual(currentStageOf([s("ابتدائي", 0, "2026-01-01"), s("استئناف", 1, null)]), { stage: s("استئناف", 1, null), open: true });
  assert.deepEqual(currentStageOf([s("استئناف", 1, "2026-05-01"), s("ابتدائي", 0, "2026-01-01")]), { stage: s("استئناف", 1, "2026-05-01"), open: false });
});

test("next hearing: soonest scheduled row on or after today; cancelled / held / past never; no today → none", () => {
  const h = (status: string, date: string, time?: string) => ({ status, date, time });
  const rows = [h("cancelled", "2026-11-01"), h("held", "2026-11-02"), h("scheduled", "2026-10-29"), h("scheduled", "2026-11-05", "10:00"), h("scheduled", "2026-11-05", "09:00"), h("adjourned", "2026-11-03")];
  assert.deepEqual(nextUpcomingHearing(rows, "2026-10-30"), h("scheduled", "2026-11-05", "09:00"));
  assert.equal(nextUpcomingHearing(rows, ""), null);
  assert.equal(nextUpcomingHearing([h("cancelled", "2026-12-01")], "2026-10-30"), null);
});

// ── CODE-F11 ──
test("latest-wins: an older failure never reverts over a newer click", () => {
  const lw = createLatestWins<string>();
  const t1 = lw.begin("task-1", "todo");        // todo → inprogress
  const t2 = lw.begin("task-1", "inprogress");  // inprogress → done
  assert.deepEqual(lw.settle("task-1", t2, true, "done"), { revert: false });
  assert.deepEqual(lw.settle("task-1", t1, false, "inprogress"), { revert: false }, "stale failure ignored");
});

test("latest-wins: the latest failure reverts to the newest CONFIRMED value, not the click's closure", () => {
  const lw = createLatestWins<string>();
  const t1 = lw.begin("task-1", "todo");
  const t2 = lw.begin("task-1", "inprogress");
  assert.deepEqual(lw.settle("task-1", t1, true, "inprogress"), { revert: false });
  assert.deepEqual(lw.settle("task-1", t2, false, "done"), { revert: true, to: "inprogress" });
  // rows are independent
  const t3 = lw.begin("task-2", "done");
  assert.deepEqual(lw.settle("task-2", t3, false, "todo"), { revert: true, to: "done" });
});

test("latest-wins: a settled row starts from the fresh value on its next click", () => {
  const lw = createLatestWins<string>();
  const t1 = lw.begin("r", "todo");
  lw.settle("r", t1, true, "inprogress");
  const t2 = lw.begin("r", "inprogress");
  assert.deepEqual(lw.settle("r", t2, false, "done"), { revert: true, to: "inprogress" });
});

// ── wiring (source shape) ──
const page = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");

test("case file tabs are an ARIA tablist kept in the URL", () => {
  assert.match(page, /role="tablist"/);
  assert.match(page, /role="tab"/);
  assert.match(page, /aria-selected=\{/);
  assert.match(page, /role="tabpanel"/);
  assert.match(page, /nextTabIndex\(/);
  assert.match(page, /tabFromParam\(/);
  assert.match(page, /router\.replace\(/);
});

test("case file hearings: a cancelled sitting is never «منتهية»; next appointment from upcoming rows only", () => {
  assert.doesNotMatch(page, /"منتهية"/);
  assert.match(page, /hearingDisplayState\(/);
  assert.match(page, /nextUpcomingHearing\(/);
});

test("task and checklist toggles are latest-wins per row", () => {
  assert.match(page, /createLatestWins/);
  assert.equal((page.match(/\.settle\(/g) ?? []).length >= 2, true);
});
