/**
 * #17 / #18 (owner package 6-Nov): a repealed article shows «أُلغيت … بموجب»
 * and the owner's warning, the prior text folds, the heading is struck.
 * Strings are the shapes the owner's 10-03 export / the parser produce.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { repealedByLine, splitRepealedArticle, splitRepealedMarker, splitStrike } from "./_repealed-article.ts";

const HEAD = "### ~~المادة الثالثة والعشرون~~ `[ملغاة]`";
const LINE = "🚫 **أُلغيت هذه المادة بموجب:** المرسوم الملكي رقم (م/89) وتاريخ 1448/03/18هـ.";
const WARN = "> ⚠️ **تنبيه:** المادة الأصلية ملغاة. وضع اللائحة المرتبطة بها لا يُستنتج آليًا من هذا الملف.";
const PRIOR = "يعاقب كل من خالف أحكام هذا النظام بغرامة لا تزيد على ألف ريال.";

test("prior text in its own column: the notice and the warning come from `text`", () => {
  const parts = splitRepealedArticle(`${HEAD}\n${LINE}\n\n${WARN}`, PRIOR);
  assert.equal(parts.heading, HEAD);
  assert.equal(parts.notice, LINE);
  assert.equal(parts.prior, PRIOR);
  assert.equal(parts.warning, WARN);
});

test("live law-traffic art. 71 shape: heading + «أُلغيت … بموجب» in text, the prior wording in originalText", () => {
  const text = "### ~~المادة الحادية والسبعون~~ `[ملغاة]`\n\nأُلغيت هذه المادة بموجب المرسوم الملكي رقم (م/140) وتاريخ 1442/11/14هـ.";
  const parts = splitRepealedArticle(text, `"${PRIOR}"`);
  assert.equal(parts.notice, "أُلغيت هذه المادة بموجب المرسوم الملكي رقم (م/140) وتاريخ 1442/11/14هـ.");
  assert.equal(parts.prior, `"${PRIOR}"`);
  assert.equal(parts.warning, "");
});

test("no prior column: everything that is not the notice or the warning is the prior text", () => {
  const parts = splitRepealedArticle(`${LINE}\n\n${PRIOR}\n\n${WARN}`, null);
  assert.equal(parts.notice, LINE);
  assert.equal(parts.prior, PRIOR);
  assert.equal(parts.warning, WARN);
});

test("text that only repeats the prior wording is not shown twice", () => {
  const parts = splitRepealedArticle(`${LINE}\n${PRIOR}`, PRIOR);
  assert.equal(parts.notice, LINE);
  assert.equal(parts.prior, PRIOR);
});

test("a plain repealed row with no notice keeps its whole text as the prior text", () => {
  const parts = splitRepealedArticle(PRIOR, null);
  assert.deepEqual(parts, { heading: "", notice: "", prior: PRIOR, warning: "" });
  assert.deepEqual(splitRepealedArticle(null, undefined), { heading: "", notice: "", prior: "", warning: "" });
  // An emptied repealed body: the parser leaves only the heading in `text` -> nothing to show but the fold.
  assert.deepEqual(splitRepealedArticle(HEAD, null), { heading: HEAD, notice: "", prior: "", warning: "" });
});

test("inside the prior wording, a sub-heading, a «أُلغي هذا البند» line and a plain «تنبيه:» stay in the fold", () => {
  const body = [
    "يتكون المجلس من الأعضاء الآتين:",
    "#### أولاً: التشكيل",
    "1- رئيس المجلس.",
    "أُلغي هذا البند بموجب القرار رقم (12).",
    "تنبيه: تسري هذه الأحكام من تاريخ نشرها.",
  ].join("\n");
  const parts = splitRepealedArticle(`${LINE}\n\n${body}\n\n${WARN}`, null);
  assert.equal(parts.notice, LINE);
  assert.equal(parts.heading, "");
  assert.equal(parts.prior, body);
  assert.equal(parts.warning, WARN);
});

test("«ألغي» inside the law (not the article speaking of itself) stays prior text", () => {
  const law = "تُلغى المادة (5) من نظام سابق، ويُلغى كل ما يتعارض مع هذا النظام.";
  assert.equal(splitRepealedArticle(law, null).prior, law);
  assert.equal(splitRepealedArticle(law, null).notice, "");
});

test("the «أُلغيت بموجب» line is built from the repeal entry only when the text lacks one", () => {
  const amendments = [
    { type: "تعديل", source: "م/12", date: "1440/1/1هـ" },
    { type: "إلغاء", source: "المرسوم الملكي رقم (م/89)", date: "1448/03/18هـ" },
  ];
  assert.equal(repealedByLine("", amendments), "أُلغيت هذه المادة بموجب: المرسوم الملكي رقم (م/89) وتاريخ 1448/03/18هـ.");
  assert.equal(repealedByLine(LINE, amendments), null);
  // Instrument withheld from a guest (T28-22) → no line.
  assert.equal(repealedByLine("", [{ type: "إلغاء", source: "", date: "1448/03/18هـ" }]), null);
  assert.equal(repealedByLine("", undefined), null);
});

test("heading helpers: «~~…~~» struck, «[ملغاة]» taken out for a badge", () => {
  assert.deepEqual(splitStrike("~~المادة الأولى~~ تمهيد"), [
    { text: "المادة الأولى", struck: true },
    { text: " تمهيد", struck: false },
  ]);
  assert.deepEqual(splitStrike("المادة الأولى"), [{ text: "المادة الأولى", struck: false }]);
  assert.deepEqual(splitRepealedMarker("~~المادة الأولى~~ `[ملغاة]`"), { text: "~~المادة الأولى~~", repealed: true });
  assert.deepEqual(splitRepealedMarker("المادة الأولى (ملغى)"), { text: "المادة الأولى", repealed: true });
  assert.deepEqual(splitRepealedMarker("المادة الأولى [معدّلة]"), { text: "المادة الأولى [معدّلة]", repealed: false });
});
