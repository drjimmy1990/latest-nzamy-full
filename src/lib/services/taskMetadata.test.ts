import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SUBTASKS,
  buildTaskMetadataPatch,
  mergeTaskMetadata,
  readSubtasks,
  validateSubtasks,
  validateTaskTitle,
} from "./taskMetadata.ts";

// ─── mergeTaskMetadata — the whole reason this module exists ──────────────────

test("merge keeps every metadata key a subtasks-only update does not mention", () => {
  const existing = {
    task: true,
    priority: "high",
    category: "case",
    dueDate: "2026-09-01",
    caseId: "c-1",
    caseRef: "قضية تجارية",
    notes: "ملاحظة",
  };
  const out = mergeTaskMetadata(existing, { subtasks: [{ id: "s1", title: "خطوة", done: true }] });

  assert.equal(out.task, true);
  assert.equal(out.caseId, "c-1");
  assert.equal(out.caseRef, "قضية تجارية");
  assert.equal(out.dueDate, "2026-09-01");
  assert.equal(out.priority, "high");
  assert.equal(out.notes, "ملاحظة");
  assert.deepEqual(out.subtasks, [{ id: "s1", title: "خطوة", done: true }]);
});

test("merge overwrites only the patched keys", () => {
  const out = mergeTaskMetadata({ priority: "low", caseId: "c-1" }, { priority: "urgent" });
  assert.deepEqual(out, { priority: "urgent", caseId: "c-1" });
});

test("merge treats null as a key removal and undefined as leave-alone", () => {
  const out = mergeTaskMetadata(
    { dueDate: "2026-09-01", caseId: "c-1", priority: "high" },
    { dueDate: null, caseId: undefined },
  );
  assert.ok(!("dueDate" in out));
  assert.equal(out.caseId, "c-1");
  assert.equal(out.priority, "high");
});

test("merge does not mutate the row it read", () => {
  const existing = { priority: "low", subtasks: [{ id: "s1", title: "أ", done: false }] };
  const out = mergeTaskMetadata(existing, { priority: "urgent" });
  assert.equal(existing.priority, "low");
  assert.notEqual(out, existing);
});

test("merge survives a row whose metadata is null or a non-object", () => {
  assert.deepEqual(mergeTaskMetadata(null, { priority: "high" }), { priority: "high" });
  assert.deepEqual(mergeTaskMetadata(undefined, { priority: "high" }), { priority: "high" });
  assert.deepEqual(mergeTaskMetadata("junk", { priority: "high" }), { priority: "high" });
  assert.deepEqual(mergeTaskMetadata([1, 2], { priority: "high" }), { priority: "high" });
});

// ─── validateSubtasks ─────────────────────────────────────────────────────────

test("validateSubtasks accepts a well-formed array and strips unknown keys", () => {
  const res = validateSubtasks([{ id: " s1 ", title: " خطوة ", done: false, evil: "x" }]);
  assert.ok(res.ok);
  assert.deepEqual(res.value, [{ id: "s1", title: "خطوة", done: false }]);
});

test("validateSubtasks accepts an empty array — deleting the last step is a real edit", () => {
  const res = validateSubtasks([]);
  assert.ok(res.ok);
  assert.deepEqual(res.value, []);
});

test("validateSubtasks rejects non-arrays and malformed entries", () => {
  assert.equal(validateSubtasks("s1").ok, false);
  assert.equal(validateSubtasks({ id: "s1" }).ok, false);
  assert.equal(validateSubtasks(null).ok, false);
  assert.equal(validateSubtasks(["s1"]).ok, false);
  assert.equal(validateSubtasks([{ id: 1, title: "أ", done: false }]).ok, false);
  assert.equal(validateSubtasks([{ id: "s1", title: "", done: false }]).ok, false);
  assert.equal(validateSubtasks([{ id: "s1", title: "أ", done: "yes" }]).ok, false);
  assert.equal(validateSubtasks([{ id: "s1", title: "أ" }]).ok, false);
});

test("validateSubtasks rejects duplicate ids — a toggle must be unambiguous", () => {
  const res = validateSubtasks([
    { id: "s1", title: "أ", done: false },
    { id: "s1", title: "ب", done: true },
  ]);
  assert.equal(res.ok, false);
});

test("validateSubtasks caps the array so a client cannot write an unbounded blob", () => {
  const many = Array.from({ length: MAX_SUBTASKS + 1 }, (_, i) => ({
    id: `s${i}`, title: "خطوة", done: false,
  }));
  assert.equal(validateSubtasks(many).ok, false);
  assert.equal(validateSubtasks(many.slice(0, MAX_SUBTASKS)).ok, true);
});

test("validateSubtasks caps a single title", () => {
  const res = validateSubtasks([{ id: "s1", title: "x".repeat(1000), done: false }]);
  assert.equal(res.ok, false);
});

// ─── readSubtasks (lenient) ───────────────────────────────────────────────────

test("readSubtasks drops junk instead of throwing", () => {
  assert.deepEqual(readSubtasks(undefined), []);
  assert.deepEqual(readSubtasks("nope"), []);
  assert.deepEqual(
    readSubtasks([{ id: "s1", title: "أ", done: true }, null, { title: "بلا معرّف" }, 7]),
    [{ id: "s1", title: "أ", done: true }],
  );
});

test("readSubtasks coerces a missing done to false", () => {
  assert.deepEqual(readSubtasks([{ id: "s1", title: "أ" }]), [{ id: "s1", title: "أ", done: false }]);
});

// ─── buildTaskMetadataPatch — the whitelist ───────────────────────────────────

test("patch ignores keys outside the whitelist", () => {
  const res = buildTaskMetadataPatch({
    task: false,
    caseId: "hijacked",
    caseRef: "hijacked",
    internalNotes: "سري",
    priority: "urgent",
  });
  assert.ok(res.ok);
  assert.deepEqual(res.value, { priority: "urgent" });
});

test("patch is empty when the body carries no metadata edit", () => {
  const res = buildTaskMetadataPatch({ taskId: "t-1", status: "completed" });
  assert.ok(res.ok);
  assert.deepEqual(res.value, {});
});

test("patch keeps an empty notes string — clearing a note is an edit", () => {
  const res = buildTaskMetadataPatch({ notes: "" });
  assert.ok(res.ok);
  assert.deepEqual(res.value, { notes: "" });
});

test("patch keeps an empty subtasks array", () => {
  const res = buildTaskMetadataPatch({ subtasks: [] });
  assert.ok(res.ok);
  assert.deepEqual(res.value, { subtasks: [] });
});

test("patch rejects an unknown priority or category", () => {
  assert.equal(buildTaskMetadataPatch({ priority: "asap" }).ok, false);
  assert.equal(buildTaskMetadataPatch({ category: "whatever" }).ok, false);
  assert.equal(buildTaskMetadataPatch({ priority: 3 }).ok, false);
});

test("patch turns an empty dueDate into a removal and rejects a malformed one", () => {
  const cleared = buildTaskMetadataPatch({ dueDate: "" });
  assert.ok(cleared.ok);
  assert.deepEqual(cleared.value, { dueDate: null });
  assert.equal(buildTaskMetadataPatch({ dueDate: "01/09/2026" }).ok, false);
  assert.equal(buildTaskMetadataPatch({ dueDate: "2026-09-01" }).ok, true);
});

test("patch propagates a subtasks validation error", () => {
  const res = buildTaskMetadataPatch({ subtasks: [{ id: "s1" }] });
  assert.equal(res.ok, false);
});

test("a cleared dueDate patch actually removes the key on merge", () => {
  const res = buildTaskMetadataPatch({ dueDate: "" });
  assert.ok(res.ok);
  const merged = mergeTaskMetadata({ task: true, dueDate: "2026-09-01" }, res.value);
  assert.deepEqual(merged, { task: true });
});

// ─── validateTaskTitle ────────────────────────────────────────────────────────

test("validateTaskTitle trims and rejects blanks", () => {
  const ok = validateTaskTitle("  مذكرة رد  ");
  assert.ok(ok.ok);
  assert.equal(ok.value, "مذكرة رد");
  assert.equal(validateTaskTitle("   ").ok, false);
  assert.equal(validateTaskTitle(undefined).ok, false);
  assert.equal(validateTaskTitle(42).ok, false);
  assert.equal(validateTaskTitle("x".repeat(400)).ok, false);
});
