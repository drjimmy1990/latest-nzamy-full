/**
 * N2.1 / N2.2 — the موجز and the identity card lifted out of a law's preamble.
 * Fixtures are shaped like the owner corpus (last_owner «أنظمة ولوائح»,
 * 2026-10-25). The summary_brief cases come from the Docker fixture itself
 * (supabase/tests/rls/prelude_law_summary_brief_fixture.sql), so the SQL
 * function and lawSummaryBrief() are held to the same expected text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAW_SUMMARY_BRIEF_MAX_CHARS, extractLawPreambleBlocks, isHollowPreamble, lawSummaryBrief } from "./lawPreambleBlocks.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_SQL = readFileSync(
  path.join(here, "../../../supabase/tests/rls/prelude_law_summary_brief_fixture.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

interface Fixture { slug: string; preamble: string; expected: string | null }

function sqlFixtures(): Fixture[] {
  const re = /\('([^']+)',\s*\$p(\d+)\$([\s\S]*?)\$p\2\$,\s*\$e\2\$([\s\S]*?)\$e\2\$\)/g;
  return [...FIXTURE_SQL.matchAll(re)].map((m) => ({
    slug: m[1],
    preamble: m[1].endsWith("-crlf") ? m[3].replace(/\n/g, "\r\n") : m[3],
    expected: m[4] === "" ? null : m[4],
  }));
}

const FIXTURES = sqlFixtures();
const byslug = (slug: string) => {
  const f = FIXTURES.find((x) => x.slug === slug);
  assert.ok(f, `fixture ${slug} missing from the SQL prelude`);
  return f;
};

test("the SQL fixture parses into its nine row-format cases", () => {
  assert.equal(FIXTURES.length, 9);
});

for (const f of FIXTURES) {
  test(`summary_brief twin: ${f.slug} gives the same text as the SQL fixture expects`, () => {
    assert.equal(lawSummaryBrief(f.preamble), f.expected);
  });
}

test("summary_brief is cut at the cap and ends in «…» (fixture sb-10)", () => {
  const long = `<details open>\n<summary>📝 موجز المستند (خلاصة سريعة)</summary>\n\n> ${"أ".repeat(2100)}\n\n</details>`;
  assert.equal(lawSummaryBrief(long), "أ".repeat(LAW_SUMMARY_BRIEF_MAX_CHARS) + "…");
  assert.match(FIXTURE_SQL, /repeat\('أ', 2100\)[\s\S]*repeat\('أ', 2000\) \|\| '…'/);
  assert.equal(LAW_SUMMARY_BRIEF_MAX_CHARS, 2000);
});

test("non-text input gives no brief and empty blocks", () => {
  assert.equal(lawSummaryBrief(null), null);
  assert.equal(lawSummaryBrief(42), null);
  assert.deepEqual(extractLawPreambleBlocks(undefined), { summary: "", summaryLabel: "", metadataCard: null, rest: "" });
});

test("موجز at the top + heading card: both lifted, the H1 stays, no orphan rules", () => {
  const out = extractLawPreambleBlocks(byslug("sb-01").preamble);
  assert.equal(out.summary, "**الموضوع والقرار المتخذ:** يهدف الدليل إلى مساعدة تجار المعادن الثمينة على الامتثال.");
  assert.equal(out.summaryLabel, "📝 موجز المستند (خلاصة سريعة)");
  assert.deepEqual(out.metadataCard, {
    main: [
      { key: "نوع الوثيقة", value: "دليل إرشادي" },
      { key: "الجهة المصدرة", value: "وزارة التجارة" },
    ],
    more: [],
  });
  assert.equal(out.rest, "# الدليل الإرشادي بشأن العناية الواجبة بالعميل");
});

test("card + ➕ first, موجز after, ديباجة later: each block ends at its own </details>", () => {
  const out = extractLawPreambleBlocks(byslug("sb-02").preamble);
  assert.match(out.summary, /^### 🎯 ملخص محتوى المستند/);
  assert.ok(!out.summary.includes("ديباجة"), "the موجز must not run into the ديباجة block");
  assert.deepEqual(out.metadataCard?.main.map((f) => f.key), ["نوع الوثيقة", "الجهة المصدرة"]);
  // «النسخة | 3.1» is the pipeline's schema version, not an edition.
  assert.deepEqual(out.metadataCard?.more, [{ key: "التصنيف", value: "القسم الصحي والدوائي" }]);
  assert.ok(out.rest.startsWith("## ديباجة النظام"), out.rest);
  assert.match(out.rest, /<summary>📜 ديباجة اللائحة<\/summary>[\s\S]*نص الديباجة\.[\s\S]*<\/details>$/);
  assert.ok(!/بطاقة تعريف|موجز/.test(out.rest));
});

test("V2 card: file order, links kept, placeholders absent, nothing invented", () => {
  const out = extractLawPreambleBlocks(byslug("sb-03").preamble);
  assert.equal(out.summary, "");
  assert.deepEqual(out.metadataCard, {
    main: [
      { key: "نوع التشريع", value: "لائحة تنفيذية" },
      { key: "حالة التشريع", value: "ساري" },
      { key: "أداة الإصدار", value: "قرار مجلس الوزراء رقم (468) وتاريخ 1447/07/10هـ" },
      { key: "تاريخ النشر", value: "1447/07/27هـ (جريدة أم القرى، العدد 5140)" },
      { key: "المصدر الرسمي", value: "[جريدة أم القرى](https://uqn.gov.sa/details?p=28791)" },
    ],
    more: [
      { key: "التصنيف", value: "القسم الاستثماري" },
      { key: "عدد المواد", value: "35" },
    ],
  });
  assert.ok(out.rest.startsWith("# اللائحة التنظيمية"), out.rest);
});

test("a card without a «حالة التشريع» row gets none — no default «ساري»", () => {
  const out = extractLawPreambleBlocks(byslug("sb-01").preamble);
  assert.ok(!out.metadataCard?.main.some((f) => f.key.includes("حالة")));
});

test("plain-prose موجز after the H1", () => {
  const out = extractLawPreambleBlocks(byslug("sb-04").preamble);
  assert.equal(out.summary, "دليل إجرائي صادر عن وزارة العدل لتطبيق إجراءات خدمة التقاضي الإلكتروني.\nيبيّن الدليل ضوابط تحديد المواعيد وتبليغها.");
  assert.equal(out.rest, "# الدليل الإجرائي لخدمة التقاضي الإلكتروني");
});

test("an unclosed or empty موجز is not read and stays in the preamble", () => {
  const unclosed = byslug("sb-05").preamble;
  assert.deepEqual(extractLawPreambleBlocks(unclosed), { summary: "", summaryLabel: "", metadataCard: null, rest: unclosed.trim() });
  const empty = byslug("sb-06").preamble;
  assert.equal(extractLawPreambleBlocks(empty).summary, "");
  assert.equal(extractLawPreambleBlocks(empty).rest, empty.trim());
});

test("CRLF rows read like LF rows", () => {
  const out = extractLawPreambleBlocks(byslug("sb-07-crlf").preamble);
  assert.ok(!out.summary.includes("\r"));
  assert.match(out.summary, /^\*\*وصف موجز \(تحرير المكتبة — وليس ترجمة رسمية\):\*\*/);
  assert.equal(out.summaryLabel, "📝 موجز الذكاء الاصطناعي");
});

test("a card wrapped in <details><summary>📊 …: read; the موجز after it too", () => {
  const out = extractLawPreambleBlocks(byslug("sb-08").preamble);
  assert.deepEqual(out.metadataCard, {
    main: [
      { key: "رقم المستند / المرجع", value: "قرار مجلس الخدمة المدنية رقم ١٤١" },
      { key: "تاريخ الإصدار", value: "٢٧-٠٥-١٣٩٩هـ" },
    ],
    more: [],
  });
  assert.equal(out.summary, "الأحكام الخاصة بالموظفين المعينين على بند الأجور.");
  assert.equal(out.rest, "");
});

test("a preamble with neither block is returned as it was", () => {
  const p = byslug("sb-09").preamble;
  assert.deepEqual(extractLawPreambleBlocks(p), { summary: "", summaryLabel: "", metadataCard: null, rest: p.trim() });
});

test("a bullet-list card (GACA forms) is not parsed and stays in the preamble", () => {
  const p = [
    "<details>",
    "<summary>📊 بطاقة تعريف النموذج وبيانات التشريع / Model Definition Card</summary>",
    "",
    "- **رمز النموذج (Model ID):** GACA-AVSES-AIR-F012",
    "- **الجهة المصدرة (Issuing Body):** الهيئة العامة للطيران المدني",
    "",
    "</details>",
    "",
    "## ديباجة النموذج",
  ].join("\n");
  const out = extractLawPreambleBlocks(p);
  assert.equal(out.metadataCard, null);
  assert.equal(out.rest, p);
});

test("values: a relative file link becomes text, a javascript: link too, <br> is a line, ** goes", () => {
  const p = [
    "### 📊 بطاقة تعريف نظام",
    "",
    "| الحقل | القيمة |",
    "| :--- | :--- |",
    "| **المصدر الرسمي** | [هيئة الخبراء](https://laws.boe.gov.sa/x) · [الملف](../../تم_استخراجه/ncar.gov.sa/a.pdf) |",
    "| **وثيقة** | [اضغط](javascript:alert(1)) |",
    "| **اللوائح المدمجة** | اللائحة التنفيذية<br>لائحة الاعتراض |",
    "| **الجهة المصدرة** | **مجلس الوزراء** |",
    "| **تاريخ المعالجة** | 2026-06-08 |",
    "| **الملف الأصلي** | x.md |",
    "| **النسخة** | الإصدار الثالث |",
    "| **عدد المواد** | — |",
  ].join("\n");
  const out = extractLawPreambleBlocks(p);
  assert.deepEqual(out.metadataCard?.main, [
    { key: "المصدر الرسمي", value: "[هيئة الخبراء](https://laws.boe.gov.sa/x) · الملف" },
    { key: "وثيقة", value: "اضغط" },
    { key: "اللوائح المدمجة", value: "اللائحة التنفيذية\nلائحة الاعتراض" },
    { key: "الجهة المصدرة", value: "مجلس الوزراء" },
    { key: "النسخة", value: "الإصدار الثالث" },
  ]);
  assert.equal(out.rest, "");
});

test("a heading with no table under it is not a card", () => {
  const p = "### 📊 بطاقة تعريف نظام\n\nنص بلا جدول.";
  const out = extractLawPreambleBlocks(p);
  assert.equal(out.metadataCard, null);
  assert.equal(out.rest, p);
});

test("isHollowPreamble: headings, rules, details wrappers and the placeholder only", () => {
  assert.equal(isHollowPreamble(extractLawPreambleBlocks(byslug("sb-01").preamble).rest), true);
  assert.equal(isHollowPreamble(extractLawPreambleBlocks(byslug("sb-04").preamble).rest), true);
  const emptyToggle = [
    "# نظام", "", "***", "", "## ديباجة النظام", "<details>", "<summary>📜 ديباجة</summary>", "",
    "لم تتوفر ديباجة في المصدر المستخدم.", "", "</details>",
  ];
  assert.equal(isHollowPreamble(emptyToggle.join("\n")), true);
  assert.equal(isHollowPreamble(emptyToggle.join("\r\n")), true);
  assert.equal(isHollowPreamble(extractLawPreambleBlocks(byslug("sb-03").preamble).rest), false, "the decree text keeps it");
  assert.equal(isHollowPreamble("# نظام\n\nإن مجلس الوزراء…"), false);
  assert.equal(isHollowPreamble("| أ | ب |"), false);
  assert.equal(isHollowPreamble(""), true);
});

test("isHollowPreamble: a file whose preamble is ONE line under `#` (collapsed newlines) keeps it", () => {
  // Shape of «نظام البريد» and ~100 logistics / GACAR files in last_owner
  // 2026-10-25: title, rule, ديباجة heading, <details> and the decree text all
  // on the H1 line. Dropping it lost the royal decree for subscribers.
  const collapsed = "# نظام البريد --- ## ديباجة النظام <details> <summary>📜 ديباجة نظام البريد</summary> بسم الله الرحمن الرحيم مرسوم ملكي رقم (م/22) وتاريخ 1443/3/8هـ </details>";
  assert.equal(isHollowPreamble(collapsed), false);
  assert.equal(isHollowPreamble("# تنظيم الفحص الفني 1431ه > 🚫 **[ملغى — استُبدل بالكامل بتنظيم (الصادر بتاريخ 17/3/1447هـ)]**"), false, "an inline repeal notice is prose");
  assert.equal(isHollowPreamble("### الصفحة 1 اللائحة التنفيذية لنشاط الوساطة في نقل الركاب بالسيارات عبر التطبيقات الإلكترونية رقم قرار مجلس الإدارة (1/2/3) وتاريخ 1445/01/01هـ وقد قرر المجلس ما يلي من الأحكام: أولاً الموافقة على اللائحة بالصيغة المرافقة، ثانياً يعمل بها من تاريخ نشرها في الجريدة الرسمية"), false, "a long heading line is collapsed text");
  assert.equal(isHollowPreamble("# GACAR PART 39 – AIRWORTHINESS DIRECTIVES # الجزء 39 *** ## صفحات القواعد"), false, "two headings on one line");
  // A title with a trailing rule is still only a title.
  assert.equal(isHollowPreamble("# الجزء 1 - التعريفات والاختصارات (GACAR Part 1) ***"), true);
  assert.equal(isHollowPreamble("# الصيغه النموذجية لوثيقة التأمين الصحي الالزامي للعمالة المنزلية و من في حكمهم الذين يزيد عددهـم على (4)"), true);
});

test("isHollowPreamble: the «لم تتوفر ديباجة» placeholder only when it says nothing else", () => {
  assert.equal(isHollowPreamble("## ديباجة\n\nلم تتوفر ديباجة في المصدر المستخدم."), true);
  assert.equal(isHollowPreamble("## ديباجة\n\nلم تتوفر ديباجة تفصيلية خارج المقدمة والتمهيد."), true);
  assert.equal(
    isHollowPreamble("## ديباجة\n\nلم تتوفر ديباجة تفصيلية في المصدر المستخدم، وصدرت اللائحة بقرار من مجلس إدارة الهيئة السعودية للمحامين."),
    false,
    "the issuing decision after the comma is text",
  );
});

test("owner ٢٦٠: a card whose table sits under a sub-heading is lifted (23 files in last_owner)", () => {
  const p = [
    "### 📊 بطاقة تعريف نظام وبيانات التشريع",
    "",
    "### ⚖️ معلومات التشريع الأساسية",
    "| الحقل | القيمة |",
    "| :--- | :--- |",
    "| **نوع التشريع** | نظام |",
    "| **حالة التشريع** | ساري |",
    "",
    "<details>",
    "<summary>➕ المزيد من بيانات التشريع</summary>",
    "",
    "| الحقل | القيمة |",
    "| :--- | :--- |",
    "| **التصنيف** | دستوري |",
    "",
    "</details>",
    "",
    "## ديباجة النظام",
    "",
    "بعون الله تعالى",
  ].join("\n");
  const out = extractLawPreambleBlocks(p);
  assert.deepEqual(out.metadataCard, {
    main: [{ key: "نوع التشريع", value: "نظام" }, { key: "حالة التشريع", value: "ساري" }],
    more: [{ key: "التصنيف", value: "دستوري" }],
  });
  assert.equal(out.rest, "## ديباجة النظام\n\nبعون الله تعالى");
});

test("owner ٢٦٠: a second card is lifted too; its rows join «المزيد», none repeated", () => {
  const p = [
    "### 📊 بطاقة تعريف لائحة تنفيذية",
    "",
    "| الحقل | القيمة |",
    "| :--- | :--- |",
    "| **نوع التشريع** | لائحة تنفيذية |",
    "",
    "## ديباجة اللائحة",
    "",
    "نص الديباجة.",
    "",
    "<details>",
    "<summary>📊 بطاقة تعريف القرار وبيانات التعديلات</summary>",
    "",
    "| الحقل | القيمة |",
    "| :--- | :--- |",
    "| **نوع التشريع** | لائحة تنفيذية |",
    "| **أداة آخر تعديل** | قرار رقم (5) |",
    "",
    "</details>",
  ].join("\n");
  const out = extractLawPreambleBlocks(p);
  assert.deepEqual(out.metadataCard, {
    main: [{ key: "نوع التشريع", value: "لائحة تنفيذية" }],
    more: [{ key: "أداة آخر تعديل", value: "قرار رقم (5)" }],
  });
  assert.equal(out.rest, "## ديباجة اللائحة\n\nنص الديباجة.");
});

test("a second 📊 heading is never read as the first card's sub-heading", () => {
  const p = "### 📊 بطاقة تعريف نظام\n\n### 📊 بطاقة تعريف أخرى\n\n| الحقل | القيمة |\n| :--- | :--- |\n| **نوع التشريع** | نظام |";
  const out = extractLawPreambleBlocks(p);
  // The first heading has no table of its own; the second is the card.
  assert.deepEqual(out.metadataCard?.main, [{ key: "نوع التشريع", value: "نظام" }]);
  assert.equal(out.rest, "### 📊 بطاقة تعريف نظام");
});
