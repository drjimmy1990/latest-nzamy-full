/**
 * LIB-05 regression (page side): windows of principles are normalised and
 * merged so the collection page reaches every principle once, and a principle
 * without classification_keywords can no longer crash the index.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  appendRun,
  hasMorePrinciples,
  mergePrinciples,
  nextOffset,
  normalizePrinciple,
  prependRun,
  runHasMore,
  runNextOffset,
  runPrevWindow,
  type CollectionRun,
} from "./_collection-model.ts";

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

// ── q390-ب: a run of principles that may start mid-collection (?target=) ──

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `p-${from + i}` }));
const run = (start: number, n: number): CollectionRun<{ id: string }> => ({ start, items: ids(start, n) });

test("runNextOffset: the offset after the last principle held", () => {
  assert.equal(runNextOffset(run(100, 50)), 150);
  assert.equal(runNextOffset(run(0, 0)), 0);
});

test("runPrevWindow: the window just before the run, never below 0", () => {
  assert.deepEqual(runPrevWindow(run(120, 10), 50), { offset: 70, limit: 50 });
  assert.deepEqual(runPrevWindow(run(30, 10), 50), { offset: 0, limit: 30 });
  assert.equal(runPrevWindow(run(0, 10), 50), null);
});

test("runPrevWindow: a limit below 1 (or not a number) is clamped to 1 — never an empty or negative window", () => {
  assert.deepEqual(runPrevWindow(run(30, 10), 0), { offset: 29, limit: 1 });
  assert.deepEqual(runPrevWindow(run(30, 10), -5), { offset: 29, limit: 1 });
  assert.deepEqual(runPrevWindow(run(30, 10), Number.NaN), { offset: 29, limit: 1 });
  assert.equal(runPrevWindow(run(0, 10), 0), null);
});

test("appendRun keeps start and de-duplicates by id", () => {
  const r = run(100, 3);
  const next = appendRun(r, [{ id: "p-102" }, ...ids(103, 2)]);
  assert.equal(next.start, 100);
  assert.deepEqual(next.items.map((p) => p.id), ["p-100", "p-101", "p-102", "p-103", "p-104"]);
  assert.equal(appendRun(next, [{ id: "p-104" }]), next, "a no-op append returns the same run");
});

test("prependRun sets start to the new offset and keeps one copy of an overlapping id", () => {
  const r = run(120, 3);
  const prev = prependRun(r, [...ids(70, 50), { id: "p-120" }], 70);
  assert.equal(prev.start, 70);
  assert.equal(prev.items.length, 53);
  assert.equal(prev.items.filter((p) => p.id === "p-120").length, 1);
  assert.equal(prev.items[0].id, "p-70");
  assert.equal(prev.items[50].id, "p-120");
  assert.equal(runNextOffset(prev), 123);
  assert.equal(runPrevWindow(prev, 50)?.offset, 20);
});

test("runHasMore follows the exact total from the run's end, else the server flag", () => {
  assert.equal(runHasMore(run(2300, 23), 2323, false), false);
  assert.equal(runHasMore(run(2300, 23), 2323, true), false);
  assert.equal(runHasMore(run(2250, 50), 2323, false), true);
  assert.equal(runHasMore(run(100, 50), null, true), true);
  assert.equal(runHasMore(run(100, 50), null, false), false);
});

test("a run opened at a target walks back to 0 and forward to the end, each principle once", () => {
  const total = 2323;
  const server = ids(0, total);
  const limit = 50;
  // ?target= the principle at position 1234 → window 1200..1249.
  let r: CollectionRun<{ id: string }> = { start: 1200, items: server.slice(1200, 1250) };
  for (let w = runPrevWindow(r, limit); w; w = runPrevWindow(r, limit)) {
    r = prependRun(r, server.slice(w.offset, w.offset + w.limit), w.offset);
  }
  while (runHasMore(r, total, true)) {
    const before = r.items.length;
    r = appendRun(r, server.slice(runNextOffset(r), runNextOffset(r) + limit));
    if (r.items.length === before) break;
  }
  assert.equal(r.start, 0);
  assert.equal(r.items.length, total);
  assert.equal(new Set(r.items.map((p) => p.id)).size, total);
  assert.deepEqual(r.items.map((p) => p.id), server.map((p) => p.id));
});
