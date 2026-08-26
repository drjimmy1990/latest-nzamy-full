import { test } from "node:test";
import assert from "node:assert/strict";
import { tafqit, integerToArabicWords, TAFQIT_MAX } from "./tafqit.ts";

test("the units, and the one rule English speakers get backwards", () => {
  assert.equal(integerToArabicWords(0), "صفر");
  assert.equal(integerToArabicWords(7), "سبعة");
  assert.equal(integerToArabicWords(10), "عشرة");
  assert.equal(integerToArabicWords(11), "أحد عشر");
  assert.equal(integerToArabicWords(12), "اثنا عشر");
  assert.equal(integerToArabicWords(19), "تسعة عشر");
  // Arabic says the unit BEFORE the ten. «عشرون وواحد» is the classic error.
  assert.equal(integerToArabicWords(21), "واحد وعشرون");
  assert.equal(integerToArabicWords(99), "تسعة وتسعون");
  assert.equal(integerToArabicWords(20), "عشرون");
});

test("hundreds have their own words, not «ثلاثة مائة»", () => {
  assert.equal(integerToArabicWords(100), "مائة");
  assert.equal(integerToArabicWords(200), "مائتان");
  assert.equal(integerToArabicWords(300), "ثلاثمائة");
  assert.equal(integerToArabicWords(900), "تسعمائة");
  assert.equal(integerToArabicWords(250), "مائتان وخمسون");
  assert.equal(integerToArabicWords(999), "تسعمائة وتسعة وتسعون");
});

test("the scale words take three different forms by count", () => {
  assert.equal(integerToArabicWords(1000), "ألف");
  assert.equal(integerToArabicWords(2000), "ألفان");
  assert.equal(integerToArabicWords(3000), "ثلاثة آلاف");
  assert.equal(integerToArabicWords(10000), "عشرة آلاف");
  // 11 and above take the counted SINGULAR — «أحد عشر آلاف» is wrong.
  assert.equal(integerToArabicWords(11000), "أحد عشر ألفاً");
  assert.equal(integerToArabicWords(50000), "خمسون ألفاً");
  assert.equal(integerToArabicWords(1_000_000), "مليون");
  assert.equal(integerToArabicWords(2_000_000), "مليونان");
  assert.equal(integerToArabicWords(3_000_000), "ثلاثة ملايين");
});

test("a zero group is skipped, not spoken", () => {
  // «مليون وصفر ألف ومائة» would be nonsense on a receipt.
  assert.equal(integerToArabicWords(1_000_100), "مليون ومائة");
  assert.equal(integerToArabicWords(1_000_000_000), "مليار");
});

test("the receipt line reads the way a receipt reads", () => {
  assert.equal(tafqit(1250), "فقط ألف ومائتان وخمسون ريالاً سعودياً لا غير");
  assert.equal(tafqit(250), "فقط مائتان وخمسون ريالاً سعودياً لا غير");
  assert.equal(tafqit(800), "فقط ثمانمائة ريالاً سعودياً لا غير");
});

test("one and two carry the count inside the unit word", () => {
  // «واحد ريال سعودي» is not how anyone writes a receipt.
  assert.equal(tafqit(1), "فقط ريال سعودي لا غير");
  assert.equal(tafqit(2), "فقط ريالان سعوديان لا غير");
});

test("halalas are spoken, and only when there are any", () => {
  assert.equal(tafqit(1250.5), "فقط ألف ومائتان وخمسون ريالاً سعودياً وخمسون هللة لا غير");
  assert.equal(tafqit(0.25), "فقط خمسة وعشرون هللة لا غير");
  assert.ok(!tafqit(1250).includes("هللة"));
});

test("the words are rounded exactly as the figure beside them is", () => {
  // 99.999 prints as 100.00 on the receipt; the words must say مائة too, or
  // the two lines contradict each other.
  assert.equal(tafqit(99.999), "فقط مائة ريالاً سعودياً لا غير");
  assert.equal(tafqit(0.005), "فقط هللة لا غير");
  assert.equal(tafqit(10.004), "فقط عشرة ريالاً سعودياً لا غير");
});

test("zero is expressible — a receipt for nothing is still a receipt", () => {
  assert.equal(tafqit(0), "فقط صفر ريالاً سعودياً لا غير");
});

test("what cannot be expressed comes back EMPTY, never partial", () => {
  // A blank words line on a receipt is a visible problem. A wrong one is an
  // invisible one, so nothing is ever guessed.
  for (const bad of [-1, -0.5, NaN, Infinity, -Infinity, TAFQIT_MAX + 1]) {
    assert.equal(tafqit(bad), "", `should refuse: ${bad}`);
  }
  assert.notEqual(tafqit(TAFQIT_MAX), "");
});

test("no Latin characters ever reach the line", () => {
  for (const n of [0, 1, 2, 19, 21, 100, 250, 1250.75, 11000, 3_000_000]) {
    assert.ok(!/[A-Za-z0-9]/.test(tafqit(n)), `leaked: ${tafqit(n)}`);
  }
});
