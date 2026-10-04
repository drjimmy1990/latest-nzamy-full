/**
 * _amended-marker.test.ts — «[معدّلة]» is read as a badge, never printed.
 * Run: npm run test:unit   (or, from this folder: node --test _amended-marker.test.ts)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitAmendedLabelLine, splitAmendedMarker } from "./_amended-marker.ts";

test("the owner's case: «المادة (5/3): `[معدّلة]`» (with shadda and backticks)", () => {
  assert.deepEqual(splitAmendedMarker("المادة (5/3): `[معدّلة]`"), { text: "المادة (5/3):", amended: true });
});

test("every spelling of the marker: [] or (), with or without shadda/harakat/backticks", () => {
  for (const marker of ["[معدلة]", "[معدّلة]", "(معدلة)", "(معدّلة)", "`[معدلة]`", "[ مُعدَّلة ]", "`(معدّلة)`"]) {
    const r = splitAmendedMarker(`المادة السابعة: ${marker}`);
    assert.equal(r.amended, true, marker);
    assert.equal(r.text, "المادة السابعة:", marker);
  }
});

test("no marker → the heading is returned untouched", () => {
  for (const heading of ["المادة (2/3):", "المادة المعدلة للاختصاص", "[ملغاة]", "معدلة"]) {
    assert.deepEqual(splitAmendedMarker(heading), { text: heading, amended: false });
  }
});

test("a bold label line keeps its bold and its body", () => {
  assert.deepEqual(
    splitAmendedLabelLine("**المادة (1/7): [معدّلة]** الدرجة الأولى: الأب، الأم."),
    { text: "**المادة (1/7):** الدرجة الأولى: الأب، الأم.", amended: true },
  );
  assert.deepEqual(splitAmendedLabelLine("المادة الثالثة (معدلة)"), { text: "المادة الثالثة", amended: true });
});

test("statutory text that merely contains the word is left alone", () => {
  const sentence = "أ - المواد المعدلة للاختصاص بالنسبة إلى الدعاوى المرفوعة قبل نفاذ هذا النظام.";
  assert.deepEqual(splitAmendedLabelLine(sentence), { text: sentence, amended: false });
  // A label line whose «(معدلة)» sits deep in the body is body text.
  const long = `المادة الأولى: ${"نص ".repeat(40)}(معدلة)`;
  assert.deepEqual(splitAmendedLabelLine(long), { text: long, amended: false });
});
