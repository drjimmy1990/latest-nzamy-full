/**
 * _blankFields.test.ts — owner ٤١٦ (rule v5.2): an unfilled field is marked
 * «[يحتاج تحقق]», never deleted silently.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/ai/najiz-optimizer/_blankFields.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { markBlankFields, NAJIZ_NEEDS_CHECK } from "./_blankFields.ts";

test("a labelled placeholder keeps its label and gets the marker", () => {
  const r = markBlankFields("الاسم: محمد\nرقم الهوية: ..........\nالتاريخ:__________");
  assert.equal(r.text, `الاسم: محمد\nرقم الهوية: ${NAJIZ_NEEDS_CHECK}\nالتاريخ: ${NAJIZ_NEEDS_CHECK}`);
  assert.equal(r.marked, 2);
});

test("a placeholder inside a sentence is marked in place, the words around it kept", () => {
  const r = markBlankFields("ويمثله نظاماً .......... بموجب الوكالة رقم ----- وتاريخ");
  assert.equal(r.text, `ويمثله نظاماً ${NAJIZ_NEEDS_CHECK} بموجب الوكالة رقم ${NAJIZ_NEEDS_CHECK} وتاريخ`);
  assert.equal(r.marked, 2);
});

test("a label followed only by spaces is a blank field too", () => {
  const r = markBlankFields("رقم القضية:          ");
  assert.equal(r.text, `رقم القضية: ${NAJIZ_NEEDS_CHECK}`);
  assert.equal(r.marked, 1);
});

test("a ruler or separator line has no field: dropped, not marked", () => {
  const r = markBlankFields("الوقائع\n--------------------\n____________\n..........\nنص");
  assert.equal(r.text, "الوقائع\nنص");
  assert.equal(r.marked, 0);
});

test("an ellipsis, indentation and spaced text are left alone", () => {
  const text = "وحيث إن ... المدعي\n    سطر مزاح\nكلمة     كلمة";
  assert.deepEqual(markBlankFields(text), { text, marked: 0 });
});

test("each line keeps its own ending", () => {
  assert.equal(markBlankFields("أ: .....\r\nب").text, `أ: ${NAJIZ_NEEDS_CHECK}\r\nب`);
});

test("the page runs R3 through markBlankFields and says so, with no «حذف الحقول الفارغة» left", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("markBlankFields("));
  assert.doesNotMatch(page, /حذف الحقول الفارغة/);
  assert.ok(page.includes("[يحتاج تحقق]"), "the copy names the marker");
});
