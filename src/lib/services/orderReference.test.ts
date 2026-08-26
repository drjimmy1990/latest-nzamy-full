import { test } from "node:test";
import assert from "node:assert/strict";
import { orderReference, matchesOrderReference } from "./orderReference.ts";

const ID = "8f14e45f-ceea-467a-9575-1a5b3d8f0e11";

test("one format, readable aloud", () => {
  assert.equal(orderReference(ID), "ORD-8F14E4");
});

test("a missing id produces nothing, never a bare prefix", () => {
  assert.equal(orderReference(null), "");
  assert.equal(orderReference(undefined), "");
  assert.equal(orderReference(""), "");
  assert.equal(orderReference("   "), "");
});

test("an id shorter than the slice never trails a hyphen", () => {
  // A legacy or non-UUID id must not render «ORD-AB-» or «ORD-AB12-».
  assert.equal(orderReference("ab-12"), "ORD-AB12");
  assert.ok(!orderReference("ab-12").endsWith("-"));
});

test("everything a human might paste finds the same order", () => {
  for (const typed of [
    "ORD-8F14E4",           // the reference as printed
    "ord-8f14e4",           // lowercased by a phone keyboard
    "#ORD-8F14E4",          // copied with the hash
    "8F14E4",               // the reference without its prefix
    "8f14e45f",             // the old 8-char form still in older messages
    ID,                     // the whole uuid
    "8f14e45f-ceea-467a",   // a partial paste
  ]) {
    assert.ok(matchesOrderReference(ID, typed), `should match: ${typed}`);
  }
});

test("a different order does not answer to this reference", () => {
  assert.equal(matchesOrderReference("11111111-2222-3333-4444-555555555555", "ORD-8F14E4"), false);
  assert.equal(matchesOrderReference(ID, "ORD-000000"), false);
});

test("an empty needle matches nothing — it must not select every row", () => {
  assert.equal(matchesOrderReference(ID, ""), false);
  assert.equal(matchesOrderReference(ID, "   "), false);
  assert.equal(matchesOrderReference(ID, "#"), false);
  assert.equal(matchesOrderReference(ID, "ORD-"), false);
});
