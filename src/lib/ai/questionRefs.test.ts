/**
 * questionRefs.test.ts — what a library question names outright, with the
 * owner's own questions from his live test (29 Oct).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/questionRefs.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { articleNumber, articleRefs, bareArticleNumbers, lawNames, stripFraming } from "./questionRefs.ts";

test("article numbers: digits, Arabic-Indic, brackets, ordinals", () => {
  assert.deepEqual(articleNumber(["77"]), { n: 77, used: 1 });
  assert.deepEqual(articleNumber(["(٧٧)"]), { n: 77, used: 1 });
  assert.deepEqual(articleNumber(["الأولى"]), { n: 1, used: 1 });
  assert.deepEqual(articleNumber(["العاشرة"]), { n: 10, used: 1 });
  assert.deepEqual(articleNumber(["الحادية", "عشرة"]), { n: 11, used: 2 });
  assert.deepEqual(articleNumber(["الثالثة", "والعشرون"]), { n: 23, used: 2 });
  assert.deepEqual(articleNumber(["الخامسة", "والسبعين"]), { n: 75, used: 2 });
  assert.deepEqual(articleNumber(["الثلاثون"]), { n: 30, used: 1 });
  assert.deepEqual(articleNumber(["المائة"]), { n: 100, used: 1 });
  assert.deepEqual(articleNumber(["الثانية", "من"]), { n: 2, used: 1 });
  for (const bad of [["0"], ["الحادية"], ["من"], [], ["12345"]]) assert.equal(articleNumber(bad), null, bad.join(" "));
});

test("articleRefs: the owner's «ما هي المادة الأولى من نظام العمل»", () => {
  assert.deepEqual(articleRefs("ما هي المادة الأولى من نظام العمل؟"), [{ law: "نظام العمل", article: 1 }]);
  assert.deepEqual(articleRefs("اشرح المادة (٧٧) من نظام العمل"), [{ law: "نظام العمل", article: 77 }]);
  assert.deepEqual(articleRefs("مادة 80 نظام العمل في الفصل"), [{ law: "نظام العمل", article: 80 }]);
  assert.deepEqual(articleRefs("المادة الثالثة والعشرون من نظام المرافعات الشرعية متى تطبق"), [
    { law: "نظام المرافعات الشرعية", article: 23 },
  ]);
});

test("articleRefs: no law named, no number, or a bare «النظام» → nothing", () => {
  assert.deepEqual(articleRefs("ما هي المادة الأولى؟"), []);
  assert.deepEqual(articleRefs("المادة من نظام العمل"), []);
  assert.deepEqual(articleRefs("المادة الأولى من النظام"), []);
  assert.deepEqual(articleRefs(""), []);
});

test("articleRefs: at most `max`, each once", () => {
  const q = "قارن المادة 1 من نظام العمل والمادة 2 من نظام العمل والمادة 3 من نظام العمل";
  assert.equal(articleRefs(q).length, 2);
  assert.equal(articleRefs("المادة 1 من نظام العمل ثم المادة 1 من نظام العمل").length, 1);
});

test("bareArticleNumbers: «المادة الأولى» with no law after it, for the law page the reader is on", () => {
  assert.deepEqual(bareArticleNumbers("ما هي المادة الأولى؟"), [1]);
  assert.deepEqual(bareArticleNumbers("اشرح المادة 77 والمادة 80"), [77, 80]);
  assert.deepEqual(bareArticleNumbers("المادة الأولى من نظام العمل"), []);
  assert.deepEqual(bareArticleNumbers("ما حقوق العامل"), []);
});

test("lawNames: a named law ends at a stop word or a number", () => {
  assert.deepEqual(lawNames("ما حقوق المستفيد في نظام الضمان الاجتماعي؟"), ["نظام الضمان الاجتماعي"]);
  assert.deepEqual(lawNames("لائحة الجزاءات في نظام العمل"), ["لائحة الجزاءات", "نظام العمل"]);
  assert.deepEqual(lawNames("نظام العمل 1426"), ["نظام العمل"]);
  assert.deepEqual(lawNames("هل يطبق النظام على العامل"), []);
  assert.deepEqual(lawNames("تعريف عقد البيع"), []);
});

test("stripFraming: the owner's «تعريف عقد البيع» → «عقد البيع»", () => {
  assert.equal(stripFraming("تعريف عقد البيع"), "عقد البيع");
  assert.equal(stripFraming("ما هو مفهوم الإقالة"), "الإقالة");
  assert.equal(stripFraming("المادة الأولى نظام العمل"), "نظام العمل");
  assert.equal(stripFraming("نص المادة 77 العمل"), "العمل");
  assert.equal(stripFraming("المادة الحادية عشرة الأجر"), "الأجر");
  assert.equal(stripFraming("تعريف"), "");
  // Words that carry meaning stay.
  assert.equal(stripFraming("فسخ عقد العمل"), "فسخ عقد العمل");
});
