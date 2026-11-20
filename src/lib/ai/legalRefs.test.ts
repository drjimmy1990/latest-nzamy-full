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

test("an Arabic comma or semicolon right before a reference does not hide it", () => {
  assert.deepEqual(extractLegalRefs("وفق المادة ٧٧،والمادة ٨٠؛وللمادة ٩١"), ["مادة 77", "مادة 80", "مادة 91"]);
});

test("bidi isolates, zero-width marks and a BOM from pasted text do not hide a reference", () => {
  const c = (n: number) => String.fromCharCode(n); // BOM, LRI/PDI, RLM, NBSP
  const text = `${c(0xfeff)}المادة ${c(0x2066)}٧٧${c(0x2069)} والحكم رقم${c(0x200f)} ٥٥٥ والمادة${c(0xa0)}(١٢)`;
  assert.deepEqual(extractLegalRefs(text), ["مادة 77", "مادة 12", "رقم 555"]);
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

test("a spelled-out article reads as the same key as its digits", () => {
  assert.deepEqual(extractLegalRefs("نصت المادة الخامسة والعشرون على ذلك"), ["مادة 25"]);
  assert.deepEqual(extractLegalRefs("المادة الخامسة والعشرون ثم المادة (25)"), ["مادة 25"]);
  assert.deepEqual(
    extractLegalRefs("وفق المادة الأولى، وللمادة الحادية عشرة، وبالمادة الثمانين، والمادة العاشرة، والمادة المائة"),
    ["مادة 1", "مادة 11", "مادة 80", "مادة 10", "مادة 100"],
  );
  assert.deepEqual(extractLegalRefs("المادة (الخامسة والسبعين) من نظام العمل"), ["مادة 75"]);
  assert.deepEqual(extractLegalRefs("المادة الثانية عشرة والمادة السابعة والتسعون"), ["مادة 12", "مادة 97"]);
});

test("a spelled-out article past the hundred: «… بعد المائة / المائتين»", () => {
  assert.deepEqual(extractLegalRefs("المادة الحادية والعشرون بعد المائة"), ["مادة 121"]);
  assert.deepEqual(extractLegalRefs("المادة الأولى بعد المئتين والمادة الخامسة بعد الثلاثمائة"), ["مادة 201", "مادة 305"]);
  // «بعد» followed by anything else is not a number: no key rather than a wrong one.
  assert.deepEqual(extractLegalRefs("المادة الحادية والعشرون بعد التعديل"), []);
});

test("digits and words keep the text's order, and a spelled number needs «المادة»", () => {
  assert.deepEqual(extractLegalRefs("المادة 80 ثم المادة الخامسة ثم المادة ٧"), ["مادة 80", "مادة 5", "مادة 7"]);
  assert.deepEqual(extractLegalRefs("في الفقرة الخامسة والعشرين، وفي المادة الأساسية"), []);
});

test("Arabic-Indic and Persian digits read as ASCII", () => {
  assert.deepEqual(extractLegalRefs("المادة ٧٧ والمادة ۸۰ والحكم رقم ٤٤٣٠١٢٣"), ["مادة 77", "مادة 80", "رقم 4430123"]);
});

test("missingLegalRefs accepts a spelled-out reference rewritten in digits, and the reverse", () => {
  const required = extractLegalRefs("المادة الخامسة والعشرون والمادة 80");
  assert.deepEqual(missingLegalRefs(required, "المادة 25 والمادة الثمانون"), []);
  assert.deepEqual(missingLegalRefs(required, "المادة 25 فقط"), ["مادة 80"]);
});

// ── N02-13 (batch l11): the dual names two articles ──
test("«المادتين» / «المادتان» yield both articles, in words or digits", () => {
  assert.deepEqual(extractLegalRefs("وفق المادتين الأولى والثانية من النظام"), ["مادة 1", "مادة 2"]);
  assert.deepEqual(extractLegalRefs("نصت المادتان (٥) و(٦) على"), ["مادة 5", "مادة 6"]);
  assert.deepEqual(extractLegalRefs("بالمادتين الحادية عشرة والثانية عشرة"), ["مادة 11", "مادة 12"]);
  // A compound number after the dual is one article, not two.
  assert.deepEqual(extractLegalRefs("المادتين الخامسة والعشرين و(٣٠)"), ["مادة 25", "مادة 30"]);
  // A shorter text that dropped the second article is caught.
  assert.deepEqual(missingLegalRefs(extractLegalRefs("المادتين (٥) و(٦)"), "المادة 5"), ["مادة 6"]);
});
