import { test } from "node:test";
import assert from "node:assert/strict";
import { articleDisplayLabel, cleanNumberText } from "./_article-label.ts";

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
