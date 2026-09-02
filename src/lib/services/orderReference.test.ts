import { test } from "node:test";
import assert from "node:assert/strict";
import { orderReference, matchesOrderReference } from "./orderReference.ts";

const ID = "8f14e45f-ceea-467a-9575-1a5b3d8f0e11";

/**
 * Two ids `createWorkflowId("REQ")` really produces inside one base36 window —
 * same millisecond block, different random tail. These are the exact strings
 * that both collapsed to `ORD-REQMTJ` before the shape check went in.
 */
const REQ_A = "REQ-MTJFH6ZF-B5OQ";
const REQ_B = "REQ-MTJFH6ZF-HFN2";

test("one format, readable aloud", () => {
  assert.equal(orderReference(ID), "ORD-8F14E4");
});

test("two requests filed in the same window get two different references", () => {
  // THE REGRESSION. `createWorkflowId` is `PREFIX-<base36 ms>-<4 random>`, and
  // the sixth character of `Date.now().toString(36)` turns over about once
  // every 16.8 hours. Stripping the hyphens and slicing six gave `ORD-REQMTJ`
  // to every request filed in that window, so a client with three requests saw
  // one «رقم الطلب» three times.
  assert.notEqual(orderReference(REQ_A), orderReference(REQ_B));
  assert.equal(orderReference(REQ_A), REQ_A);
  assert.equal(orderReference(REQ_B), REQ_B);
});

test("an id that is already a short reference is never re-shortened", () => {
  // Every prefix the app mints today. A new one longer than ten letters, or a
  // lowercase one, falls back into the shortening branch and brings the
  // collision back — so the list is pinned rather than described.
  for (const prefix of [
    "REQ", "CON", "AIC", "BIZ", "SRV", "WA", "CTR", "MICRO",
    "GOV-DRAFT", "NGO-CTR", "NZ",
  ]) {
    const id = `${prefix}-MTJFH6ZF-B5OQ`;
    assert.equal(orderReference(id), id, `should pass through: ${id}`);
    assert.ok(!orderReference(id).startsWith("ORD-"), `must not wear ORD-: ${id}`);
  }
});

test("a uuid still shortens, whatever letters it happens to start with", () => {
  // `deadbeef-…` is a real uuid whose first block is eight letters. A
  // case-insensitive «starts with letters then a hyphen» test would have read
  // it as a short reference and printed all 36 characters as the «رقم الطلب».
  assert.equal(orderReference("deadbeef-ceea-467a-9575-1a5b3d8f0e11"), "ORD-DEADBE");
  // An uppercased uuid is a uuid too: the shape test runs before the
  // short-reference test for exactly this row.
  assert.equal(orderReference("DEADBEEF-CEEA-467A-9575-1A5B3D8F0E11"), "ORD-DEADBE");
});

test("whitespace is stripped before the shape is decided, not after", () => {
  // Trimming after the hyphens came out would have dropped «  REQ-…» into the
  // shortening branch — the collision, reintroduced by a leading space.
  assert.equal(orderReference(`  ${REQ_A}  `), REQ_A);
  assert.equal(orderReference(`  ${ID}  `), "ORD-8F14E4");
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

test("a one- or two-character fragment does not select a third of the queue", () => {
  // The admin search box filters on every keystroke. A bare «8» prefix-matching
  // one order in sixteen puts an arbitrary subset on screen that reads as a
  // real result set. With the «ORD-» prefix present the intent is unambiguous
  // at any length, so that stays permissive.
  assert.equal(matchesOrderReference(ID, "8"), false);
  assert.equal(matchesOrderReference(ID, "8F"), false);
  assert.equal(matchesOrderReference(ID, "8F1"), false);
  assert.equal(matchesOrderReference(ID, "8F14"), true);
  assert.equal(matchesOrderReference(ID, "ORD-8F"), true);
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

test("whatever is printed as the reference finds the order it was printed for", () => {
  // The invariant that keeps the two exported functions from drifting: a client
  // reads back the string the app showed them, and it resolves. Every id shape
  // this module knows about is checked, so adding a third shape to
  // `orderReference` without teaching `matchesOrderReference` about it fails
  // here rather than in the admin queue.
  for (const id of [ID, REQ_A, REQ_B, "GOV-DRAFT-MTJFH6ZF-B5OQ", "ab-12"]) {
    const printed = orderReference(id);
    assert.ok(printed, `should print a reference: ${id}`);
    assert.ok(matchesOrderReference(id, printed), `should resolve: ${printed}`);
    assert.ok(matchesOrderReference(id, printed.toLowerCase()), `lowercased: ${printed}`);
    assert.ok(matchesOrderReference(id, `#${printed}`), `with a hash: ${printed}`);
  }
});

test("one request's reference does not answer for the request beside it", () => {
  // The other half of the collision: before the fix these two shared a
  // reference, so the admin queue returned both rows for either client.
  assert.equal(matchesOrderReference(REQ_A, orderReference(REQ_B)), false);
  assert.equal(matchesOrderReference(REQ_B, orderReference(REQ_A)), false);
  // A different prefix in the same millisecond is a different order too.
  assert.equal(matchesOrderReference(REQ_A, "CON-MTJFH6ZF-B5OQ"), false);
});

test("a reference quoted from before the fix still finds its candidates", () => {
  // DELIBERATE, NOT LEFTOVER. `ORD-REQMTJ` is what the app printed for every
  // request in that window, and clients screenshotted it. It has to keep
  // resolving — to all of them, which is the honest answer to an ambiguous
  // reference. Anchoring the match instead would strand every reference quoted
  // before this fix shipped.
  assert.equal(matchesOrderReference(REQ_A, "ORD-REQMTJ"), true);
  assert.equal(matchesOrderReference(REQ_B, "ORD-REQMTJ"), true);
});
