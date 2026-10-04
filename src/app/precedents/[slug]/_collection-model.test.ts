/**
 * LIB-05 regression (page side): windows of principles are normalised and
 * merged so the collection page reaches every principle once, and a principle
 * without classification_keywords can no longer crash the index.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hasMorePrinciples, mergePrinciples, nextOffset, normalizePrinciple } from "./_collection-model.ts";

test("missing arrays and NULL fields are defaulted", () => {
  const p = normalizePrinciple({ id: "p1", number: 12, text: null, paragraphs: [{ letter: "أ", text: "نص" }] });
  assert.deepEqual(p.classification_keywords, []); // was undefined → `.slice` threw
  assert.equal(p.number, "12");
  assert.equal(p.text, "");
  assert.deepEqual(p.paragraphs, [{ letter: "أ", text: "نص", keywords: [] }]);
  assert.deepEqual(p.details, {});
  assert.equal(p.locked, false);
  assert.equal(p.classification_keywords.slice(0, 2).join(" / "), "");
});

test("the API's lock flag and Arabic message reach the card", () => {
  const p = normalizePrinciple({ id: "p9", locked: true, lockedMessage: "يتطلب اشتراك Pro أو أعلى لعرض المبدأ كاملاً" });
  assert.equal(p.locked, true);
  assert.equal(p.lockedMessage, "يتطلب اشتراك Pro أو أعلى لعرض المبدأ كاملاً");
  // The card renders the notice from these two fields.
  const src = readFileSync(new URL("./_principle-block.tsx", import.meta.url), "utf8");
  assert.match(src, /\{isLocked && \(/);
  assert.match(src, /lock\.lockedMessage\?\.trim\(\) \|\| DEFAULT_LOCKED_MESSAGE/);
});

test("merge skips duplicates and keeps order", () => {
  const a = [{ id: "1" }, { id: "2" }];
  const merged = mergePrinciples(a, [{ id: "2" }, { id: "3" }, { id: "" }]);
  assert.deepEqual(merged.map((p) => p.id), ["1", "2", "3"]);
  assert.equal(mergePrinciples(merged, [{ id: "3" }]), merged, "no-op merge returns the same array");
});

test("more-ness follows the exact total, else the server flag", () => {
  assert.equal(hasMorePrinciples(100, 2323, false), true);
  assert.equal(hasMorePrinciples(2323, 2323, true), false);
  assert.equal(hasMorePrinciples(10, null, true), true);
  assert.equal(hasMorePrinciples(10, null, false), false);
});

test("a simulated scroll-then-search walk holds all 2,323 principles once", () => {
  const server = Array.from({ length: 2323 }, (_, i) => ({ id: `p-${i}` }));
  let held: { id: string }[] = [];
  const windowAt = (offset: number, limit: number) => server.slice(offset, offset + limit);
  // Scroll twice at 100, then search loads the rest at 500 — plus one retried window.
  held = mergePrinciples(held, windowAt(nextOffset(held), 100));
  held = mergePrinciples(held, windowAt(nextOffset(held), 100));
  held = mergePrinciples(held, windowAt(100, 100)); // a retry of an old window
  while (hasMorePrinciples(held.length, server.length, true)) {
    const before = held.length;
    held = mergePrinciples(held, windowAt(nextOffset(held), 500));
    if (held.length === before) break;
  }
  assert.equal(held.length, 2323);
  assert.equal(new Set(held.map((p) => p.id)).size, 2323);
});
