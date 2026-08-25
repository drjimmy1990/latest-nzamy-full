import { test } from "node:test";
import assert from "node:assert/strict";
import { stripInternalNotes } from "./internalNotes.ts";

test("strips internalNotes for a non-admin caller", () => {
  const out = stripInternalNotes({ service: "draft", internalNotes: "لا يراها العميل" }, false);
  assert.equal(out?.internalNotes, undefined);
  assert.equal(out?.service, "draft");
  assert.ok(!("internalNotes" in (out ?? {})));
});

test("keeps internalNotes for an admin caller", () => {
  const out = stripInternalNotes({ service: "draft", internalNotes: "ملاحظة" }, true);
  assert.equal(out?.internalNotes, "ملاحظة");
});

test("is a no-op when there is no internalNotes key", () => {
  const input = { service: "draft" };
  const out = stripInternalNotes(input, false);
  assert.deepEqual(out, { service: "draft" });
});

test("passes null and undefined through unchanged", () => {
  assert.equal(stripInternalNotes(null, false), null);
  assert.equal(stripInternalNotes(undefined, false), undefined);
});

test("does not mutate the input object", () => {
  const input = { service: "draft", internalNotes: "سري" };
  stripInternalNotes(input, false);
  assert.equal(input.internalNotes, "سري");
});
