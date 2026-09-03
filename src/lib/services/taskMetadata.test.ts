import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SUBTASKS,
  readSubtasks,
  validateCategory,
  validateDueDate,
  validateNotes,
  validatePriority,
  validateSubtasks,
  validateTaskTitle,
} from "./taskMetadata.ts";

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

test("validateSubtasks caps the array so a client cannot write an unbounded checklist", () => {
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

// ─── validatePriority / validateCategory / validateDueDate / validateNotes ────

test("validatePriority rejects anything outside the DB's CHECK constraint", () => {
  assert.equal(validatePriority("urgent").ok, true);
  assert.equal(validatePriority("asap").ok, false);
  assert.equal(validatePriority(3).ok, false);
  assert.equal(validatePriority(undefined).ok, false);
});

test("validateCategory: null/undefined clear it, an unknown value is rejected", () => {
  assert.deepEqual(validateCategory(null), { ok: true, value: null });
  assert.deepEqual(validateCategory(undefined), { ok: true, value: null });
  assert.deepEqual(validateCategory("case"), { ok: true, value: "case" });
  assert.equal(validateCategory("whatever").ok, false);
});

test("validateDueDate: empty string and null both clear it; a malformed date is rejected", () => {
  assert.deepEqual(validateDueDate(""), { ok: true, value: null });
  assert.deepEqual(validateDueDate(null), { ok: true, value: null });
  assert.deepEqual(validateDueDate("2026-09-01"), { ok: true, value: "2026-09-01" });
  assert.equal(validateDueDate("01/09/2026").ok, false);
});

test("validateNotes keeps an empty string — clearing a note is a real edit — and caps length", () => {
  assert.deepEqual(validateNotes(""), { ok: true, value: "" });
  assert.equal(validateNotes("x".repeat(5000)).ok, false);
  assert.equal(validateNotes(42).ok, false);
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
