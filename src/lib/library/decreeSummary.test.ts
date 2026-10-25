/**
 * N2.8 — parse-decrees reads the short موجز from the file's <details> block
 * and keeps the full summary apart. Parser code only: never run on data here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decreeSummaries } from "./decreeSummary.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const PARSER = readFileSync(path.join(here, "../../../scripts/parsers/parse-decrees.ts"), "utf8").replace(/\r\n/g, "\n");

// The shape of the owner's decree files (أوامر وتعاميم, 2026-10-25).
const BODY = `# إضافة فقرات على مواد اللائحة التنفيذية لنظام المرور

<details open>
<summary>📝 موجز المستند (خلاصة سريعة)</summary>

> **الموضوع والقرار:** إضافة فقرات على مواد اللائحة.

</details>

<details>
<summary>📊 بطاقة تعريف المستند والبيانات الأساسية</summary>

| الحقل | القيمة |
| :--- | :--- |
| **نوع المستند** | تعميم |

</details>

***

## نص المستند

إنّ وزير الداخلية`;

test("the brief comes from the موجز block; the full summary stays the front matter's", () => {
  const out = decreeSummaries({ summary: "الملخص الكامل للقرار وأسبابه.", summary_brief: "قديم" }, BODY);
  assert.deepEqual(out, {
    summary: "الملخص الكامل للقرار وأسبابه.",
    summary_brief: "**الموضوع والقرار:** إضافة فقرات على مواد اللائحة.",
  });
});

test("CRLF files give the same brief; the block stops at its own </details>", () => {
  const out = decreeSummaries({}, BODY.replace(/\n/g, "\r\n"));
  assert.equal(out.summary_brief, "**الموضوع والقرار:** إضافة فقرات على مواد اللائحة.");
  assert.doesNotMatch(out.summary_brief, /بطاقة تعريف|نوع المستند/);
});

test("no block: the front matter's summary_brief, never the full summary copied in", () => {
  assert.deepEqual(decreeSummaries({ summary: "كامل", summary_brief: "موجز" }, "# بلا موجز\n\nنص"), { summary: "كامل", summary_brief: "موجز" });
  assert.deepEqual(decreeSummaries({ summary: "كامل" }, "# بلا موجز"), { summary: "كامل", summary_brief: "" });
  assert.deepEqual(decreeSummaries({ summary_brief: "موجز" }, BODY.replace("📝 موجز", "📌 ملاحظة")), { summary: "", summary_brief: "موجز" });
});

test("an empty or unclosed موجز block is not read", () => {
  const empty = "<details open>\n<summary>📝 موجز المستند</summary>\n\n> \n\n</details>";
  assert.equal(decreeSummaries({ summary_brief: "من الواجهة" }, empty).summary_brief, "من الواجهة");
  const unclosed = "<details open>\n<summary>📝 موجز المستند</summary>\n\n> نص";
  assert.equal(decreeSummaries({}, unclosed).summary_brief, "");
});

test("parse-decrees uses it for the markdown files and keeps the body unchanged", () => {
  assert.match(PARSER, /import \{ decreeSummaries \} from "\.\.\/\.\.\/src\/lib\/library\/decreeSummary";/);
  assert.match(PARSER, /const summaries = decreeSummaries\(meta, body\);/);
  assert.match(PARSER, /summary: summaries\.summary,\n\s*summary_brief: summaries\.summary_brief,/);
  // the preamble is still the body's text before the first article, untouched
  assert.match(PARSER, /preamble = body\.slice\(0, firstArt\)\.trim\(\);/);
});
