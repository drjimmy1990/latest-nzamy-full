import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSULTATION_STATUSES, CONSULTATION_STATUS_AR, CONSULTATION_MODES, CONSULTATION_MODE_AR,
  CONSULTATION_OUTCOMES, CONSULTATION_OUTCOME_AR, CONSULTATION_TRANSITIONS,
  canTransitionConsultation, consultationTransitionIssue, isConsultationStatus, isConsultationMode,
} from "./consultationVocabulary.ts";

test("every status, mode and outcome has an Arabic label — no raw token can reach a screen", () => {
  for (const s of CONSULTATION_STATUSES) assert.ok(CONSULTATION_STATUS_AR[s], s);
  for (const m of CONSULTATION_MODES) assert.ok(CONSULTATION_MODE_AR[m], m);
  for (const o of CONSULTATION_OUTCOMES) assert.ok(CONSULTATION_OUTCOME_AR[o], o);
  for (const s of CONSULTATION_STATUSES) assert.ok(Array.isArray(CONSULTATION_TRANSITIONS[s]), `${s} has a transition row`);
});

test("the lifecycle: requested → scheduled → completed; terminal states stay terminal", () => {
  assert.equal(canTransitionConsultation("requested", "scheduled"), true);
  assert.equal(canTransitionConsultation("requested", "completed"), false, "cannot complete what was never scheduled");
  assert.equal(canTransitionConsultation("scheduled", "scheduled"), true, "re-scheduling is allowed");
  assert.equal(canTransitionConsultation("scheduled", "completed"), true);
  assert.equal(canTransitionConsultation("scheduled", "no_show"), true);
  assert.equal(canTransitionConsultation("no_show", "scheduled"), true);
  assert.equal(canTransitionConsultation("completed", "scheduled"), false);
  assert.equal(canTransitionConsultation("cancelled", "requested"), false);
});

test("scheduling without a date is refused in Arabic; a legal move returns null", () => {
  assert.equal(consultationTransitionIssue("requested", "scheduled", { scheduledAt: null }), "حدّد موعد الاستشارة أولاً");
  assert.equal(consultationTransitionIssue("requested", "scheduled", { scheduledAt: "2026-09-10T07:30:00.000Z" }), null);
  const issue = consultationTransitionIssue("completed", "scheduled", { scheduledAt: "2026-09-10T07:30:00.000Z" });
  assert.ok(issue && issue.includes("مكتملة") && issue.includes("مجدولة"));
});

test("guards accept the constraint's values and nothing else", () => {
  assert.equal(isConsultationStatus("no_show"), true);
  assert.equal(isConsultationStatus("upcoming"), false, "the old screen-only word is not a status");
  assert.equal(isConsultationMode("in-person"), true);
  assert.equal(isConsultationMode("phone"), false);
});
