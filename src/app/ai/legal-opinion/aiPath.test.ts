/**
 * L12 (owner LIVE-F21 / NOTE-22): the consultation and the letter generate
 * automatically by default; the team's review stays a separate, optional
 * order; the other five types say plainly that they are the team's order.
 *
 * Source-read (.tsx cannot load under node --test); comments are stripped.
 * RUN (from this folder): node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test aiPath.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
const read = (f: string) => strip(readFileSync(new URL(f, import.meta.url), "utf8"));

const page = read("./page.tsx");
const letter = read("./_components/LetterWorkflow.tsx");
const panel = read("./_components/AiOpinionPanel.tsx");

test("the consultation's submit step: the automatic panel first, then the team order, both live", () => {
  const ai = page.indexOf('kind="consult"');
  const divider = page.indexOf("<TeamOrderDivider");
  const order = page.indexOf("<SubmitStep");
  assert.ok(ai > 0 && ai < divider && divider < order, "panel → divider → team order");
  assert.match(page, /createServiceOrder\(/, "the team order is kept");
  assert.match(page, /consultRunInput\(LEGAL_AREA_LABELS\[topicArea\], description\)/);
});

test("the quick box leads to the consultation's submit step and clears an earlier result", () => {
  const box = page.slice(page.indexOf('setSelectedType("consult");'), page.indexOf("متابعة"));
  assert.match(box, /setCurrentStep\("submit"\)/);
  assert.match(box, /consultRun\.reset\(\)/);
});

test("the letter's step 4: the automatic panel above the team order, inside one step", () => {
  const ai = letter.indexOf('kind="letter"');
  const order = letter.indexOf("submitLetterOrder}");
  assert.ok(ai > 0 && ai < order);
  assert.match(letter, /createServiceOrder\(/, "the team order is kept");
  assert.match(letter, /طلب الخطاب من فريق نظامي \(اختياري\)/);
  assert.equal((letter.match(/letterStep === 4 && \(/g) ?? []).length, 1, "one child for AnimatePresence mode=wait");
});

test("every card says which path it is; only consult and letter claim generation", () => {
  assert.match(page, /ot\.id === "consult" \|\| ot\.id === "letter" \? "توليد آلي فوري · مراجعة الفريق اختيارية" : "طلب يعدّه فريق نظامي"/);
});

test("the panel never creates an order and never claims a human saw its result", () => {
  assert.doesNotMatch(panel, /createServiceOrder|serviceOrders/);
  assert.match(panel, /لم يراجعها محامٍ/);
  assert.match(panel, /AI_OPINION_TOOL\[kind\]/);
});
