import assert from "node:assert/strict";
import test from "node:test";

import { markdownToPlain } from "./markdownToPlain.ts";

const DECREE_PREAMBLE = [
  "# مرسوم ملكي رقم (م/91) وتاريخ 1428/11/03هـ",
  "",
  "<details open>",
  "<summary>📝 موجز القرار (خلاصة سريعة)</summary>",
  "",
  "> الموضوع: نظام خدمة الأفراد (14)",
  "> القرار المتخذ: تعديل المادة (6) من نظام خدمة الأفراد.",
  "",
  "</details>",
  "",
  "### 📊 بطاقة تعريف المرسوم/القرار",
  "",
  "| الحقل | القيمة |",
  "| :--- | :--- |",
  "| **نوع الوثيقة** | مرسوم ملكي |",
  "| **الجهة المصدرة** | الديوان الملكي |",
  "| **المصدر الرسمي** | [بوابة دار الوثائق الوطنية (ncar)](https://ncar.gov.sa) |",
  "",
  "***",
  "",
  "<details>",
  "<summary>📜 ديباجة الأمر السامي</summary>",
  "",
  "**بعون الله تعالى**",
  "</details>",
].join("\n");

test("markdownToPlain turns a decree preamble into clean text and keeps every fact", () => {
  const out = markdownToPlain(DECREE_PREAMBLE);
  for (const gone of ["<details", "</details>", "<summary", "|", "**", "###", "***", "📝", "📊", "https://", ":---"]) {
    assert.ok(!out.includes(gone), `no «${gone}» left`);
  }
  assert.match(out, /^مرسوم ملكي رقم \(م\/91\) وتاريخ 1428\/11\/03هـ/);
  assert.match(out, /نوع الوثيقة: مرسوم ملكي/);
  assert.match(out, /الجهة المصدرة: الديوان الملكي/);
  assert.match(out, /المصدر الرسمي: بوابة دار الوثائق الوطنية \(ncar\)/);
  assert.match(out, /القرار المتخذ: تعديل المادة \(6\) من نظام خدمة الأفراد\./, "without the flag the موجز text stays");
  assert.match(out, /بعون الله تعالى/, "other blocks keep their text");
  assert.doesNotMatch(out, /الحقل: القيمة|ديباجة الأمر السامي/, "the table header and block labels go");
  assert.doesNotMatch(out, /\n{3,}/);
});

test("dropSummaryBlocks removes only the «موجز» block, which the node already has as its summary", () => {
  const out = markdownToPlain(DECREE_PREAMBLE, { dropSummaryBlocks: true });
  assert.doesNotMatch(out, /القرار المتخذ/);
  assert.match(out, /بعون الله تعالى/);
  assert.match(out, /نوع الوثيقة: مرسوم ملكي/);
});

test("markdownToPlain keeps article content: headings, numbered items and wide tables", () => {
  const out = markdownToPlain(
    "#### [صفحة 1]\n### مادة (5):\nيجب على المقيم:\n\n| م | المهمة | المدة |\n| :--- | :--- | :--- |\n| ١ | دراسة الأصول | يوم عمل |\n\n### ### القسم 2\n- أولاً: (*) حاشية",
  );
  assert.equal(out, "مادة (5):\nيجب على المقيم:\n\nم — المهمة — المدة\n١ — دراسة الأصول — يوم عمل\n\nالقسم 2\nأولاً: (*) حاشية");
});

test("markdownToPlain leaves plain text alone and handles empty input", () => {
  const plain = "المادة الأولى\nيعمل بهذا النظام من تاريخ نشره، والمادة 5 < المادة 6 في الترتيب.";
  assert.equal(markdownToPlain(plain), plain);
  assert.equal(markdownToPlain(""), "");
  assert.equal(markdownToPlain(null), "");
  assert.equal(markdownToPlain("   "), "");
});
