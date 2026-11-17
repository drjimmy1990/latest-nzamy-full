/**
 * hearingPrepTask.test.ts — N01-15.
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/dashboard/lawyer/_components/hearingPrepTask.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { prepTaskDueDate, prepTaskTitle, prepTaskPriority } from "./hearingPrepTask.ts";

test("48 hours before = two calendar days before the hearing's day", () => {
  assert.equal(prepTaskDueDate("2026-11-30", "2026-11-17"), "2026-11-28");
  // across a month boundary
  assert.equal(prepTaskDueDate("2026-12-01", "2026-11-17"), "2026-11-29");
});

test("a hearing less than 48 h away gets a task due today, never in the past", () => {
  assert.equal(prepTaskDueDate("2026-11-18", "2026-11-17"), "2026-11-17");
  assert.equal(prepTaskDueDate("2026-11-17", "2026-11-17"), "2026-11-17");
  assert.equal(prepTaskDueDate("2026-11-19", "2026-11-17"), "2026-11-17");
});

test("a past hearing or a malformed date creates no task", () => {
  assert.equal(prepTaskDueDate("2026-11-16", "2026-11-17"), null);
  assert.equal(prepTaskDueDate("", "2026-11-17"), null);
  assert.equal(prepTaskDueDate("17/11/2026", "2026-11-17"), null);
  assert.equal(prepTaskDueDate("2026-02-31", "2026-01-01"), null);
});

test("title and priority", () => {
  assert.equal(prepTaskTitle("  مطالبة مالية "), "تحضير للجلسة — مطالبة مالية");
  assert.equal(prepTaskTitle(""), "تحضير للجلسة");
  assert.equal(prepTaskTitle(undefined), "تحضير للجلسة");
  assert.equal(prepTaskPriority("critical"), "urgent");
  assert.equal(prepTaskPriority("high"), "high");
  assert.equal(prepTaskPriority("normal"), "normal");
});

test("wiring: the task is created only after the hearing save returned", () => {
  const src = readFileSync(new URL("./AddHearingModal.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const hearingAt = src.indexOf("const created = await createLawyerHearing(");
  const taskAt = src.indexOf("await createLawyerTask(");
  assert.ok(hearingAt > 0 && taskAt > hearingAt, "createLawyerTask must follow a confirmed createLawyerHearing");
  // a failed task never turns the saved hearing into an error
  assert.match(src, /catch \(taskErr\) \{[\s\S]{0,120}setPrepTaskOutcome\(\{ kind: "failed" \}\);/);
});
