/**
 * graphGoldCore.test.ts — the gold-set measure: parsing, scoring, percentiles, the switch-on verdict.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/graphGoldCore.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  expectNumbers,
  formatGoldReport,
  gateVerdict,
  GOLD_GATE_MS,
  goldNormalize,
  hitRate,
  idsWithPhrase,
  meanRecall,
  parseGoldSet,
  percentile,
  scoreAnswer,
  summarizeTimings,
} from "./graphGoldCore.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

test("the committed gold set parses, is marked DRAFT until the owner approves it, and has named questions", () => {
  const set = parseGoldSet(JSON.parse(readFileSync(join(ROOT, "docs", "graph-rag", "gold-set.json"), "utf8")));
  assert.equal(set.status, "DRAFT");
  assert.equal(set.k, 8);
  assert.ok(set.items.length >= 30 && set.items.length <= 50, `${set.items.length} questions`);
  assert.ok(set.items.filter((i) => i.named).length >= 3, "some questions name the article (seeds)");
  for (const it of set.items) {
    assert.ok(it.expect.every((e) => e.law_title && e.article > 0), it.id);
  }
});

test("parseGoldSet lists every problem", () => {
  assert.throws(() => parseGoldSet({}), /no items/);
  assert.throws(
    () => parseGoldSet({ items: [{ id: "a", question: "q", expect: [{ laws: ["x"], article: 0 }] }, { id: "a", question: "", expect: [] }] }),
    (e: Error) => /article must be/.test(e.message) && /duplicate id/.test(e.message) && /question missing/.test(e.message) && /no expected article/.test(e.message),
  );
  assert.throws(() => parseGoldSet({ items: [{ id: "a", question: "q", expect: [{ laws: ["x"], article: 7 }] }] }), /must_contain/);
  const ok = parseGoldSet({
    k: 5,
    items: [{ id: "a", question: " q ", named: true, expect: [{ laws: ["x", 3], law_title: "ن", article: 7, or_articles: [8, -1], must_contain: ["فسخ", ""] }] }],
  });
  assert.equal(ok.k, 5);
  assert.deepEqual(ok.items[0], {
    id: "a",
    question: "q",
    named: true,
    expect: [{ laws: ["x"], law_title: "ن", article: 7, or_articles: [8], must_contain: ["فسخ"] }],
  });
  assert.deepEqual(expectNumbers(ok.items[0].expect[0]), [7, 8]);
});

test("idsWithPhrase keeps only the rows whose text holds a phrase, whatever the diacritics or letter forms", () => {
  assert.equal(goldNormalize("خاضعاً  للتجربة"), "خاضعا للتجربه");
  const rows = [
    { id: "labor__art-80", text: "لا يجوز لصاحب العمل فسخ العقد دون مكافأة العامل" },
    // The same number in the same law, another article (two rows numbered 80 in one export).
    { id: "labor__art-80-b", text: "لا ينقضي عقد العمل بوفاة صاحب العمل" },
    { id: "old__art-80", text: "", original_text: "فَسْخ العقد دون مكافأة أو إشعار" },
  ];
  assert.deepEqual([...idsWithPhrase(rows, ["فسخ العقد دون مكافأة"])].sort(), ["labor__art-80", "old__art-80"]);
  assert.equal(idsWithPhrase(rows, ["غير موجود"]).size, 0);
});

test("scoreAnswer: first matching rank inside the top k; unresolved expectations are not scored", () => {
  const s = scoreAnswer(["a", "b", "c", "d"], [new Set(["c", "z"]), new Set(["d"]), new Set()], 3);
  assert.deepEqual(s.ranks, [3, null, null]);
  assert.equal(s.found, 1);
  assert.equal(s.scored, 2);
  assert.equal(s.recall, 0.5);
  assert.equal(scoreAnswer(["a"], [new Set()], 8).recall, null);
  assert.equal(meanRecall([s, scoreAnswer(["d"], [new Set(["d"])], 8)]), 0.75);
  assert.equal(hitRate([s, scoreAnswer([], [new Set(["d"])], 8)]), 0.5);
});

test("percentile is nearest-rank", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 95), 5);
  const v = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.equal(percentile(v, 50), 10);
  assert.equal(percentile(v, 95), 19);
  assert.equal(percentile(v, 100), 20);
});

test("gateVerdict: GO only with every scope under the gate, no failures, and the graph answering", () => {
  const fast = summarizeTimings([100, 200, 300]);
  assert.deepEqual(gateVerdict({ auto: fast, section: fast, all: fast }, 3), { go: true, reasons: [] });
  const slow = summarizeTimings([100, GOLD_GATE_MS + 1]);
  const v = gateVerdict({ auto: fast, all: slow, section: summarizeTimings([100], 1) }, 0);
  assert.equal(v.go, false);
  assert.equal(v.reasons.length, 3);
  assert.deepEqual(gateVerdict({ auto: summarizeTimings([]) }, 1).reasons, ["auto: no timing"]);
});

test("formatGoldReport prints per-question ranks, both recalls and the verdict", () => {
  const g = scoreAnswer(["x"], [new Set(["x"])], 8);
  const k = scoreAnswer([], [new Set(["x"])], 8);
  const lines = formatGoldReport({
    rows: [{ id: "labor-13", named: true, graph: g, keyword: k, path: "graph", graphMiss: null }],
    k: 8,
    scopes: { auto: summarizeTimings([120]) },
    aiGraph: summarizeTimings([150]),
    unresolved: [],
    status: "DRAFT",
  });
  const text = lines.join("\n");
  assert.match(text, /labor-13\*\s+#1\s+✗/);
  assert.match(text, /Recall@8: graph 100%  ·  keyword 0%/);
  assert.match(text, /GO — /);

  // A cold first call cut at the gate is a NO-GO, however fast the warm replays are.
  const cold = formatGoldReport({
    rows: [{ id: "civil-01", named: false, graph: k, keyword: k, path: "keyword", graphMiss: "timeout" }],
    k: 8,
    scopes: { auto: summarizeTimings([120]) },
    aiGraph: summarizeTimings([GOLD_GATE_MS + 7], 1),
    unresolved: [],
    status: "DRAFT",
  }).join("\n");
  assert.match(cold, /NO-GO — .*ai-path: .*1 call\(s\) failed or timed out/);
});
