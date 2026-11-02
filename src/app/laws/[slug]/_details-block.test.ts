import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanDetailsSummary,
  isAmendmentDetails,
  splitDetailsMarkup,
} from "./_details-block.ts";

test("BUG-LIB-05: a schedule, an info card or a موجز is not amendment history", () => {
  assert.equal(isAmendmentDetails("📊 الجدول الأول: المواد المخدرة", "| المادة | الوصف |"), false);
  assert.equal(isAmendmentDetails("🗂️ البطاقة التعريفية للنظام وبيانات التشريع", "**أداة الإصدار:** م/1"), false);
  assert.equal(isAmendmentDetails("📝 موجز المستند (خلاصة سريعة)", "يهدف النظام إلى تنظيم المهنة."), false);
  assert.equal(isAmendmentDetails(null, "نص عادي لا يذكر أي تاريخ"), false);
  assert.equal(isAmendmentDetails("📜 حاشية المادة", "انظر المادة الخامسة."), false);
  // «تعديل» as an ordinary verb in a live annex is not history
  assert.equal(isAmendmentDetails("📝 ضوابط تفصيلية", "يجوز للهيئة تعديل هذه الضوابط."), false);
});

test("BUG-LIB-05: a previous version is amendment history, by summary or by body", () => {
  assert.equal(isAmendmentDetails("📜 الإصدارات السابقة", ""), true);
  assert.equal(isAmendmentDetails("📜 النص قبل التعديل وتفاصيل قرار/مرسوم التعديل", ""), true);
  assert.equal(isAmendmentDetails("النص قبل الإلغاء", ""), true);
  assert.equal(isAmendmentDetails("📜 التعديلات والإلغاءات", ""), true);
  // diacritics and hamza forms do not hide it
  assert.equal(isAmendmentDetails("النصّ قبل التّعديل", ""), true);
  // the summary says nothing; the body does
  assert.equal(isAmendmentDetails("📜 حاشية المادة", "عُدّلت هذه المادة بموجب المرسوم الملكي رقم (م/2)."), true);
  assert.equal(isAmendmentDetails(null, "**النص قبل التعديل:**\nيمارس المدير العام…"), true);
  assert.equal(isAmendmentDetails(undefined, "> أُلغيت بموجب القرار رقم 5"), true);
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

test("splitDetailsMarkup: a one-line <details open><summary> keeps its summary", () => {
  assert.deepEqual(
    splitDetailsMarkup("<details open><summary>📝 موجز المستند (خلاصة سريعة)</summary>\nنص\n</details>"),
    ["<details>", "<summary>📝 موجز المستند (خلاصة سريعة)</summary>", "نص", "</details>"],
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
