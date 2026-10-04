/**
 * _reader-anchors.test.ts — the contents list can always reach a card of the
 * flat «التشريعات الفرعية» view.
 * Run: npm run test:unit   (or, from this folder: node --test _reader-anchors.test.ts)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegulationAnchors, regulationCardId, scrollToReaderAnchor } from "./_reader-anchors.ts";

const REF_A = "اللائحة التنفيذية لنظام المرافعات الشرعية";
const REF_B = "قواعد أخرى";

const instruments = [
  {
    ref: REF_A,
    articles: [
      { regNum: "1/3", text: "نص 1/3" },
      { regNum: "5/3", text: "#### المادة (5/3): `[معدّلة]`\nنص 5/3" },
      { regNum: "1/5", text: "نص 1/5" },
    ],
  },
  { ref: REF_B, articles: [{ regNum: "1", text: "نص ب1" }] },
];

const articles = [
  {
    id: "art-3",
    regulations: [
      { ref: REF_A, regNum: "1/3", text: "نص 1/3" },
      { ref: REF_A, regNum: "5/3", text: "#### المادة (5/3): `[معدّلة]`\nنص 5/3" },
    ],
  },
  { id: "art-4" }, // no regulation → no anchor
  { id: "art-5", regulations: [{ ref: REF_A, regNum: "1/5", text: "نص 1/5" }, { ref: REF_B, regNum: "1", text: "نص ب1" }] },
  // A dual-linked duplicate of 1/5 (excluded from the flat view): jumps to the same card.
  { id: "art-9", regulations: [{ ref: REF_A, regNum: "1/5", text: "نص 1/5", isSecondaryDisplay: true }] },
];

test("each نظام article jumps to the first card of its own regulation rows", () => {
  const { anchorByArticleId, articleIdByCardId } = buildRegulationAnchors(instruments, articles, null);
  assert.equal(anchorByArticleId.get("art-3"), regulationCardId(0, 0));
  assert.equal(anchorByArticleId.has("art-4"), false);
  assert.equal(anchorByArticleId.get("art-5"), regulationCardId(0, 2));
  assert.equal(anchorByArticleId.get("art-9"), regulationCardId(0, 2));
  // The card's owner (for the active highlight) is the primary article, not the duplicate.
  assert.equal(articleIdByCardId.get(regulationCardId(0, 2)), "art-5");
  assert.equal(articleIdByCardId.get(regulationCardId(0, 1)), "art-3");
  assert.equal(articleIdByCardId.get(regulationCardId(1, 0)), "art-5");
});

test("card ids come from the full list, so the instrument filter never renumbers them", () => {
  const filtered = buildRegulationAnchors(instruments, articles, REF_B);
  assert.equal(filtered.anchorByArticleId.get("art-5"), regulationCardId(1, 0));
  assert.equal(filtered.anchorByArticleId.has("art-3"), false, "its cards are not rendered under this filter");
  assert.equal(regulationCardId(1, 0), "regview-1-0");
});

test("ids never collide with article ids", () => {
  assert.ok(regulationCardId(0, 0).startsWith("regview-"));
  assert.notEqual(regulationCardId(1, 11), regulationCardId(11, 1));
});

test("scrollToReaderAnchor is a no-op without a DOM or an id", () => {
  assert.equal(scrollToReaderAnchor(undefined), false);
  assert.equal(scrollToReaderAnchor("art-1"), false);
});
