import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLegalRefs, missingLegalRefs } from "./legalRefs.ts";

test("articles in their attached forms and both digit sets read as one key", () => {
  const text = "استناداً إلى المادة (٧٧) من نظام العمل، وللمادة 80 منه، وبالمادة ( 74 )، ومادة ٢ والمادتين ١٢";
  assert.deepEqual(extractLegalRefs(text), ["مادة 77", "مادة 80", "مادة 74", "مادة 2", "مادة 12"]);
  assert.deepEqual(extractLegalRefs("المادة 77 ثم المادة (٧٧)"), ["مادة 77"]);
});

test("numbered decisions, judgments and royal decrees", () => {
  const text = "الحكم رقم 4430123 والمبدأ رقم (١٢٣/٤) والمرسوم الملكي رقم م/51 والتعميم رقم 13/ت/1234";
  assert.deepEqual(extractLegalRefs(text), ["رقم 4430123", "رقم 123/4", "رقم م/51", "رقم 13/ت/1234"]);
});

test("words that only contain the letters are not articles; «رقم» without a number is skipped", () => {
  assert.deepEqual(extractLegalRefs("زيادة 50 ألفاً وعمادة 3 ورقم الهوية غير مذكور"), []);
});

test("diacritics and tatweel do not hide a reference", () => {
  assert.deepEqual(extractLegalRefs("المـــادَّة ٧٧"), ["مادة 77"]);
});

test("missingLegalRefs names exactly what the shorter text dropped", () => {
  const required = extractLegalRefs("وفق المادة ٧٧ والمادة ٨٠ والحكم رقم ٥٥٥");
  assert.deepEqual(missingLegalRefs(required, "وفق المادة (77) والحكم رقم 555"), ["مادة 80"]);
  assert.deepEqual(missingLegalRefs(required, "المادة 77، المادة 80، الحكم رقم 555"), []);
  assert.deepEqual(missingLegalRefs([], "أي نص"), []);
});

test("non-text input gives no references", () => {
  assert.deepEqual(extractLegalRefs(undefined as unknown as string), []);
  assert.deepEqual(extractLegalRefs(""), []);
});
