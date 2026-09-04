import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkSessionInput, WORK_SESSION_MODES, isWorkSessionMode } from "./workSessionInput.ts";

const BASE = {
  mode: "focus" as const,
  startedAt: "2026-09-04T09:00:00+03:00",
  durationMin: 25,
};

test("accepts a minimal valid body, defaulting completed=true, taskId=null, label=''", () => {
  const result = validateWorkSessionInput({ ...BASE });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.mode, "focus");
  assert.equal(result.value.startedAt, BASE.startedAt);
  assert.equal(result.value.endedAt, null);
  assert.equal(result.value.durationMin, 25);
  assert.equal(result.value.completed, true);
  assert.equal(result.value.taskId, null);
  assert.equal(result.value.label, "");
});

test("accepts every mode in WORK_SESSION_MODES", () => {
  for (const mode of WORK_SESSION_MODES) {
    const result = validateWorkSessionInput({ ...BASE, mode });
    assert.equal(result.ok, true, `mode ${mode} should be valid`);
  }
});

test("rejects a missing or unknown mode", () => {
  assert.equal(validateWorkSessionInput({ ...BASE, mode: undefined }).ok, false);
  assert.equal(validateWorkSessionInput({ ...BASE, mode: "deep_work" }).ok, false);
  assert.equal(isWorkSessionMode("focus"), true);
  assert.equal(isWorkSessionMode("deep_work"), false);
  assert.equal(isWorkSessionMode(42), false);
});

test("rejects a missing or unparsable startedAt", () => {
  assert.equal(validateWorkSessionInput({ ...BASE, startedAt: undefined }).ok, false);
  assert.equal(validateWorkSessionInput({ ...BASE, startedAt: "not-a-date" }).ok, false);
  assert.equal(validateWorkSessionInput({ ...BASE, startedAt: "" }).ok, false);
});

test("endedAt: null passes through, a bad string is rejected, and endedAt before startedAt is rejected", () => {
  assert.equal(validateWorkSessionInput({ ...BASE, endedAt: null }).ok, true);
  assert.equal(validateWorkSessionInput({ ...BASE, endedAt: "nope" }).ok, false);

  const before = validateWorkSessionInput({ ...BASE, startedAt: "2026-09-04T09:00:00+03:00", endedAt: "2026-09-04T08:59:59+03:00" });
  assert.equal(before.ok, false);

  const equal = validateWorkSessionInput({ ...BASE, startedAt: "2026-09-04T09:00:00+03:00", endedAt: "2026-09-04T09:00:00+03:00" });
  assert.equal(equal.ok, true, "endedAt equal to startedAt satisfies >=");

  const after = validateWorkSessionInput({ ...BASE, startedAt: "2026-09-04T09:00:00+03:00", endedAt: "2026-09-04T09:25:00+03:00" });
  assert.equal(after.ok, true);
  if (after.ok) assert.equal(after.value.endedAt, "2026-09-04T09:25:00+03:00");
});

test("durationMin: integer 1..600 accepted, out-of-range/non-integer/non-number rejected", () => {
  assert.equal(validateWorkSessionInput({ ...BASE, durationMin: 1 }).ok, true);
  assert.equal(validateWorkSessionInput({ ...BASE, durationMin: 600 }).ok, true);
  assert.equal(validateWorkSessionInput({ ...BASE, durationMin: 0 }).ok, false);
  assert.equal(validateWorkSessionInput({ ...BASE, durationMin: 601 }).ok, false);
  assert.equal(validateWorkSessionInput({ ...BASE, durationMin: 25.5 }).ok, false);
  assert.equal(validateWorkSessionInput({ ...BASE, durationMin: "25" }).ok, false);
  assert.equal(validateWorkSessionInput({ ...BASE, durationMin: undefined }).ok, false);
});

test("completed: defaults true, accepts explicit boolean, rejects non-boolean", () => {
  const def = validateWorkSessionInput({ ...BASE });
  assert.equal(def.ok, true);
  if (def.ok) assert.equal(def.value.completed, true);

  const explicitFalse = validateWorkSessionInput({ ...BASE, completed: false });
  assert.equal(explicitFalse.ok, true);
  if (explicitFalse.ok) assert.equal(explicitFalse.value.completed, false);

  assert.equal(validateWorkSessionInput({ ...BASE, completed: "yes" }).ok, false);
});

test("taskId: null/absent → null, a valid uuid passes through with no existence check, malformed rejected", () => {
  const absent = validateWorkSessionInput({ ...BASE });
  assert.equal(absent.ok, true);
  if (absent.ok) assert.equal(absent.value.taskId, null);

  const uuid = "11111111-2222-4333-8444-555555555555";
  const withTask = validateWorkSessionInput({ ...BASE, taskId: uuid });
  assert.equal(withTask.ok, true);
  if (withTask.ok) assert.equal(withTask.value.taskId, uuid);

  assert.equal(validateWorkSessionInput({ ...BASE, taskId: "not-a-uuid" }).ok, false);
  assert.equal(validateWorkSessionInput({ ...BASE, taskId: 123 }).ok, false);
});

test("label: trims, defaults to '', enforces the 120-char ceiling", () => {
  const trimmed = validateWorkSessionInput({ ...BASE, label: "  مراجعة عقد  " });
  assert.equal(trimmed.ok, true);
  if (trimmed.ok) assert.equal(trimmed.value.label, "مراجعة عقد");

  const tooLong = validateWorkSessionInput({ ...BASE, label: "a".repeat(121) });
  assert.equal(tooLong.ok, false);

  const exactly120 = validateWorkSessionInput({ ...BASE, label: "a".repeat(120) });
  assert.equal(exactly120.ok, true);

  assert.equal(validateWorkSessionInput({ ...BASE, label: 5 }).ok, false);
});
