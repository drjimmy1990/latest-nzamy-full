import assert from "node:assert/strict";
import test from "node:test";
import { stripMarkdownMarks } from "./stripMarkdownMarks.ts";

test("the owner's principle card: leading ** and a ## heading are removed", () => {
  assert.equal(
    stripMarkdownMarks("**\n## مبدأ إداري رقم 49\nلا يجوز للإدارة سحب القرار"),
    "مبدأ إداري رقم 49\nلا يجوز للإدارة سحب القرار",
  );
  assert.equal(stripMarkdownMarks("## مبدأ إداري رقم 49"), "مبدأ إداري رقم 49");
  assert.equal(stripMarkdownMarks("**## مبدأ إداري رقم 49**"), "مبدأ إداري رقم 49");
  assert.equal(stripMarkdownMarks("###مبدأ"), "مبدأ");
});

test("a truncated search snippet keeps its «…» and loses the marks after it", () => {
  assert.equal(stripMarkdownMarks("…## مبدأ رقم 5"), "…مبدأ رقم 5");
  assert.equal(stripMarkdownMarks("…الأولى** ثم الثانية"), "…الأولى ثم الثانية");
  assert.equal(stripMarkdownMarks("…- البند الثاني"), "…البند الثاني");
});

test("bold and italic marks, paired or left over", () => {
  assert.equal(stripMarkdownMarks("يجب **التبليغ** خلال المدة"), "يجب التبليغ خلال المدة");
  assert.equal(stripMarkdownMarks("***تنبيه*** مهم"), "تنبيه مهم");
  assert.equal(stripMarkdownMarks("__عنوان__ النص"), "عنوان النص");
  assert.equal(stripMarkdownMarks("هذا *مهم* جداً"), "هذا مهم جداً");
  assert.equal(stripMarkdownMarks("هذا _مهم_ جداً"), "هذا مهم جداً");
  assert.equal(stripMarkdownMarks("بداية **النص المقطوع"), "بداية النص المقطوع");
});

test("separator lines and leading bullets are removed", () => {
  assert.equal(stripMarkdownMarks("الفقرة الأولى\n***\nالفقرة الثانية"), "الفقرة الأولى\nالفقرة الثانية");
  assert.equal(stripMarkdownMarks("أ\n---\nب\n___\nج"), "أ\nب\nج");
  assert.equal(stripMarkdownMarks("- بند أول\n* بند ثان\n+ بند ثالث\n• بند رابع"), "بند أول\nبند ثان\nبند ثالث\nبند رابع");
});

test("numbers, numbered markers, footnote marks and plain Arabic are untouched", () => {
  assert.equal(stripMarkdownMarks("المادة 49 من النظام"), "المادة 49 من النظام");
  assert.equal(stripMarkdownMarks("المادة ٤٩ من النظام"), "المادة ٤٩ من النظام");
  assert.equal(stripMarkdownMarks("1. البند الأول\n١- البند الثاني"), "1. البند الأول\n١- البند الثاني");
  assert.equal(stripMarkdownMarks("نص الحكم (*) والهامش (*)"), "نص الحكم (*) والهامش (*)");
  assert.equal(stripMarkdownMarks("الفقرة 5-1 و -3"), "الفقرة 5-1 و -3");
  assert.equal(stripMarkdownMarks("وسم #نظام_العمل في النص"), "وسم #نظام_العمل في النص");
  assert.equal(stripMarkdownMarks("الاسم: ______"), "الاسم: ______");
  const plain = "لا يجوز للمحكمة أن تقضي بأكثر مما طلبه الخصوم.";
  assert.equal(stripMarkdownMarks(plain), plain);
});

test("empty and missing input give an empty string", () => {
  assert.equal(stripMarkdownMarks(""), "");
  assert.equal(stripMarkdownMarks(null), "");
  assert.equal(stripMarkdownMarks(undefined), "");
  assert.equal(stripMarkdownMarks("  **  "), "");
});
