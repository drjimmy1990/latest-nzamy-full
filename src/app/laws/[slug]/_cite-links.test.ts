/**
 * _cite-links.test.ts — the reader's citation chips (N02-14).
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "src/app/laws/[slug]/_cite-links.test.ts" (with --test a [slug] path is read as a glob and runs nothing)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { linkCitationsHtml, readDocName, scanCitations } from "./_cite-links.ts";

const nums = (text: string) => scanCitations(text).filter((c) => c.kind === "article").map((c) => c.numbers);
const chip = (text: string, i = 0) => {
  const c = scanCitations(text)[i];
  return c ? text.slice(c.start, c.end) : null;
};

test("spelled-out ordinals: الأولى … المائة and past it", () => {
  const cases: Array<[string, number]> = [
    ["المادة الأولى", 1],
    ["المادة العاشرة", 10],
    ["المادة الحادية عشرة", 11],
    ["المادة الثانية عشرة", 12],
    ["المادة العشرون", 20],
    ["المادة الحادية والعشرون", 21],
    ["المادة التاسعة والتسعون", 99],
    ["المادة المائة", 100],
    ["المادة التاسعة بعد المائة", 109],
    ["المادة الخامسة والعشرين بعد المائتين", 225],
  ];
  for (const [text, n] of cases) assert.deepEqual(nums(`وفقاً لما ورد في ${text} من هذا النظام.`), [[n]], text);
});

test("digits, Arabic-Indic digits, brackets, duals and lists", () => {
  assert.deepEqual(nums("المادة (٣٥)"), [[35]]);
  assert.deepEqual(nums("المادة 77"), [[77]]);
  assert.deepEqual(nums("للمادة ( ١٢ )"), [[12]]);
  assert.deepEqual(nums("المادتين (٥) و(٦)"), [[5, 6]]);
  assert.deepEqual(nums("المواد من (٣) إلى (٧)"), [[3, 4, 5, 6, 7]]);
});

test("the chip covers the noun to the closing bracket, without a leading «و»", () => {
  assert.equal(chip("والمادة (٣٥) تنص"), "المادة (٣٥)");
  assert.equal(chip("طبقاً للمادة (٣٥)، يلتزم"), "للمادة (٣٥)");
});

test("«من هذا النظام» is this document and is part of the chip", () => {
  const [c] = scanCitations("مع مراعاة ما ورد في المادة الخامسة من هذا النظام، يجوز");
  assert.equal(c.scope, "self");
  assert.deepEqual(c.numbers, [5]);
  assert.equal("مع مراعاة ما ورد في المادة الخامسة من هذا النظام، يجوز".slice(c.start, c.end), "المادة الخامسة من هذا النظام");
  assert.equal(scanCitations("المادة (٤) من هذه اللائحة")[0].scope, "self");
});

test("«من هذه اللائحة» must fit the document: no chip in a نظام, self in a لائحة", () => {
  assert.equal(scanCitations("المادة (٤) من هذه اللائحة", { docTitle: "نظام العمل" }).length, 0);
  assert.equal(scanCitations("المادة (٤) من هذه اللائحة", { docTitle: "اللائحة التنفيذية لنظام العمل" })[0].scope, "self");
  assert.equal(scanCitations("المادة (٤) من هذا النظام", { docTitle: "نظام العمل" })[0].scope, "self");
  assert.equal(scanCitations("المادة (٤) من هذا النظام", { docTitle: "اللائحة التنفيذية لنظام العمل" })[0].scope, "parent");
});

test("«من النظام»: this law in a law, the parent law in a regulation", () => {
  assert.equal(scanCitations("المادة (٤) من النظام.", { docTitle: "نظام العمل" })[0].scope, "self");
  assert.equal(scanCitations("المادة (٤) من النظام.", { docTitle: "اللائحة التنفيذية لنظام العمل" })[0].scope, "parent");
});

test("«من نظام العمل» names another law; its name ends at a stop word", () => {
  const text = "استثناءً من المادة (٧٧) من نظام العمل الصادر بالمرسوم الملكي";
  const [c] = scanCitations(text);
  assert.equal(c.scope, "other");
  assert.equal(c.docName, "نظام العمل");
  assert.equal(text.slice(c.start, c.end), "المادة (٧٧) من نظام العمل");
});

test("the article's own number is not linked to itself", () => {
  assert.equal(scanCitations("تسري أحكام المادة (٥) على", { selfNumber: 5 }).length, 0);
  assert.equal(scanCitations("تسري أحكام المادة (٥) على", { selfNumber: 6 }).length, 1);
  // …but «المادة (٥) من نظام العمل» inside article 5 of another law is.
  assert.equal(scanCitations("المادة (٥) من نظام العمل", { selfNumber: 5 }).length, 1);
});

test("a named document the parser cannot place is left as text, never guessed", () => {
  // «من اللائحة» in a law that is not a regulation: which one is unknown.
  assert.equal(scanCitations("المادة (٤) من اللائحة.", { docTitle: "نظام العمل" }).length, 0);
});

test("named laws and decrees become chips", () => {
  const text = "وفقاً لنظام المرافعات الشرعية، وبموجب المرسوم الملكي رقم (م/٥١) وتاريخ ٢٣/٨/١٤٢٦هـ";
  const found = scanCitations(text);
  assert.deepEqual(found.map((c) => c.kind), ["law", "decree"]);
  assert.equal(found[0].docName, "نظام المرافعات الشرعية");
  assert.equal(text.slice(found[1].start, found[1].end), "المرسوم الملكي رقم (م/٥١)");
  // «هذا النظام», «النظام الأساسي» and a bare «مرسوم ملكي» name nothing.
  assert.equal(scanCitations("تسري أحكام هذا النظام وفق النظام الأساسي بموجب مرسوم ملكي.").length, 0);
});

test("readDocName stops at punctuation, digits and stop words", () => {
  assert.equal(readDocName("نظام الشركات، ويعمل").name, "نظام الشركات");
  assert.equal(readDocName("نظام الإجراءات الجزائية في").name, "نظام الإجراءات الجزائية");
  assert.equal(readDocName("نظام (١)").name, "نظام");
});

test("html: only text runs, never inside a link, entities intact, fixed attributes", () => {
  const html = 'انظر المادة (٣٥) &amp; <a href="/x">المادة (٣٦)</a> <strong>المادة (٣٧)</strong>';
  const out = linkCitationsHtml(html);
  assert.equal((out.match(/<button /g) ?? []).length, 2);
  assert.ok(out.includes('<a href="/x">المادة (٣٦)</a>'), out);
  assert.ok(out.includes("&amp;"), out);
  assert.ok(out.includes('data-cite-kind="article" data-cite-scope="self" data-cite-n="35"'), out);
  assert.ok(out.includes('data-cite-n="37"'), out);
  // No source text ever lands in an attribute.
  for (const attr of out.matchAll(/data-cite-[a-z]+="([^"]*)"/g)) assert.match(attr[1], /^[a-z0-9,]+$/);
  assert.equal(linkCitationsHtml("لا شيء هنا"), "لا شيء هنا");
});
