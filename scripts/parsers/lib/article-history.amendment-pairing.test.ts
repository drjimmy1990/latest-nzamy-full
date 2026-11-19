/**
 * Owner file 18, item 3 (our reply «خامساً» 1): one amendment = one card.
 * Each AMENDMENT anchor is paired with the text after it, up to the next
 * anchor or the end of its <details>; a before-text with no anchor (the older
 * files) stays a card of its own. Small synthetic fixtures only.
 *
 *   node --import tsx --test scripts/parsers/lib/article-history.amendment-pairing.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { extractArticleHistory } from "./article-history.ts";

const anchor = (o: Record<string, unknown>) => `<!-- AMENDMENT ${JSON.stringify(o)} -->`;

test("the reply's format: two anchors → two cards, each with its date, decree and text", () => {
  const body = [
    "1. نص الفقرة الأولى الحالي.",
    "",
    "<details>",
    "<summary>📜 الإصدارات السابقة</summary>",
    "",
    anchor({ type: "تعديل", decree: "المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09هـ", date: "1443/11/09", decree_id: null, paragraphs: "5", text_status: "available" }),
    "**🔄 تعديل:** عُدّلت الفقرة (5) بموجب المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09هـ.",
    "**ونص الفقرة (5) قبل هذا التعديل:**",
    "نص الفقرة الخامسة كما كان قبل م/113.",
    "",
    anchor({ type: "تعديل", decree: "المرسوم الملكي رقم (م/6) وتاريخ 1440/01/02هـ", date: "1440/01/02", decree_id: "LAW-00-0001", paragraphs: "5، 7", text_status: "available" }),
    "**🔄 تعديل:** عُدّلت الفقرتان (5) و(7) بموجب المرسوم الملكي رقم (م/6).",
    "**ونص الفقرة (5) الأصلي قبل التعديل:**",
    "النص الأصلي للفقرة الخامسة.",
    "**ونص الفقرة (7) الأصلي قبل التعديل:**",
    "النص الأصلي للفقرة السابعة.",
    "</details>",
  ].join("\n");

  const { records, entries, unparsed } = extractArticleHistory(body, "amended");
  assert.equal(records.length, 2, "one card per anchor — not 5 (2 anchors + 3 labels)");
  assert.deepEqual(unparsed, []);

  const [first, second] = records;
  assert.equal(first.anchor?.decree, "المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09هـ");
  assert.equal(first.anchor?.paragraphs, "5");
  assert.deepEqual(first.texts.map((t) => t.original_text), ["نص الفقرة الخامسة كما كان قبل م/113."]);
  assert.deepEqual(first.notes, ["عُدّلت الفقرة (5) بموجب المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09هـ."]);

  assert.equal(second.anchor?.decree_id, "LAW-00-0001");
  assert.deepEqual(second.texts.map((t) => t.original_text), ["النص الأصلي للفقرة الخامسة.", "النص الأصلي للفقرة السابعة."]);
  assert.equal(second.notes.length, 1);
  assert.ok(!second.notes.join(" ").includes("الإصدارات السابقة"), "the <summary> heading is never a card's description");

  assert.equal(entries.length, 3, "every before-text is still recovered (articles.original_text)");
  assert.ok(first.offset < second.offset);
});

test("today's corpus shape (نظام القضاء «سابعاً»): quoted `> >` lines pair the same way, no `>` left in the text", () => {
  const body = [
    "> 5. **النص الحالي للفقرة.**",
    ">",
    "> <details>",
    ">",
    "> <summary>📜 الإصدارات السابقة</summary>",
    ">",
    "> " + anchor({ type: "تعديل", decree: "المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09ه", date: "1443/11/09ه", source: "BOE_POPUP" }),
    ">",
    "> > **🔄 تعديل:** عدلت الفقرة (5) بموجب المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09ه لتصبح بالنص الظاهر أعلاه.",
    ">",
    "> > **ونص الفقرة (5) قبل هذا التعديل (كما عدلت بالمرسوم م/6):**",
    ">",
    '> > "استمرار الهيئات الابتدائية في النظر في الدعاوى العمالية."',
    ">",
    "> " + anchor({ type: "تعديل", decree: "المرسوم الملكي رقم (م/6) وتاريخ 1440/01/02ه", date: "1440/01/02ه", source: "NCAR" }),
    ">",
    "> > **🔄 تعديل:** عدلت الفقرة (5) وحذفت عبارة من الفقرة (7) بموجب المرسوم الملكي رقم (م/6).",
    ">",
    "> > **ونص الفقرة (5) الأصلي قبل التعديل:**",
    ">",
    '> > "النص الأصلي للفقرة الخامسة."',
    ">",
    "> > **ونص الفقرة (7) الأصلي قبل التعديل وحذف العبارة منها:**",
    ">",
    '> > "النص الأصلي للفقرة السابعة."',
    ">",
    "> </details>",
  ].join("\n");

  const { records } = extractArticleHistory(body, "amended");
  assert.equal(records.length, 2);
  assert.equal(records[0].anchor?.date, "1443/11/09ه");
  assert.deepEqual(records[0].texts.map((t) => t.original_text), ['"استمرار الهيئات الابتدائية في النظر في الدعاوى العمالية."']);
  assert.equal(records[1].texts.length, 2);
  for (const r of records) {
    for (const t of r.texts) assert.ok(!/^\s*>/m.test(t.original_text), `no quote marker left: ${t.original_text}`);
    assert.equal(r.notes.length, 1);
  }
});

test("an older block with no anchor: one card per before-text, no date, the <summary> not used as description", () => {
  const body = [
    "النص الحالي.",
    "<details>",
    "<summary>📜 الإصدارات السابقة</summary>",
    "",
    "📝 **عُدّلت هذه المادة بموجب:** المرسوم الملكي رقم (م/95) وتاريخ 1446/05/01هـ",
    "",
    "**النص قبل التعديل:**",
    "> النص القديم للمادة.",
    "</details>",
  ].join("\n");
  const { records } = extractArticleHistory(body, "amended");
  assert.equal(records.length, 1);
  assert.equal(records[0].anchor, null);
  assert.deepEqual(records[0].texts.map((t) => t.original_text), ["النص القديم للمادة."]);
  assert.deepEqual(records[0].notes, ["عُدّلت هذه المادة بموجب: المرسوم الملكي رقم (م/95) وتاريخ 1446/05/01هـ"]);
});

test("text before the first anchor stays an older card; the anchor takes only what follows it", () => {
  const body = [
    "<details>",
    "<summary>📜 الإصدارات السابقة</summary>",
    "  📝 **عُدّلت هذه المادة بموجب:** المرسوم الملكي رقم (م/95)",
    "  **النص قبل التعديل:**",
    "  > النص قبل م/95.",
    "",
    "  " + anchor({ type: "تعديل", source: "BOE_POPUP", decree: "" }),
    "  > **⚖️ تعديل:** عُدلت الفقرة ج بموجب المرسوم الملكي رقم (م81).",
    "  > **ونصها قبل التعديل:**",
    "  > النص قبل م81.",
    "</details>",
  ].join("\n");
  const { records } = extractArticleHistory(body, "amended");
  assert.equal(records.length, 2, "was 3 (one anchor card with no text + two text cards)");
  assert.equal(records[0].anchor, null);
  assert.deepEqual(records[0].texts.map((t) => t.original_text), ["النص قبل م/95."]);
  assert.equal(records[1].anchor?.decree, "");
  assert.deepEqual(records[1].texts.map((t) => t.original_text), ["النص قبل م81."]);
  assert.deepEqual(records[1].notes, ["عُدلت الفقرة ج بموجب المرسوم الملكي رقم (م81)."]);
});

test("an anchor outside any <details> is still a card of its own, with no text", () => {
  const body = ["النص الحالي.", anchor({ type: "إلغاء", decree: "م/1", date: "1440/01/01" })].join("\n");
  const { records } = extractArticleHistory(body, "repealed");
  assert.equal(records.length, 1);
  assert.equal(records[0].anchor?.type, "إلغاء");
  assert.deepEqual(records[0].texts, []);
});

test("text_status unavailable: the anchor's card has its description and no text — the description is never taken as text", () => {
  const body = [
    "<details>",
    "<summary>📜 الإصدارات السابقة</summary>",
    anchor({ type: "تعديل", decree: "م/113", date: "1443/11/09", text_status: "unavailable" }),
    "**🔄 تعديل:** عُدّلت الفقرة (5) بموجب م/113.",
    "</details>",
  ].join("\n");
  const { records, entries, unparsed } = extractArticleHistory(body, "amended");
  assert.equal(records.length, 1);
  assert.equal(records[0].anchor?.text_status, "unavailable");
  assert.deepEqual(records[0].texts, []);
  assert.deepEqual(records[0].notes, ["عُدّلت الفقرة (5) بموجب م/113."]);
  assert.deepEqual(entries, []);
  assert.deepEqual(unparsed, []);
});

test("an anchor whose JSON does not parse still bounds its card (flagged), so its text never joins the previous one", () => {
  const body = [
    "<details>",
    "<summary>📜 الإصدارات السابقة</summary>",
    anchor({ type: "تعديل", decree: "م/1" }),
    "**النص قبل التعديل:**",
    "النص الأول.",
    '<!-- AMENDMENT {"type": "تعديل", "decree": "م/2" -->',
    "**النص قبل التعديل:**",
    "النص الثاني.",
    "</details>",
  ].join("\n");
  const { records } = extractArticleHistory(body, "amended");
  assert.equal(records.length, 2);
  assert.deepEqual(records[0].texts.map((t) => t.original_text), ["النص الأول."]);
  assert.equal(records[1].anchor, null);
  assert.equal(records[1].anchorUnreadable, true);
  assert.deepEqual(records[1].texts.map((t) => t.original_text), ["النص الثاني."]);
});

test("an unknown bold label right under an anchor keeps its text in that card (it used to ride in the previous slice)", () => {
  const body = [
    "<details>",
    "<summary>📜 الإصدارات السابقة</summary>",
    "📄 **النص قبل الإلغاء (آخر نص ساري):**",
    "> آخر نص ساري.",
    "📝 **وكانت هذه المادة قد عُدّلت قبل الإلغاء بموجب:**",
    "- قرار مجلس الوزراء رقم (291)",
    anchor({ decree: "قرار مجلس الوزراء رقم (291)", date: "1441/04/27هـ", type: "تعديل النظام" }),
    "**نصها وفق قرار مجلس الوزراء رقم (291):**",
    "> النص النافذ بعد 291.",
    "**النص الأصلي (1406هـ):**",
    "> النص الأصلي.",
    "</details>",
  ].join("\n");
  const { records } = extractArticleHistory(body, "repealed");
  assert.equal(records.length, 2);
  assert.equal(records[0].anchor, null);
  assert.ok(records[0].texts[0].original_text.startsWith("آخر نص ساري."));
  assert.deepEqual(records[1].texts.map((t) => t.original_text), ["النص النافذ بعد 291.", "النص الأصلي."]);
  assert.equal(records[1].texts[0].label, "نصها وفق قرار مجلس الوزراء رقم (291)");
});
