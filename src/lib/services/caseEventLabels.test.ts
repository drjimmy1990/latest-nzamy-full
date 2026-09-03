import test from "node:test";
import assert from "node:assert/strict";
import { CASE_EVENT_LABELS, CASE_EVENT_FALLBACK_LABEL, caseEventLabel } from "./caseEventLabels.ts";
import { RequestEvent } from "../events.ts";

test("every RequestEvent constant that can reach a case timeline has an Arabic label", () => {
  // Consultation/contract events are written on OTHER request types, not on a
  // case row — everything else in the vocabulary can land on a case timeline.
  const notOnCaseTimeline = new Set<string>([
    RequestEvent.CONSULTATION_CREATED,
    RequestEvent.CONSULTATION_STATUS_CHANGED,
    RequestEvent.CONTRACT_CREATED,
    RequestEvent.CONTRACT_STATUS_CHANGED,
  ]);
  const missing = Object.values(RequestEvent).filter(
    (kind) => !notOnCaseTimeline.has(kind) && !(kind in CASE_EVENT_LABELS),
  );
  assert.deepEqual(missing, [], `add these to CASE_EVENT_LABELS: ${missing.join(", ")}`);
});

test("no label contains Latin letters", () => {
  for (const [kind, label] of Object.entries(CASE_EVENT_LABELS)) {
    assert.ok(!/[A-Za-z]/.test(label), `${kind} → ${label}`);
  }
});

test("an unknown token is never echoed back", () => {
  assert.equal(caseEventLabel("some.future_event"), CASE_EVENT_FALLBACK_LABEL);
  assert.equal(caseEventLabel(""), CASE_EVENT_FALLBACK_LABEL);
  assert.ok(!/[A-Za-z]/.test(caseEventLabel("totally_unknown")));
});

test("n8n notification rows read as a notice, failure included", () => {
  assert.equal(caseEventLabel("notification.email_sent"), "إرسال إشعار");
  assert.equal(caseEventLabel("notification.whatsapp_failed"), "تعذّر إرسال إشعار");
});

test("the two Phase 1 stage kinds are labelled — the regression this module exists for", () => {
  assert.equal(caseEventLabel(RequestEvent.CASE_STAGE_ADDED), "إضافة درجة تقاضٍ");
  assert.equal(caseEventLabel(RequestEvent.CASE_STAGE_OUTCOME_RECORDED), "تسجيل نتيجة درجة تقاضٍ");
});
