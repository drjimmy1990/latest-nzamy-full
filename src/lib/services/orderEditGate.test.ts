import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateOrderEditability,
  validateEditedDescription,
  appendEditHistory,
  MAX_EDIT_LENGTH,
  MAX_EDIT_HISTORY,
} from "./orderEditGate.ts";

const ME = "user-1";
const base = {
  requesterUserId: ME,
  callerUserId: ME,
  status: "pending_assignment",
  assignedTo: null,
  metadata: {},
};

test("a fresh order nobody has picked up is editable", () => {
  const out = evaluateOrderEditability(base);
  assert.equal(out.editable, true);
  assert.equal(out.reason, null);
});

test("only the person who ordered it may edit it", () => {
  const out = evaluateOrderEditability({ ...base, callerUserId: "someone-else" });
  assert.equal(out.editable, false);
  assert.equal(out.reason, "not_owner");
});

test("an order with no requester at all is not editable by anybody", () => {
  // A null requester_user_id must never equal a null caller and open the row.
  assert.equal(evaluateOrderEditability({ ...base, requesterUserId: null }).editable, false);
});

test("REGRESSION: routing an order closes editing even though its status does not change", () => {
  // «توجيه» (owner item ١٣) deliberately leaves status at pending_assignment.
  // If this gate looked only at status, a client could rewrite the brief of an
  // order already sitting on Ramy's desk.
  const out = evaluateOrderEditability({ ...base, assignedTo: "admin-7" });
  assert.equal(out.editable, false);
  assert.equal(out.reason, "already_assigned");
});

test("work in progress and decided orders are closed, with the right message each", () => {
  const inReview = evaluateOrderEditability({ ...base, status: "in_review" });
  assert.equal(inReview.reason, "not_pending");

  const done = evaluateOrderEditability({ ...base, status: "completed" });
  assert.equal(done.reason, "already_delivered");
  assert.ok(done.message.includes("طلب تعديل"), "a delivered order must be pointed at the revisions path");

  const cancelled = evaluateOrderEditability({ ...base, status: "cancelled" });
  assert.equal(cancelled.editable, false);
});

test("a deliverable closes editing even if the status was somehow re-opened", () => {
  const out = evaluateOrderEditability({
    ...base,
    metadata: { deliverable: { documentId: "9" } },
  });
  assert.equal(out.editable, false);
  assert.equal(out.reason, "already_delivered");
});

test("every refusal carries Arabic, never a raw token", () => {
  for (const patch of [
    { callerUserId: "x" },
    { status: "in_review" },
    { assignedTo: "a" },
    { status: "completed" },
  ]) {
    const out = evaluateOrderEditability({ ...base, ...patch });
    assert.ok(out.message.length > 0);
    assert.ok(!/[A-Za-z]/.test(out.message), `leaked English: ${out.message}`);
  }
});

test("an empty or oversized edit is refused", () => {
  assert.equal(validateEditedDescription("").ok, false);
  assert.equal(validateEditedDescription("   ").ok, false);
  assert.equal(validateEditedDescription(null).ok, false);
  assert.equal(validateEditedDescription(123).ok, false);
  assert.equal(validateEditedDescription("x".repeat(MAX_EDIT_LENGTH + 1)).ok, false);
  const ok = validateEditedDescription("  نص صحيح  ");
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.value, "نص صحيح");
});

test("history is append-only and keeps the newest entries when capped", () => {
  let md: Record<string, unknown> = {};
  md = { editHistory: appendEditHistory(md, "أول نص", "2026-08-26T10:00:00Z") };
  md = { editHistory: appendEditHistory(md, "ثاني نص", "2026-08-26T11:00:00Z") };
  const list = md.editHistory as { previous: string }[];
  assert.equal(list.length, 2);
  assert.equal(list[0].previous, "أول نص");

  let big: Record<string, unknown> = {};
  for (let i = 0; i < MAX_EDIT_HISTORY + 5; i++) {
    big = { editHistory: appendEditHistory(big, `نص ${i}`, "2026-08-26T12:00:00Z") };
  }
  const capped = big.editHistory as { previous: string }[];
  assert.equal(capped.length, MAX_EDIT_HISTORY);
  assert.equal(capped[capped.length - 1].previous, `نص ${MAX_EDIT_HISTORY + 4}`);
});

test("a corrupt editHistory is discarded, not crashed on", () => {
  const out = appendEditHistory(
    { editHistory: ["not an object", null, { at: 1, previous: 2 }] as unknown },
    "جديد",
    "2026-08-26T10:00:00Z",
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].previous, "جديد");
});
