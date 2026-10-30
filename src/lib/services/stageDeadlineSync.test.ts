import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveStagePatch, planStageDeadlineSync, readStageTrigger, inferLegacyTrigger,
  effectiveTriggerDate, recomputedMetadata, syncCancelledMetadata, isFinalOutcome,
  type ExistingAutoDeadline,
} from "./stageDeadlineSync.ts";

const RULE = "rule-cassation";
const auto = (over: Partial<ExistingAutoDeadline> = {}): ExistingAutoDeadline => ({
  id: "d1", status: "open", rule_id: RULE, trigger_date: "2026-10-29", due_date: "2026-11-29",
  created_at: "2026-10-29T10:00:00Z", metadata: {}, ...over,
});

// ── LIVE-F15 / CODE-F03: «قيد النظر» ─────────────────────────────────────────

test("LIVE-F15: pending with the old modal's pre-filled today does not close the degree", () => {
  const r = resolveStagePatch({ outcome: null, closed_on: null, metadata: {} }, { outcome: "pending", closedOn: "2026-10-29" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.final.closedOn, null);
  assert.equal(r.final.triggerDate, null);
  assert.equal(r.droppedForPending, true);
  assert.equal("closed_on" in r.patch, false, "nothing to clear: it was never closed");
});

test("LIVE-F15: pending creates no deadline — T07", () => {
  const plan = planStageDeadlineSync({ degree: "appeal", outcome: "pending", triggerDate: null, ruleId: RULE, existing: [] });
  assert.deepEqual(plan, { kind: "skip", reason: "outcome_pending" });
});

test("LIVE-F15: a pending row closed by the old bug is reopened on its next save", () => {
  const r = resolveStagePatch({ outcome: "pending", closed_on: "2026-10-29", metadata: {} }, { outcome: "pending" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.patch.closed_on, null);
});

test("LIVE-F15: final → pending cancels the auto deadline left open, with the reason", () => {
  const plan = planStageDeadlineSync({ degree: "appeal", outcome: "pending", triggerDate: null, ruleId: RULE, existing: [auto()] });
  assert.equal(plan.kind, "cancel");
  if (plan.kind !== "cancel") return;
  assert.equal(plan.reason, "outcome_pending");
  assert.deepEqual(plan.deadlines.map((d) => d.id), ["d1"]);
});

test("after a correct final outcome exactly one deadline is created from the chosen event", () => {
  const r = resolveStagePatch(
    { outcome: "pending", closed_on: null, metadata: {} },
    { outcome: "lost", closedOn: "2026-10-29", triggerEvent: "copy_received", triggerDate: "2026-11-02" },
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.final.triggerDate, "2026-11-02", "the clock starts from the copy, not the closing date");
  assert.deepEqual(r.patch.metadata, { deadline_trigger: { event: "copy_received", date: "2026-11-02" } });
  const plan = planStageDeadlineSync({ degree: "appeal", outcome: "lost", triggerDate: r.final.triggerDate, ruleId: RULE, existing: [] });
  assert.deepEqual(plan, { kind: "create", triggerDate: "2026-11-02" });
});

test("CODE-F03: no default event — a final outcome without a chosen event starts no clock", () => {
  const r = resolveStagePatch({ outcome: null, closed_on: null, metadata: {} }, { outcome: "won", closedOn: "2026-10-29" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.final.trigger, null);
  assert.equal(r.final.triggerDate, null);
  const plan = planStageDeadlineSync({ degree: "first_instance", outcome: "won", triggerDate: null, ruleId: "r", existing: [] });
  assert.deepEqual(plan, { kind: "skip", reason: "no_trigger" });
});

test("a final outcome needs its judgment date; a receipt cannot precede it", () => {
  const noDate = resolveStagePatch({ outcome: null, closed_on: null, metadata: {} }, { outcome: "won" });
  assert.equal(noDate.ok, false);
  const early = resolveStagePatch(
    { outcome: null, closed_on: null, metadata: {} },
    { outcome: "won", closedOn: "2026-10-29", triggerEvent: "notified", triggerDate: "2026-10-20" },
  );
  assert.equal(early.ok, false);
  const missing = resolveStagePatch(
    { outcome: null, closed_on: null, metadata: {} },
    { outcome: "won", closedOn: "2026-10-29", triggerEvent: "notified" },
  );
  assert.equal(missing.ok, false);
  assert.equal(resolveStagePatch({ outcome: null, closed_on: null, metadata: {} }, { outcome: "maybe" }).ok, false);
  assert.equal(resolveStagePatch({ outcome: null, closed_on: null, metadata: {} }, { outcome: "won", closedOn: "29/10/2026" }).ok, false);
  assert.equal(resolveStagePatch({ outcome: null, closed_on: null, metadata: {} }, { triggerEvent: "pronounced" }).ok, false);
});

// ── LIVE-F25 / CODE-F04: correcting the date ─────────────────────────────────

test("LIVE-F25 (T08): judgment_date follows the closing date — 29 → 31 Oct recomputes", () => {
  const stored = { outcome: "lost", closed_on: "2026-10-29", metadata: { deadline_trigger: { event: "judgment_date" } } };
  const r = resolveStagePatch(stored, { outcome: "lost", closedOn: "2026-10-31" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.final.triggerDate, "2026-10-31");
  assert.equal(r.affectsDeadline, true);
  const plan = planStageDeadlineSync({ degree: "first_instance", outcome: "lost", triggerDate: "2026-10-31", ruleId: RULE, existing: [auto()] });
  assert.equal(plan.kind, "recompute");
  if (plan.kind !== "recompute") return;
  assert.equal(plan.deadline.id, "d1");
  assert.equal(plan.triggerDate, "2026-10-31");
});

test("LIVE-F25: a stage from before the trigger existed is read as judgment_date when its deadline came from closed_on", () => {
  const stored = { closed_on: "2026-10-29", metadata: {} };
  assert.deepEqual(inferLegacyTrigger(stored, [auto()]), { event: "judgment_date", date: null });
  assert.equal(inferLegacyTrigger(stored, [auto({ trigger_date: "2026-11-01" })]), null);
  assert.equal(inferLegacyTrigger(stored, [auto({ status: "done" })]), null);
  assert.equal(inferLegacyTrigger({ closed_on: "2026-10-29", metadata: { deadline_trigger: { event: "notified", date: "2026-11-01" } } }, [auto()]), null);
  // the route passes the inferred trigger, so the correction recomputes
  const r = resolveStagePatch({ outcome: "lost", closed_on: "2026-10-29", metadata: {} }, { closedOn: "2026-10-31" }, inferLegacyTrigger(stored, [auto()]));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.final.triggerDate, "2026-10-31");
});

test("the same inputs again change nothing (idempotent)", () => {
  const plan = planStageDeadlineSync({ degree: "first_instance", outcome: "won", triggerDate: "2026-10-29", ruleId: RULE, existing: [auto()] });
  assert.equal(plan.kind, "unchanged");
});

test("a deadline the lawyer closed is kept, never silently moved", () => {
  for (const status of ["done", "cancelled", "missed"]) {
    const plan = planStageDeadlineSync({ degree: "first_instance", outcome: "won", triggerDate: "2026-10-31", ruleId: RULE, existing: [auto({ status })] });
    assert.equal(plan.kind, "keep", status);
  }
});

test("a deadline this hook cancelled does not block a new one", () => {
  const ours = auto({ status: "cancelled", metadata: { cancelled_by: "stage_sync" } });
  const plan = planStageDeadlineSync({ degree: "first_instance", outcome: "won", triggerDate: "2026-10-31", ruleId: RULE, existing: [ours] });
  assert.deepEqual(plan, { kind: "create", triggerDate: "2026-10-31" });
});

test("two open rows (an old race): the newest is recomputed, the extra one is returned for cancelling", () => {
  const older = auto({ id: "old", created_at: "2026-10-01T00:00:00Z" });
  const newer = auto({ id: "new", created_at: "2026-10-02T00:00:00Z" });
  const plan = planStageDeadlineSync({ degree: "first_instance", outcome: "won", triggerDate: "2026-10-31", ruleId: RULE, existing: [older, newer] });
  assert.equal(plan.kind, "recompute");
  if (plan.kind !== "recompute") return;
  assert.equal(plan.deadline.id, "new");
  assert.deepEqual(plan.duplicates.map((d) => d.id), ["old"]);
});

test("clearing the trigger cancels the open deadline instead of leaving it on stale data", () => {
  const stored = { outcome: "won", closed_on: "2026-10-29", metadata: { deadline_trigger: { event: "judgment_date" } } };
  const r = resolveStagePatch(stored, { triggerEvent: null });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.final.triggerDate, null);
  assert.deepEqual(r.patch.metadata, {});
  const plan = planStageDeadlineSync({ degree: "first_instance", outcome: "won", triggerDate: null, ruleId: RULE, existing: [auto()] });
  assert.equal(plan.kind, "cancel");
});

test("no rule for the degree / rule missing", () => {
  assert.deepEqual(
    planStageDeadlineSync({ degree: "cassation", outcome: "won", triggerDate: "2026-10-29", ruleId: null, existing: [] }),
    { kind: "skip", reason: "no_rule_for_degree" },
  );
  assert.deepEqual(
    planStageDeadlineSync({ degree: "appeal", outcome: "won", triggerDate: "2026-10-29", ruleId: null, existing: [] }),
    { kind: "skip", reason: "rule_missing" },
  );
});

test("notes alone do not touch the deadline", () => {
  const r = resolveStagePatch({ outcome: "won", closed_on: "2026-10-29", metadata: {} }, { notes: "  ok " });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.affectsDeadline, false);
  assert.deepEqual(r.patch, { notes: "ok" });
});

test("trigger helpers", () => {
  assert.deepEqual(readStageTrigger({ deadline_trigger: { event: "copy_received", date: "2026-11-01" } }), { event: "copy_received", date: "2026-11-01" });
  assert.deepEqual(readStageTrigger({ deadline_trigger: { event: "judgment_date", date: "x" } }), { event: "judgment_date", date: null });
  assert.equal(readStageTrigger({ deadline_trigger: { event: "nope" } }), null);
  assert.equal(readStageTrigger(null), null);
  assert.equal(effectiveTriggerDate({ event: "judgment_date", date: null }, "2026-10-29"), "2026-10-29");
  assert.equal(effectiveTriggerDate({ event: "notified", date: "2026-11-01" }, "2026-10-29"), "2026-11-01");
  assert.equal(effectiveTriggerDate(null, "2026-10-29"), null);
  assert.equal(isFinalOutcome("pending"), false);
  assert.equal(isFinalOutcome("settled"), true);
});

test("CODE-F04: a recompute keeps the old values in a bounded history", () => {
  const computation = {
    engine: "e", rule_id: "r", rule_code: "c", period_days: 30, count_from_next_day: true, roll_forward_if_holiday: true,
    trigger_event: "judgment_date" as const, trigger_date: "2026-10-31", due_date: "2026-11-30",
    rolled_past: [], hijri_resolved: true, computed_at: "now",
  };
  const entry = { at: "now", by: "u1", reason: "stage_corrected" as const,
    from: { trigger_date: "2026-10-29", due_date: "2026-11-29" }, to: { trigger_date: "2026-10-31", due_date: "2026-11-30" } };
  const meta = recomputedMetadata({ keep: 1, history: [{ old: true }] }, computation, entry);
  assert.equal(meta.keep, 1);
  assert.equal((meta.history as unknown[]).length, 2);
  assert.deepEqual((meta.history as unknown[])[1], entry);
  assert.equal((meta.computation as { due_date: string }).due_date, "2026-11-30");
  const cancelled = syncCancelledMetadata({ a: 1 }, "outcome_pending", "now", "u1");
  assert.equal(cancelled.cancelled_by, "stage_sync");
  assert.equal(cancelled.a, 1);
});
