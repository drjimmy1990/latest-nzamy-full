import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describeAutoDeadline, mergeSavedStage, SKIP_REASON_TEXT } from "./stageDeadlineCopy.ts";
import type { AutoDeadlineSummary, CaseStage } from "./caseStagesService.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const summary: AutoDeadlineSummary = {
  id: "d1", title: "الاعتراض بطلب الاستئناف — قضية", dueDate: "2026-11-30", dueDateHijri: null,
  daysCount: 30, rolledFromHoliday: false, ruleTitleAr: "الاعتراض بطلب الاستئناف", ruleVerified: true,
};
const stage: CaseStage = {
  id: "s1", caseRequestId: "c1", degree: "ابتدائي", openedOn: null, closedOn: "2026-10-29", outcome: "lost",
  position: 0, createdAt: "", updatedAt: "", triggerEvent: "judgment_date", triggerDate: "2026-10-29",
  linkedDeadline: { id: "d1", status: "open", triggerDate: "2026-10-29", dueDate: "2026-11-29" },
};

test("LIVE-F25: a recompute is announced with the old and new dates — never «مسجَّلة مسبقاً»", () => {
  const n = describeAutoDeadline({ created: false, action: "recomputed", deadline: summary, previous: { dueDate: "2026-11-29", triggerDate: "2026-10-29" } });
  assert.equal(n.tone, "changed");
  assert.deepEqual(n.change, { fromDueDate: "2026-11-29", toDueDate: "2026-11-30", fromTriggerDate: "2026-10-29" });
  assert.doesNotMatch(n.heading, /مسجَّلة مسبقاً/);
});

test("a kept deadline says why it was not moved", () => {
  const n = describeAutoDeadline({ created: false, action: "kept", deadline: summary, deadlineStatus: "done" });
  assert.equal(n.tone, "warning");
  assert.match(n.heading, /لم تُعدَّل/);
  assert.match(n.heading, /مُنجزة/);
});

test("LIVE-F15: pending says no deadline; a cancelled one is announced", () => {
  assert.match(describeAutoDeadline({ created: false, action: "skipped", skipped: "outcome_pending" }).heading, /قيد النظر/);
  const c = describeAutoDeadline({ created: false, action: "cancelled", skipped: "outcome_pending", cancelledCount: 1 });
  assert.match(c.heading, /أُلغيت/);
  assert.equal(c.showDeadline, false);
  assert.match(SKIP_REASON_TEXT.no_trigger, /لم تُحسب مهلة/);
});

test("older responses without `action` still read correctly", () => {
  const n = describeAutoDeadline({ created: false, skipped: "already_exists" });
  assert.match(n.heading, /مسجَّلة مسبقاً/);
  assert.equal(describeAutoDeadline({ created: true, action: "created", deadline: summary }).showDeadline, true);
});

test("mergeSavedStage keeps the linked deadline in step with the save", () => {
  const saved: CaseStage = { ...stage, closedOn: "2026-10-31", triggerDate: "2026-10-31", linkedDeadline: undefined };
  const moved = mergeSavedStage(stage, saved, { created: false, action: "recomputed", deadline: summary, previous: { dueDate: "2026-11-29", triggerDate: "2026-10-29" } });
  assert.deepEqual(moved.linkedDeadline, { id: "d1", status: "open", dueDate: "2026-11-30", triggerDate: "2026-10-31" });
  const cancelled = mergeSavedStage(stage, { ...saved, outcome: "pending" }, { created: false, action: "cancelled", skipped: "outcome_pending", cancelledCount: 1 });
  assert.equal(cancelled.linkedDeadline, null);
  const notesOnly = mergeSavedStage(stage, saved, null);
  assert.deepEqual(notesOnly.linkedDeadline, stage.linkedDeadline);
});

test("the case-stages route: no early already_exists, a list lookup, the hook runs on any date/event change", () => {
  const src = read("app/api/v1/lawyer/case-stages/[caseId]/route.ts");
  assert.doesNotMatch(src, /skipped: "already_exists"/);
  assert.match(src, /planStageDeadlineSync\(/);
  assert.match(src, /resolveStagePatch\(/);
  assert.match(src, /if \(resolved\.affectsDeadline\)/);
  assert.match(src, /cancelPendingDeadlineReminders\(supabase, row\.id\);\n\s+await enqueueDeadlineReminders/);
  assert.match(src, /kind: RequestEvent\.DEADLINE_RECOMPUTED/);
  // the linked-deadline lookup is a list, not .maybeSingle()
  const lookup = src.slice(src.indexOf("const { data: existingRows"), src.indexOf("const existing = "));
  assert.doesNotMatch(lookup, /maybeSingle/);
});

test("CODE-F03/F06: the outcome modal has no default date and refreshes the parent on save, once", () => {
  const src = read("app/dashboard/lawyer/_components/RecordStageOutcomeModal.tsx");
  assert.doesNotMatch(src, /isoDate\(new Date\(\)\)/, "no 'today' pre-fill");
  assert.match(src, /useState\(stage\.closedOn \?\? ""\)/);
  assert.match(src, /setDone\(true\);\n\s+onSaved\(/, "onSaved right after the server's answer");
  assert.doesNotMatch(src, /handleCloseConfirmation/);
  assert.match(src, /<ModalShell[^>]*busy=\{saving\}/);
  // «قيد النظر» sends no closing date and no trigger
  assert.match(src, /: \{ id: stage\.id, outcome, closedOn: null, notes, triggerEvent: null \}/);
});
