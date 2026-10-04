import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyProfileParam } from "./_profileParam.ts";

const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

test("a real UUID is an id lookup (lower-cased)", () => {
  assert.deepEqual(classifyProfileParam(ID), { kind: "id", value: ID });
  assert.deepEqual(classifyProfileParam(ID.toUpperCase()), { kind: "id", value: ID });
});

test("a chosen slug is a slug lookup — the case the old gate 404'd", () => {
  assert.deepEqual(classifyProfileParam("ahmad-alghamdi"), { kind: "slug", value: "ahmad-alghamdi" });
  assert.deepEqual(classifyProfileParam("law123"), { kind: "slug", value: "law123" });
});

test("36 characters of a–f and dashes is a slug, not an id", () => {
  // The old gate's /^[0-9a-f-]{36}$/ sent this into the id branch.
  const fake = "abcdef-abcdef-abcdef-abcdef-abcdefab";
  assert.equal(fake.length, 36);
  assert.deepEqual(classifyProfileParam(fake), { kind: "slug", value: fake });
});

test("anything that cannot be a stored slug or id is refused without a lookup", () => {
  for (const raw of ["", "   ", null, undefined, "Ahmad", "-ahmad", "ahmad-", "a", "أحمد", "a b", "a_b", "x".repeat(41)]) {
    assert.equal(classifyProfileParam(raw), null, JSON.stringify(raw));
  }
});
