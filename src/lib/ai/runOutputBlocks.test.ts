/**
 * runOutputBlocks.test.ts — a stored run's output as headed blocks, whatever
 * the tool's shape: nothing the tool produced is dropped for an unknown key.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/runOutputBlocks.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { runOutputBlocks } from "./runOutputBlocks.ts";

test("runOutputBlocks: summary, findings and an unknown key", () => {
  assert.deepEqual(
    runOutputBlocks({ summary: "س", findings: [{ severity: "high", issue: "ع", fix: "ح" }], zzz: "ب" }),
    [
      { heading: "الخلاصة", paragraphs: ["س"], items: [] },
      { heading: "الملاحظات", paragraphs: [], items: ["high — ع — ح"] },
      { heading: null, paragraphs: ["ب"], items: [] },
    ],
  );
});

test("runOutputBlocks: non-object → []", () => {
  for (const bad of [null, undefined, "نص", 3, true, [], ["أ"]]) assert.deepEqual(runOutputBlocks(bad), []);
});

test("runOutputBlocks: an array of strings becomes items; blanks are left out", () => {
  assert.deepEqual(runOutputBlocks({ questions: ["أ", "  ", "ب"], empty: [], blank: "  ", nothing: null }), [
    { heading: "أسئلة", paragraphs: [], items: ["أ", "ب"] },
  ]);
});

test("runOutputBlocks: a number inside an item is kept (a cited article's number)", () => {
  assert.deepEqual(runOutputBlocks({ cited: [{ law: "نظام العمل", article: 77 }] }), [
    { heading: null, paragraphs: [], items: ["نظام العمل — 77"] },
  ]);
});

test("runOutputBlocks: a nested object's keys become blocks of their own, labelled the same way", () => {
  assert.deepEqual(runOutputBlocks({ wrap: { conclusion: "خ", other: "ز" } }), [
    { heading: "الخلاصة", paragraphs: ["خ"], items: [] },
    { heading: null, paragraphs: ["ز"], items: [] },
  ]);
});

test("runOutputBlocks: three levels are shown, a fourth is ignored", () => {
  assert.deepEqual(runOutputBlocks({ a: { b: { c: { text: "ن" } } } }), [{ heading: "النص", paragraphs: ["ن"], items: [] }]);
  assert.deepEqual(runOutputBlocks({ a: { b: { c: { d: { text: "ن" } } } } }), []);
  assert.deepEqual(runOutputBlocks({ sections: [{ heading: "ف", points: ["أ", "ب"] }] }), [
    { heading: "الأقسام", paragraphs: [], items: ["ف — أ — ب"] },
  ]);
});

test("runOutputBlocks: at most 200 blocks", () => {
  const big: Record<string, string> = {};
  for (let i = 0; i < 500; i++) big[`k${i}`] = "س";
  assert.equal(runOutputBlocks(big).length, 200);
});

test("runOutputBlocks: an inherited key is not taken for a heading", () => {
  assert.deepEqual(runOutputBlocks({ constructor: "س" }), [{ heading: null, paragraphs: ["س"], items: [] }]);
});
