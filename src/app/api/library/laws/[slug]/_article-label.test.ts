import { test } from "node:test";
import assert from "node:assert/strict";
import { articleDisplayLabel, articleLocatorText, cleanNumberText } from "./_article-label.ts";

test("keeps a normal locator as the source wrote it", () => {
  assert.equal(articleDisplayLabel("المادة الأولى", 1), "المادة الأولى");
  assert.equal(articleDisplayLabel("المادة (12)", 12), "المادة (12)");
  assert.equal(articleDisplayLabel("أولاً", 1), "أولاً");
  assert.equal(articleDisplayLabel("10-1", 10), "10-1");
});

test("strips markdown heading marks and the trailing colon", () => {
  assert.equal(cleanNumberText("### المادة (1):"), "المادة (1)");
  assert.equal(articleDisplayLabel("### المادة (1):", 1), "المادة (1)");
  assert.equal(articleDisplayLabel("# المادة الثالثة", 3), "المادة الثالثة");
});

test("an instrument name in place of a number falls back to «المادة N»", () => {
  assert.equal(articleDisplayLabel("اللائحة التنفيذية لنظام العمل", 7), "المادة 7");
  assert.equal(articleDisplayLabel("لائحة عمال الخدمة المنزلية ومن في حكمهم:", 2), "المادة 2");
  assert.equal(articleDisplayLabel("نظام العمل", 4), "المادة 4");
});

test("a zero or missing number is never printed as «المادة 0»", () => {
  assert.equal(articleDisplayLabel("المادة الأولى:", 0), "المادة الأولى");
  assert.equal(articleDisplayLabel("اللائحة التنفيذية لنظام العمل", 0), "اللائحة التنفيذية لنظام العمل");
  assert.equal(articleDisplayLabel("", 0), "");
});

test("empty text uses the number; no number keeps whatever text exists", () => {
  assert.equal(articleDisplayLabel("", 5), "المادة 5");
  assert.equal(articleDisplayLabel(null, 5), "المادة 5");
  assert.equal(articleDisplayLabel("اللائحة التنفيذية لنظام العمل", null), "اللائحة التنفيذية لنظام العمل");
});

test("articleLocatorText keeps a real locator, cleaned of heading marks", () => {
  assert.equal(articleLocatorText("### المادة (1):", 1), "المادة (1)");
  assert.equal(articleLocatorText("المادة الأولى:", 0), "المادة الأولى");
  assert.equal(articleLocatorText("السادسة والأربعون", 46), "السادسة والأربعون");
  assert.equal(articleLocatorText("10-1", 10), "10-1");
  // A page marker is the source's own position; the citation builder
  // recognises it and cites it as a page, so it is passed through.
  assert.equal(articleLocatorText("الصفحة 3", 0), "الصفحة 3");
});

test("articleLocatorText is null for a title, a sentence, or nothing — never a synthesised «المادة N»", () => {
  assert.equal(articleLocatorText("اللائحة التنفيذية لنظام العمل", 7), null);
  assert.equal(articleLocatorText("لائحة عمال الخدمة المنزلية ومن في حكمهم:", 2), null);
  assert.equal(articleLocatorText("اللائحة التنفيذية لنظام العمل", 0), null);
  assert.equal(articleLocatorText("", 5), null);
  assert.equal(articleLocatorText(null, 5), null);
  assert.equal(articleLocatorText("   :  ", 5), null);
  const sentence = "يجب على صاحب العمل أن يوفر للعامل بيئة عمل آمنة وأن يتخذ جميع الاحتياطات اللازمة لحمايته";
  assert.ok(sentence.length > 60);
  assert.equal(articleLocatorText(sentence, 3), null);
});

test("the display label is the locator when there is one, else the fallback", () => {
  for (const [text, n] of [
    ["### المادة (1):", 1], ["اللائحة التنفيذية لنظام العمل", 7], ["", 5], ["أولاً", 1],
  ] as const) {
    const locator = articleLocatorText(text, n);
    if (locator !== null) assert.equal(articleDisplayLabel(text, n), locator);
    else assert.equal(articleDisplayLabel(text, n), `المادة ${n}`);
  }
});
