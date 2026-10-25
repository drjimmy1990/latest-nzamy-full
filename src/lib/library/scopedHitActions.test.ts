import { test } from "node:test";
import assert from "node:assert/strict";
import { hitCartEntry, hitCopy, principleReference, scopedPanelTitle, type ScopeInfo } from "./scopedHitActions.ts";
import type { ScopedHit } from "../../app/api/library/scoped-search/scopedSearch.ts";

const lawScope: ScopeInfo = { kind: "law", id: "competition", title: "نظام المنافسات", detail: "نظام", volumes: [{ id: "competition", label: null }] };
const colScope: ScopeInfo = { kind: "collection", id: "v2", title: "مجموعة الأحكام القضائية لعام 1434هـ", detail: "ديوان المظالم", volumes: [{ id: "v1", label: "المجلد 1" }, { id: "v2", label: "المجلد 2" }] };
const bookScope: ScopeInfo = { kind: "book", id: "mughni-4", title: "المغني", detail: "ابن قدامة", volumes: [{ id: "mughni-4", label: "الجزء 4" }] };

const article = (o: Partial<ScopedHit> = {}): ScopedHit => ({
  id: "competition__a12", kind: "article", volumeId: "competition", volumeLabel: null, place: "المادة 12",
  locked: false, snippet: "", meta: { number: "12", numberText: null, status: "active" },
  body: { title: null, text: "يجوز **فسخ** العقد <عند> الإخلال", regulation: null }, ...o,
});

test("article: the law reader's citation, the text as written, html escaped", () => {
  const c = hitCopy(article(), lawScope)!;
  assert.match(c.plain, /^المادة \(12\) من نظام \(نظام المنافسات\) ونصه:\n“يجوز فسخ العقد <عند> الإخلال”$/);
  assert.match(c.html, /&lt;عند&gt;/);
  assert.doesNotMatch(c.html, /<عند>/);
  const withReg = hitCopy(article({ body: { title: null, text: "نص", regulation: "نص اللائحة" } }), lawScope)!;
  assert.match(withReg.plain, /نص اللائحة التنفيذية تحت المادة:\n“نص اللائحة”$/);
  const repealed = hitCopy(article({ meta: { number: "3", numberText: null, status: "repealed" } }), lawScope)!;
  assert.match(repealed.plain, /الملغاة/);
});

test("article: the cart entry the law reader would add (same id, label, law)", () => {
  const e = hitCartEntry(article(), lawScope)!;
  assert.deepEqual(
    { id: e.articleId, num: e.articleNum, law: e.lawName, slug: e.lawSlug, added: e.isArticleAdded, reg: e.isExecRegAdded },
    { id: "competition__a12", num: "المادة 12", law: "نظام المنافسات", slug: "competition", added: true, reg: false },
  );
});

const principle = (o: Partial<ScopedHit> = {}): ScopedHit => ({
  id: "v2__p118", kind: "principle", volumeId: "v2", volumeLabel: "المجلد 2", place: "المجلد 2 — مبدأ رقم 118",
  locked: false, snippet: "", meta: { principleNumber: "118", issuingBody: "المحكمة الإدارية العليا", sessionDate: "1444/4/9", decisionNumber: "55", yearHijri: null },
  body: { reference: null, text: "**يتعين** الإعفاء من غرامة التأخير", rulingBasis: null, facts: "وقائع", reasons: "أسباب", ruling: "منطوق" }, ...o,
});

test("principle: the reader's reference line, built when the source has none", () => {
  assert.equal(
    principleReference(principle(), colScope),
    "مبدأ رقم (118)، صادر عن (المحكمة الإدارية العليا) ذي الرقم (55) بتاريخ 1444/4/9 - المنشور في (مجموعة الأحكام القضائية لعام 1434هـ)، المجلد 2",
  );
  const own = principle({ body: { reference: null, text: "النص\n**المرجع:** حكم رقم 9", rulingBasis: null, facts: null, reasons: null, ruling: null } });
  assert.equal(principleReference(own, colScope), "المرجع: حكم رقم 9");
  const c = hitCopy(principle(), colScope)!;
  assert.match(c.plain, /^يتعين الإعفاء من غرامة التأخير\n\nالمرجع: مبدأ رقم \(118\)/);
  const e = hitCartEntry(principle(), colScope)!;
  assert.equal(e.articleNum, "مبدأ رقم 118");
  assert.equal(e.lawName, "المحكمة الإدارية العليا");
  assert.equal(e.lawSlug, "v2");
});

const block = (o: Partial<ScopedHit> = {}): ScopedHit => ({
  id: "mughni-4__blk-9", kind: "block", volumeId: "mughni-4", volumeLabel: "الجزء 4", place: "الجزء 4 — المجلد 4 — الصفحة 218",
  locked: false, snippet: "", meta: { topic: "خيار الغبن", chapter: "كتاب البيوع", section: null, vol: 4, page: 218, volLabel: null, pageLabel: null },
  body: { matn: "من غبن", sharh: "يثبت الخيار", hashiyah: ["حاشية"] }, ...o,
});

test("block: the book reader's prefix, layers and «المرجعية»", () => {
  const c = hitCopy(block(), bookScope)!;
  assert.equal(
    c.plain,
    "الموضع من كتاب (المغني — الجزء 4 - ج 4، ص 218):\n“المتن:\nمن غبن\n\nالشرح:\nيثبت الخيار\n\nالحواشي:\n1- حاشية”\n\nالمرجعية: ابن قدامة، المغني — الجزء 4، ج 4، ص 218",
  );
  const e = hitCartEntry(block(), bookScope)!;
  assert.equal(e.lawSlug, "mughni-4__blk-9", "one cart key per block");
  assert.equal(e.articleNum, "ج 4، ص 218");
  assert.equal(e.lawName, "المغني — الجزء 4");
  assert.equal(e.articleTitle, "خيار الغبن");
});

test("a locked hit can be neither copied nor added", () => {
  for (const h of [article({ locked: true, body: null }), principle({ locked: true, body: null }), block({ locked: true, body: null })]) {
    assert.equal(hitCopy(h, lawScope), null);
    assert.equal(hitCartEntry(h, lawScope), null);
  }
});

test("the cart's server key stays within 60 characters", () => {
  const e = hitCartEntry(article({ place: "ب".repeat(80) }), lawScope)!;
  assert.equal(e.articleNum.length, 60);
});

test("highlightSegments: every occurrence, longest first, prefix star dropped, regex-safe", async () => {
  const { highlightSegments } = await import("./scopedHitActions.ts");
  assert.deepEqual(highlightSegments("فسخ العقد ثم فسخ", ["فسخ"]), [
    { text: "فسخ", hit: true }, { text: " العقد ثم ", hit: false }, { text: "فسخ", hit: true },
  ]);
  assert.deepEqual(highlightSegments("غرامة التأخير", ["غرامة", "غرامة التأخير"]), [{ text: "غرامة التأخير", hit: true }]);
  assert.deepEqual(highlightSegments("تعويضات", ["تعويض*"]), [{ text: "تعويض", hit: true }, { text: "ات", hit: false }]);
  assert.deepEqual(highlightSegments("a (b) c", ["(b)"]), [{ text: "a ", hit: false }, { text: "(b)", hit: true }, { text: " c", hit: false }]);
  assert.deepEqual(highlightSegments("نص", ["ن"]), [{ text: "نص", hit: false }]);
  assert.deepEqual(highlightSegments("", ["فسخ"]), []);
});

test("the panel names what it searches, apart from the reader's own filter / jump boxes", () => {
  assert.equal(scopedPanelTitle("law:competition", 1), "بحث في نص النظام كاملاً");
  assert.equal(scopedPanelTitle("collection:v2", 30), "بحث في كل المجلدات");
  assert.equal(scopedPanelTitle("collection:v2", 1), "بحث في كل مبادئ المجموعة");
  assert.equal(scopedPanelTitle("book:mughni-4", 12), "بحث في كل المجلدات");
  assert.equal(scopedPanelTitle("book:mughni-4", 1), "بحث في نص الكتاب كاملاً");
  assert.equal(scopedPanelTitle("unknown", 1), "بحث في نص المستند كاملاً");
});
