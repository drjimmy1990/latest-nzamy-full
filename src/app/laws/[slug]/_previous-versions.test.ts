import assert from "node:assert/strict";
import test from "node:test";
import { visibleAmendments } from "./_previous-versions.ts";

test("a card with no summary, no text and no instrument is not shown", () => {
  assert.deepEqual(visibleAmendments([{ date: null, source: null, summary: "", fullText: "" }]), []);
  assert.deepEqual(visibleAmendments([{ date: "  ", source: "\n", summary: " ", fullText: "\t" }]), []);
  assert.deepEqual(visibleAmendments([{}]), []);
});

test("a withheld instrument alone is not a card: the lock line would be its only content", () => {
  assert.deepEqual(visibleAmendments([{ date: null, source: null, sourceLocked: true, summary: "", fullText: "" }]), []);
});

test("a withheld instrument with a version text is shown, with the lock note and without the instrument", () => {
  const cards = visibleAmendments([{ date: "1445/1/1", source: "م/1", sourceLocked: true, summary: "", fullText: " النص السابق " }]);
  assert.deepEqual(cards, [{ source: "", date: "", summary: "", fullText: "النص السابق", sourceLocked: true }]);
});

test("an instrument and date alone are shown when not withheld", () => {
  const cards = visibleAmendments([{ date: "1445/1/1", source: "مرسوم ملكي م/5", summary: null, fullText: null }]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].source, "مرسوم ملكي م/5");
  assert.equal(cards[0].fullText, "");
});

test("empty cards are dropped and the rest keep their order and count", () => {
  const cards = visibleAmendments([
    { date: null, source: null, summary: "تعديل أول", fullText: "" },
    { date: null, source: null, summary: "", fullText: "" },
    { date: null, source: null, summary: "", fullText: "نص ثالث" },
  ]);
  assert.deepEqual(cards.map((c) => c.summary || c.fullText), ["تعديل أول", "نص ثالث"]);
});

test("no list or a malformed list is no card, never a throw", () => {
  assert.deepEqual(visibleAmendments(undefined), []);
  assert.deepEqual(visibleAmendments(null), []);
  // @ts-expect-error — a malformed payload must not break the reader.
  assert.deepEqual(visibleAmendments([null, "x"]), []);
});
