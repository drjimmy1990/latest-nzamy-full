import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanDetailsSummary,
  isAmendmentDetails,
  isOpenDetailsTag,
  splitDetailsMarkup,
} from "./_details-block.ts";

/** The `<details>` blocks of a text, as the reader's parser sees them. */
function blocksOf(text: string): Array<{ summary: string; content: string }> {
  const out: Array<{ summary: string; content: string }> = [];
  let cur: { summary: string; lines: string[] } | null = null;
  for (const line of splitDetailsMarkup(text)) {
    const t = line.trim();
    if (t === "<details>" || isOpenDetailsTag(t)) { cur = { summary: "", lines: [] }; continue; }
    if (!cur) continue;
    if (t === "</details>") { out.push({ summary: cur.summary, content: cur.lines.join("\n") }); cur = null; continue; }
    const m = /^<summary>(.*)<\/summary>$/.exec(t);
    if (m) cur.summary = cleanDetailsSummary(m[1]);
    else cur.lines.push(line);
  }
  return out;
}

test("BUG-LIB-05: a never-amended law shows no «سابق» — its موجز, info card and «المزيد» fold neutrally", () => {
  const preamble = [
    "# نظام المهن الصحية",
    "<details open><summary>📝 موجز المستند (خلاصة سريعة)</summary>",
    "يهدف النظام إلى تنظيم المهن الصحية. عُدّل مسمى الهيئة لاحقاً بقرار مجلس الوزراء.",
    "</details>",
    "<details><summary>📊 بطاقة تعريف النظام</summary>",
    "| الحقل | القيمة |",
    "| :--- | :--- |",
    "| **الحالة** | ساري، وكان النص قبل التعديل كذا |",
    "</details>",
    "<details><summary>➕ المزيد من بيانات النظام</summary>",
    "| أ | ب |",
    "</details>",
    "<details><summary>🗂️ البطاقة التعريفية للنظام وبيانات التشريع</summary>",
    "**أداة الإصدار:** م/1",
    "</details>",
  ].join("\n");
  const blocks = blocksOf(preamble);
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks.filter((b) => isAmendmentDetails(b.summary, b.content)), []);
  // an article with no <details> has no toggle at all
  assert.equal(splitDetailsMarkup("**المادة الأولى:** يسمى هذا النظام…\n1. البند الأول").some((l) => l.trim() === "<details>"), false);
});

test("M1: the موجز and the info cards are neutral even when their prose mentions an amendment", () => {
  assert.equal(isAmendmentDetails("📝 موجز المستند (خلاصة سريعة)", "عُدّلت المادة الخامسة عام 1440هـ."), false);
  assert.equal(isAmendmentDetails("📊 بطاقة تعريف النظام", "**النص قبل التعديل:** —"), false);
  assert.equal(isAmendmentDetails("🗂️ البطاقة التعريفية للنظام وبيانات التشريع", "> نقلت هذه المادة"), false);
  assert.equal(isAmendmentDetails("➕ المزيد", "**تعديل:** بموجب القرار 5"), false);
});

test("live annex / English text: neutral only when the parser knows them and the body holds no history", () => {
  // LIVE_ANNEX_SUMMARY_ALLOWLIST (article-history.ts), exact
  assert.equal(isAmendmentDetails("📊 الجدول الأول: المواد المخدرة", "| المادة | الوصف |"), false);
  assert.equal(isAmendmentDetails("📊 الجدول الأول: المواد المخدرة", "**النص قبل التعديل:**\n| المادة |"), true);
  // a bilingual courtesy translation: the summary AND a Latin body
  assert.equal(isAmendmentDetails("🇬🇧 English text — Article One: Definitions", "In this Law, the following terms shall mean…"), false);
  assert.equal(isAmendmentDetails("🇬🇧 English text — Article One", "نص عربي بالكامل لا ترجمة فيه"), true);
});

test("I1: the parser's own history wording is «سابق» (six review probes)", () => {
  // BEFORE_TEXT_LABELS: deleted-paragraph text
  assert.equal(isAmendmentDetails("📜 تعديل المادة", "**نص الفقرة (2) المحذوفة:**\nنص قديم"), true);
  // BEFORE_TEXT_LABELS: «النص الأصلي»
  assert.equal(isAmendmentDetails("📜 التعديلات", "**النص الأصلي للمادة (الصادر عام 1438هـ):**\nنص قديم"), true);
  // REFERENCE_LABELS as bold labels, no summary
  assert.equal(isAmendmentDetails("", "**الإلغاء:** بموجب المرسوم الملكي (م/5)\n**نص الفقرات الفرعية المحذوفة:**\nنص"), true);
  // a summary naming the amending decree (adversarial Oracle 3.1), neutral body
  assert.equal(isAmendmentDetails("نص التعديل بموجب المرسوم م/5", "نص المادة كاملاً"), true);
  // «حاشية» (HISTORIC_SUMMARY_RE) with a «نقلت» notice (REFERENCE_NOTICE_VERBS)
  assert.equal(isAmendmentDetails("📜 حاشية المادة", "> نقلت هذه المادة من النظام السابق"), true);
  assert.equal(isAmendmentDetails("📜 حواشي المادة", "**تعديل:** بموجب القرار 5"), true);
});

test("I1: anything not known current defaults to «سابق», as in the parser", () => {
  assert.equal(isAmendmentDetails("📜 الإصدارات السابقة", ""), true);
  assert.equal(isAmendmentDetails("📜 التعديلات والإلغاءات", ""), true);
  assert.equal(isAmendmentDetails("النصّ قبل التّعديل", ""), true);
  assert.equal(isAmendmentDetails(null, "نص بلا ملخص"), true);
  assert.equal(isAmendmentDetails("📋 ملاحظات", "انظر المادة الخامسة."), true);
  assert.equal(isAmendmentDetails(undefined, "> أُلغيت بموجب القرار رقم 5"), true);
  // a hand-verified annex title that merely contains a history-ish word is still decided by the allowlist
  assert.equal(isAmendmentDetails("📝 إجراءات التجديد والتحديث والتقييم الدوري من دليل المتطلبات (2-9 و 2-10 من الدليل)", "خطوات التجديد"), false);
});

test("cleanDetailsSummary: plain text, no markup left", () => {
  assert.equal(cleanDetailsSummary("**📊 الجدول الأول**"), "📊 الجدول الأول");
  assert.equal(cleanDetailsSummary("<b>بطاقة</b>&nbsp;تعريف <!-- note -->"), "بطاقة تعريف");
  assert.equal(cleanDetailsSummary("`[ملغاة]` \\- ملحق"), "[ملغاة] - ملحق");
  assert.equal(cleanDetailsSummary("### عنوان\n  ثانٍ"), "عنوان ثانٍ");
  assert.equal(cleanDetailsSummary("&lt;script&gt;"), "<script>"); // text node: shown, never run
  assert.equal(cleanDetailsSummary(""), "");
  assert.equal(cleanDetailsSummary(null), "");
});

test("S5-B11: open survives normalisation; other attributes do not", () => {
  assert.deepEqual(splitDetailsMarkup('<details open><summary>📝 موجز المستند</summary>'), ["<details open>", "<summary>📝 موجز المستند</summary>"]);
  assert.deepEqual(splitDetailsMarkup('<details class="x" open>'), ["<details open>"]);
  assert.deepEqual(splitDetailsMarkup('<details open="">'), ["<details open>"]);
  assert.deepEqual(splitDetailsMarkup('<details class="x">'), ["<details>"]);
  // The word inside a value is not the attribute.
  assert.deepEqual(splitDetailsMarkup('<details class="is open now">'), ["<details>"]);
  assert.deepEqual(splitDetailsMarkup('<details data-open>'), ["<details>"]);
  assert.equal(isOpenDetailsTag("<details open>"), true);
  assert.equal(isOpenDetailsTag("<details>"), false);
});

test("splitDetailsMarkup: a one-line <details open><summary> keeps its summary", () => {
  assert.deepEqual(
    splitDetailsMarkup("<details open><summary>📝 موجز المستند (خلاصة سريعة)</summary>\nنص\n</details>"),
    ["<details open>", "<summary>📝 موجز المستند (خلاصة سريعة)</summary>", "نص", "</details>"],
  );
  // everything on one line, the close included
  assert.deepEqual(
    splitDetailsMarkup("قبل <details><summary>ملحق</summary>جدول</details> بعد"),
    ["قبل ", "<details>", "<summary>ملحق</summary>", "جدول", "</details>", " بعد"],
  );
});

test("splitDetailsMarkup: a multi-line summary is joined; comments and bare tags go", () => {
  assert.deepEqual(
    splitDetailsMarkup("<details>\n<summary>\n**بطاقة**\n تعريف\n</summary>\nنص\n</details>"),
    ["<details>", "<summary>**بطاقة** تعريف</summary>", "نص", "</details>"],
  );
  assert.deepEqual(splitDetailsMarkup("أ\n<!-- ملاحظة\nداخلية -->\n<div align=\"center\">\nب\n</div>\n\nج"), ["أ", "", "", "ب", "", "", "ج"]);
  // a line without details markup is untouched
  assert.deepEqual(splitDetailsMarkup("**المادة (1):** نص\n- بند"), ["**المادة (1):** نص", "- بند"]);
});
