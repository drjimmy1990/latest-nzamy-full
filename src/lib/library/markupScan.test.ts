import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyCounts, markupScore, scanMarkup, scanSummary, scanTsv, worstRows } from "./markupScan.ts";

const LIB07 = [
  "# مرسوم ملكي رقم م/115 وتاريخ 1439/12/05هـ",
  "<details open>",
  "<summary>📝 موجز القرار</summary>",
  "> الموضوع: تعديل نظام المرور",
  "</details>",
  "### 📊 بطاقة تعريف المرسوم/القرار",
  "| الحقل | القيمة |",
  "| :--- | :--- |",
  "| **نوع الوثيقة** | مرسوم ملكي |",
  "| **الجهة المصدرة** | الديوان الملكي |",
].join("\n");

test("L9-e: the lib07 preamble is counted tag by tag", () => {
  const c = scanMarkup(LIB07);
  assert.equal(c.details, 1);
  assert.equal(c.summary, 1);
  assert.equal(c.h3, 1);
  assert.equal(c.bold, 2);
  assert.equal(c.tableSep, 1);
  assert.equal(c.quote, 1);
  assert.equal(c.numericFirst, 0);
});

test("L9-e: a lone numeric first line (lib05 «٦٠٩٦٠٩») and clean prose", () => {
  assert.equal(scanMarkup("٦٠٩٦٠٩\nقرار اللجنة الابتدائية").numericFirst, 1);
  assert.equal(scanMarkup("\n  609  \nنص").numericFirst, 1);
  assert.equal(scanMarkup("المادة 609 من النظام").numericFirst, 0);
  assert.equal(markupScore(scanMarkup("بعون الله تعالى، نحن ملك المملكة العربية السعودية.")), 0);
  assert.deepEqual(scanMarkup(null), emptyCounts());
});

test("L9-e: the same article with two texts (lib07 pages 1 and 2) and a repeated heading", () => {
  const twice = "المادة الأولى:\nتسري أحكام هذا نظام والجداول\n\nالمادة الأولى : (١)\nتسري أحكام هذا النظام، والجداول";
  assert.equal(scanMarkup(twice).articleTwice, 1);
  assert.equal(scanMarkup("المادة الأولى: نص\nالمادة الثانية: نص آخر").articleTwice, 0);
  assert.equal(scanMarkup("## الباب الأول\nنص\n## الباب الأول\nنص").repeatedHeading, 1);
});

test("L9-e: TSV, worst rows and summary", () => {
  const rows = [
    { source: "file", id: "a.md", counts: scanMarkup(LIB07) },
    { source: "file", id: "b.md", counts: scanMarkup("نص نظيف") },
    { source: "file", id: "c\td.md", counts: scanMarkup("**x**") },
  ];
  const tsv = scanTsv(rows);
  const [head, first] = tsv.split("\n");
  assert.equal(head, "source\tid\tdetails\tsummary\th3\tbold\ttableSep\tquote\tnumericFirst\trepeatedHeading\tarticleTwice\tscore");
  assert.equal(first.split("\t").length, 12);
  assert.ok(tsv.includes("c d.md"), "a tab inside an id never breaks the columns");
  assert.deepEqual(worstRows(rows).map((r) => r.id), ["a.md", "c\td.md"]);
  assert.match(scanSummary(rows), /documents with any markup: 2/);
});

test("L9-e: the CLI has no write path and never reads .env files", () => {
  const src = readFileSync(new URL("../../../scripts/library-markup-scan.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\.env\.local|dotenv|readFileSync\([^)]*\.env/);
  assert.doesNotMatch(src, /method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/i);
  assert.doesNotMatch(src, /\.(?:insert|upsert|update|delete|rpc)\(/);
  assert.match(src, /--confirm-host/);
});
