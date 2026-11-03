import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countTermMatches,
  highlightMultiColorSegments,
  matchesQuery,
  parseHighlightQuery,
  withSearchQuery,
} from "./multiColorSearch.ts";

const marked = (text: string, query: string) =>
  highlightMultiColorSegments(text, parseHighlightQuery(query).terms)
    .filter((s) => s.term !== null)
    .map((s) => [s.text, s.term]);

test("note ٠٦: every word of «عزل + المحكمة + 1436» is its own term and colour", () => {
  const p = parseHighlightQuery("عزل + المحكمة + 1436");
  assert.deepEqual(p.terms.map((t) => [t.label, t.color]), [["عزل", 0], ["المحكمة", 1], ["1436", 2]]);
  assert.deepEqual(p.groups, [[0, 1, 2]]);
  assert.deepEqual(marked("قضت المحكمة بعزل الوكيل عام ١٤٣٦هـ", "عزل + المحكمة + 1436"), [
    ["المحكمة", 1],
    ["عزل", 0],
    ["١٤٣٦", 2],
  ]);
});

test("a quoted phrase is one colour and beats its own words (longest first)", () => {
  const segs = marked("طلب عزل الوكيل ثم عزل الناظر", '"عزل الوكيل" عزل');
  assert.deepEqual(segs, [["عزل الوكيل", 0], ["عزل", 1]]);
});

test("`/` alternatives each get their own colour and form OR groups", () => {
  const p = parseHighlightQuery("اعتزال / عزل");
  assert.deepEqual(p.terms.map((t) => t.label), ["اعتزال", "عزل"]);
  assert.deepEqual(p.groups, [[0], [1]]);
  assert.equal(matchesQuery(["قرار بالعزل"], p), true);
  assert.equal(matchesQuery(["قرار بالتعيين"], p), false);
});

test("a date and «م/14» keep their slash: one term, not an OR", () => {
  assert.deepEqual(parseHighlightQuery("1444/10/20").terms.map((t) => t.label), ["1444/10/20"]);
  assert.deepEqual(parseHighlightQuery("م/14").terms.map((t) => t.label), ["م/14"]);
  assert.deepEqual(marked("بالمرسوم الملكي رقم (م/١٤) وتاريخ ١٤٤٤/١٠/٢٠هـ", "م/14 1444/10/20"), [
    ["م/١٤", 0],
    ["١٤٤٤/١٠/٢٠", 1],
  ]);
});

test("a prefix term `*` colours the whole word, not its first letters", () => {
  assert.deepEqual(marked("وكيله وكيلها الوكيلان", "وكيل*"), [["وكيله", 0], ["وكيلها", 0], ["وكيلان", 0]]);
  assert.equal(parseHighlightQuery("وكيل*").terms[0].kind, "prefix");
});

test("`-word` excludes the row and is never coloured", () => {
  const p = parseHighlightQuery("عقد -تحكيم");
  assert.deepEqual(p.terms.map((t) => t.label), ["عقد"]);
  assert.deepEqual(p.excluded.map((t) => t.label), ["تحكيم"]);
  assert.equal(matchesQuery(["عقد مقاولة"], p), true);
  assert.equal(matchesQuery(["عقد مقاولة مع شرط التحكيم"], p), false);
  assert.deepEqual(marked("عقد فيه تحكيم", "عقد -تحكيم"), [["عقد", 0]]);
});

test("folding: hamza forms, ة/ه, ى/ي, three digit scripts, harakat — the original text is kept", () => {
  assert.deepEqual(marked("نظام الإثبات", "الاثبات"), [["الإثبات", 0]]);
  assert.deepEqual(marked("في جدة", "جده"), [["جدة", 0]]);
  assert.deepEqual(marked("مُستشفى", "مستشفي"), [["مُستشفى", 0]]);
  assert.deepEqual(marked("المادة ١٢٣ والمادة ۱۲۳ والمادة 123", "123"), [["١٢٣", 0], ["۱۲۳", 0], ["123", 0]]);
  const text = "الأَحْوَال الشخصية";
  const segs = highlightMultiColorSegments(text, parseHighlightQuery("الاحوال").terms);
  assert.equal(segs.map((s) => s.text).join(""), text);
  assert.deepEqual(segs.filter((s) => s.term !== null).map((s) => s.text), ["الأَحْوَال"]);
});

test("the segments always join back to the input exactly", () => {
  const text = "<b>نص</b> & «عزل» — 1436/٧/١";
  for (const q of ["عزل", '"عزل"', "b", "1436/7/1", "&", "-x y", ""]) {
    assert.equal(highlightMultiColorSegments(text, parseHighlightQuery(q).terms).map((s) => s.text).join(""), text, q);
  }
});

test("regex metacharacters in the query stay literal", () => {
  assert.deepEqual(marked("a.b axb (c) [d]", "a.b"), [["a.b", 0]]);
  assert.deepEqual(marked("a.b axb (c) [d]", "(c)"), [["(c)", 0]]);
});

test("half-typed queries never throw and still highlight", () => {
  for (const q of ['"عزل', "عزل +", "+", "/", "-", "*", "--x", '""', "a//b", "\u0000"]) {
    assert.doesNotThrow(() => parseHighlightQuery(q), q);
  }
  assert.deepEqual(parseHighlightQuery('"عزل الوكيل').terms.map((t) => t.label), ["عزل الوكيل"]);
});

test("cross-field AND: «تجارية جدة» matches name + city on one row (note ٠٧)", () => {
  const p = parseHighlightQuery("تجارية جده");
  assert.equal(matchesQuery(["الدائرة التجارية الأولى", "جدة", "x@moj.gov.sa"], p), true);
  assert.equal(matchesQuery(["الدائرة التجارية الأولى", "الرياض"], p), false);
  assert.equal(matchesQuery(["أي شيء"], parseHighlightQuery("")), true);
  assert.equal(matchesQuery(["الدائرة 1"], parseHighlightQuery("الدائرة ١")), true);
});

test("counts per term across texts", () => {
  const terms = parseHighlightQuery('"عزل الوكيل" المحكمة').terms;
  assert.deepEqual(countTermMatches(["عزل الوكيل أمام المحكمة", "المحكمة", null], terms), [1, 2]);
});

test("duplicate terms share one colour; at most 12 colours", () => {
  const p = parseHighlightQuery("عزل العزل عزل");
  assert.deepEqual(p.terms.map((t) => t.label), ["عزل", "العزل"]);
  assert.equal(parseHighlightQuery(Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ")).terms.length, 12);
});

test("withSearchQuery adds ?q= before the hash and replaces an old one", () => {
  assert.equal(withSearchQuery("/precedents/x#p12", "عزل"), `/precedents/x?q=${encodeURIComponent("عزل")}#p12`);
  assert.equal(withSearchQuery("/laws/a?q=old&x=1", "new"), "/laws/a?q=new&x=1");
  assert.equal(withSearchQuery("/laws/a#m3", "  "), "/laws/a#m3");
  assert.equal(withSearchQuery("/book/b", '"a b"'), "/book/b?q=%22a+b%22");
});
