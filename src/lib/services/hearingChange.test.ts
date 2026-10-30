import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowedHearingActions, actionNeedsReason, activityStatusFor, appendHearingHistory,
  planHearingChange, statusAfterAction, type CurrentHearing,
} from "./hearingChange.ts";
import { hearingDisplayState, HEARING_DISPLAY_LABEL_AR, isClosedHearingStatus } from "./hearingVocabulary.ts";

const TODAY = "2026-10-30";
const row = (over: Partial<CurrentHearing> = {}): CurrentHearing => ({
  status: "scheduled", hearing_date: "2026-11-05", hearing_time: "09:00:00", case_request_id: null, ...over,
});

// ── display state (CODE-F18: a cancelled sitting is never «منتهية») ──
test("display state: cancelled / held / adjourned read their own status, whatever the date", () => {
  assert.equal(hearingDisplayState("cancelled", "2026-10-01", TODAY), "cancelled");
  assert.equal(hearingDisplayState("cancelled", "2026-12-01", TODAY), "cancelled");
  assert.equal(hearingDisplayState("held", "2026-10-01", TODAY), "held");
  assert.equal(hearingDisplayState("adjourned", "2026-10-01", TODAY), "adjourned");
});

test("display state: a scheduled row is upcoming today or later, awaiting an outcome once its day passed", () => {
  assert.equal(hearingDisplayState("scheduled", TODAY, TODAY), "upcoming");
  assert.equal(hearingDisplayState("scheduled", "2026-11-01", TODAY), "upcoming");
  assert.equal(hearingDisplayState("scheduled", "2026-10-29", TODAY), "awaiting_outcome");
});

test("display state: before today is known, a scheduled row is not placed before or after it", () => {
  assert.equal(hearingDisplayState("scheduled", "2026-10-29", ""), "unknown");
  assert.equal(HEARING_DISPLAY_LABEL_AR.unknown, "مجدولة");
  assert.equal(hearingDisplayState("weird", "2026-10-29", TODAY), "unknown");
});

test("closed statuses are history in the diary", () => {
  assert.deepEqual(["scheduled", "held", "adjourned", "cancelled"].map(isClosedHearingStatus), [false, true, true, true]);
});

// ── the action table ──
test("actions offered by status", () => {
  assert.deepEqual(allowedHearingActions("scheduled"), ["edit", "postpone", "complete", "cancel"]);
  assert.deepEqual(allowedHearingActions("held"), ["edit", "reopen"]);
  assert.deepEqual(allowedHearingActions("cancelled"), ["reopen"]);
  assert.deepEqual(allowedHearingActions("adjourned"), ["reopen"]);
  assert.deepEqual(allowedHearingActions("nope"), []);
});

test("postpone, cancel and reopen need a reason; edit and complete do not", () => {
  assert.equal(actionNeedsReason("postpone"), true);
  assert.equal(actionNeedsReason("cancel"), true);
  assert.equal(actionNeedsReason("reopen"), true);
  assert.equal(actionNeedsReason("edit"), false);
  assert.equal(actionNeedsReason("complete"), false);
});

test("DB status after each action, and the activity vocabulary the coordinator's describeActivityEvent reads", () => {
  assert.equal(statusAfterAction("cancel", "scheduled"), "cancelled");
  assert.equal(statusAfterAction("complete", "scheduled"), "held");
  assert.equal(statusAfterAction("postpone", "scheduled"), "scheduled");
  assert.equal(statusAfterAction("reopen", "cancelled"), "scheduled");
  assert.equal(statusAfterAction("edit", "held"), "held");
  assert.equal(activityStatusFor("complete"), "completed");
  assert.equal(activityStatusFor("cancel"), "cancelled");
  assert.equal(activityStatusFor("postpone"), "postponed");
  assert.equal(activityStatusFor("reopen"), "scheduled");
  assert.equal(activityStatusFor("edit"), null);
});

// ── planHearingChange ──
test("cancel without a reason is refused; with one it writes status=cancelled and logs from/to", () => {
  const refused = planHearingChange({ action: "cancel" }, row(), TODAY);
  assert.equal(refused.ok, false);
  const ok = planHearingChange({ action: "cancel", reason: "  تنازل الموكل  " }, row(), TODAY);
  assert.ok(ok.ok);
  assert.deepEqual(ok.change.update, { status: "cancelled" });
  assert.equal(ok.change.history.reason, "تنازل الموكل");
  assert.equal(ok.change.history.fromStatus, "scheduled");
  assert.equal(ok.change.history.toStatus, "cancelled");
  assert.deepEqual(ok.change.activity, { kind: "status_changed", status: "cancelled", reason: "تنازل الموكل" });
});

test("postpone moves the row's own date (reminders re-plan from it), keeps it scheduled, logs both dates", () => {
  const ok = planHearingChange({ action: "postpone", reason: "طلب الخصم مهلة", date: "2026-11-20", time: "10:30" }, row(), TODAY);
  assert.ok(ok.ok);
  assert.deepEqual(ok.change.update, { hearing_date: "2026-11-20", hearing_time: "10:30", status: "scheduled" });
  assert.equal(ok.change.history.fromDate, "2026-11-05");
  assert.equal(ok.change.history.toDate, "2026-11-20");
  assert.equal(ok.change.history.fromTime, "09:00");
  assert.equal(ok.change.activity.status, "postponed");
});

test("postpone refuses a past day, a same date+time, and a missing date", () => {
  assert.equal(planHearingChange({ action: "postpone", reason: "x", date: "2026-10-29" }, row(), TODAY).ok, false);
  assert.equal(planHearingChange({ action: "postpone", reason: "x", date: "2026-11-05", time: "09:00" }, row(), TODAY).ok, false);
  assert.equal(planHearingChange({ action: "postpone", reason: "x" }, row(), TODAY).ok, false);
  // same day, new hour: a real postponement
  assert.equal(planHearingChange({ action: "postpone", reason: "x", date: "2026-11-05", time: "12:00" }, row(), TODAY).ok, true);
});

test("an action the status does not allow is a 409, not a silent write", () => {
  const r = planHearingChange({ action: "cancel", reason: "x" }, row({ status: "cancelled" }), TODAY);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 409);
});

test("reopen of a past-day row asks for a new future day", () => {
  const past = row({ status: "cancelled", hearing_date: "2026-10-01" });
  assert.equal(planHearingChange({ action: "reopen", reason: "أعيد القيد" }, past, TODAY).ok, false);
  const ok = planHearingChange({ action: "reopen", reason: "أعيد القيد", date: "2026-11-11" }, past, TODAY);
  assert.ok(ok.ok);
  assert.deepEqual(ok.change.update, { hearing_date: "2026-11-11", status: "scheduled" });
});

test("edit writes only the named fields, refuses a date change, and records field NAMES only", () => {
  const ok = planHearingChange({ action: "edit", location: " قاعة ٣ ", urgency: "critical" }, row(), TODAY);
  assert.ok(ok.ok);
  assert.deepEqual(ok.change.update, { location: "قاعة ٣", urgency: "urgent" });
  assert.deepEqual(ok.change.history.fields, ["location", "urgency"]);
  assert.equal(ok.change.activity.kind, "updated");
  assert.equal(planHearingChange({ action: "edit", date: "2026-11-09" }, row(), TODAY).ok, false);
  assert.equal(planHearingChange({ action: "edit" }, row(), TODAY).ok, false);
});

test("edit links a case by id (CODE-F17) and unlinks with null; an unchanged link is not a change", () => {
  const link = planHearingChange({ action: "edit", caseRequestId: "case-1" }, row(), TODAY);
  assert.ok(link.ok);
  assert.equal(link.change.caseRequestId, "case-1");
  assert.deepEqual(link.change.update, { case_request_id: "case-1" });
  const unlink = planHearingChange({ action: "edit", caseRequestId: "" }, row({ case_request_id: "case-1" }), TODAY);
  assert.ok(unlink.ok);
  assert.equal(unlink.change.caseRequestId, null);
  assert.equal(planHearingChange({ action: "edit", caseRequestId: "case-1" }, row({ case_request_id: "case-1" }), TODAY).ok, false);
});

test("history is appended, capped, and the input metadata is not mutated", () => {
  const meta = { caseName: "قضية", history: [{ n: 1 }, { n: 2 }] };
  const out = appendHearingHistory(meta, { at: "t", by: "u", action: "cancel" }, 2);
  assert.equal((out.history as unknown[]).length, 2);
  assert.deepEqual((out.history as { n?: number }[])[0], { n: 2 });
  assert.equal(out.caseName, "قضية");
  assert.equal(meta.history.length, 2);
  assert.deepEqual(appendHearingHistory(null, { at: "t", by: "u", action: "edit" }).history, [{ at: "t", by: "u", action: "edit" }]);
});
