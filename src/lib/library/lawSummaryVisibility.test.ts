/**
 * Owner answer ٢٦٠ (أ): the موجز and the card's public fields are for
 * everyone — the single flag LAW_SUMMARY_AUDIENCE. The ديباجة, the card's
 * T28-22 rows and the article text keep their locks (pinned below).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAW_SUMMARY_AUDIENCE, cardForViewer, lawReaderExtras, lawSummaryVisible } from "./lawSummaryVisibility.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "../../..");
const read = (p: string) => readFileSync(path.join(repo, p), "utf8");

const PREAMBLE = [
  "<details open>",
  "<summary>📝 موجز النظام</summary>",
  "",
  "> ينظم النظام علاقات العمل.",
  "",
  "</details>",
  "",
  "### 📊 بطاقة تعريف نظام",
  "",
  "| الحقل | القيمة |",
  "| :--- | :--- |",
  "| **نوع التشريع** | نظام |",
  "| **حالة التشريع** | ساري — معدّل، آخر تحديث بقرار وزير العدل رقم (512) |",
  "| **أداة الإصدار** | مرسوم ملكي رقم (م/51) |",
  "| **تاريخ النشر** | 1426/09/25هـ |",
  "| **المصدر الرسمي** | [هيئة الخبراء](https://laws.boe.gov.sa/x) |",
  "| **الجهة المصدرة** | مجلس الوزراء |",
  "",
  "# نظام العمل",
].join("\n");

test("owner ٢٦٠ (أ): the default audience is everyone, guests included", () => {
  assert.equal(LAW_SUMMARY_AUDIENCE, "everyone");
  assert.equal(lawSummaryVisible(true), true);
  assert.equal(lawSummaryVisible(false), true);
});

test("the «subscribers» audience still admits only a subscriber", () => {
  assert.equal(lawSummaryVisible(false, "subscribers"), false);
  assert.equal(lawSummaryVisible(true, "subscribers"), true);
});

test("«subscribers» + a non-subscriber: no summary / card keys at all, and the preamble untouched", () => {
  const out = lawReaderExtras(PREAMBLE, false, "subscribers");
  assert.deepEqual(Object.keys(out), ["preamble"]);
  assert.equal(out.preamble, PREAMBLE);
});

test("a guest (default audience) gets the موجز and the card without its T28-22 rows", () => {
  const out = lawReaderExtras(PREAMBLE, false);
  assert.equal(out.summary, "ينظم النظام علاقات العمل.");
  assert.deepEqual(out.metadata_card, {
    main: [
      { key: "نوع التشريع", value: "نظام" },
      { key: "الجهة المصدرة", value: "مجلس الوزراء" },
    ],
    more: [],
  });
  // The decree («أداة الإصدار»), the publication date, the official link and
  // the status row that cites the amending decision by number are not sent.
  const sent = JSON.stringify(out.metadata_card);
  for (const hidden of ["أداة الإصدار", "تاريخ النشر", "المصدر الرسمي", "512", "م/51", "boe.gov.sa"]) {
    assert.ok(!sent.includes(hidden), hidden);
  }
});

test("a subscriber gets the موجز, the whole card, and a preamble without them", () => {
  const out = lawReaderExtras(PREAMBLE, true);
  assert.equal(out.summary, "ينظم النظام علاقات العمل.");
  assert.equal(out.summaryLabel, "📝 موجز النظام");
  assert.equal(out.metadata_card?.main.length, 6);
  // Only the H1 is left: no «الديباجة» box that opens on the law's title.
  assert.equal(out.preamble, "");
});

test("prose left after the blocks keeps the preamble; an empty ديباجة toggle alone does not", () => {
  const withDecree = `${PREAMBLE}

**قرار مجلس الوزراء رقم (219) وتاريخ 1426/8/22هـ**

إن مجلس الوزراء…`;
  assert.equal(
    lawReaderExtras(withDecree, true).preamble,
    "# نظام العمل\n\n**قرار مجلس الوزراء رقم (219) وتاريخ 1426/8/22هـ**\n\nإن مجلس الوزراء…",
  );
  const emptyToggle = `${PREAMBLE}

***

## ديباجة النظام

<details>
<summary>📜 ديباجة نظام العمل</summary>

لم تتوفر ديباجة في المصدر المستخدم.

</details>`;
  assert.equal(lawReaderExtras(emptyToggle, true).preamble, "");
});

test("a preamble with nothing lifted is never emptied, hollow or not", () => {
  assert.equal(lawReaderExtras("# نظام العمل", true).preamble, "# نظام العمل");
});

test("a preamble with no blocks gives a subscriber the preamble only", () => {
  const out = lawReaderExtras("# نظام\n\nإن مجلس الوزراء…", true);
  assert.deepEqual(out, { preamble: "# نظام\n\nإن مجلس الوزراء…" });
});

test("«everyone» + a non-subscriber: the card loses its T28-22 rows (decree, dates, links, amending decree)", () => {
  const out = lawReaderExtras(PREAMBLE, false, "everyone");
  assert.equal(out.summary, "ينظم النظام علاقات العمل.");
  assert.deepEqual(out.metadata_card?.main, [
    { key: "نوع التشريع", value: "نظام" },
    { key: "الجهة المصدرة", value: "مجلس الوزراء" },
  ]);
});

test("cardForViewer: null stays null; an all-official card becomes null for a non-subscriber", () => {
  assert.equal(cardForViewer(null, true), null);
  assert.equal(cardForViewer({ main: [{ key: "أداة الإصدار", value: "مرسوم ملكي رقم (م/1)" }], more: [] }, false), null);
});

test("the law route uses this flag on the subscriber flag (hasFullLibraryAccess), never the whitelist", () => {
  const route = read("src/app/api/library/laws/[slug]/route.ts");
  assert.match(route, /lawReaderExtras\(\s*preamble,\s*isSubscriber\s*\)/);
  assert.match(route, /hasFullLibraryAccess\(userId\)/);
});

test("owner ٢٦٠ opens nothing else in the law route: ديباجة, official metadata and article text keep their locks", () => {
  const route = read("src/app/api/library/laws/[slug]/route.ts");
  // The ديباجة (and the regulation's) stay blank for a non-subscriber.
  assert.match(route, /preamble: officialMeta\.officialMetaLocked \? '' : readerExtras\.preamble,/);
  assert.match(route, /regulationPreamble: officialMeta\.officialMetaLocked \? '' : regulationPreamble,/);
  // T28-22 mask still keyed on the subscriber flag.
  assert.match(route, /const officialMeta = lawOfficialMeta\(law, isSubscriber\);/);
  // Article text: the same free limit (owner ١٨٤) and full-access predicate.
  assert.match(route, /const freeLimit = effectiveFreeLimit\(firstLockedCheck, articles\.length\);/);
  assert.match(route, /const hasFullAccess = isSubscriber \|\| isWhitelisted;/);
  assert.match(route, /formatArticleWithPaywall\(a, hasFullAccess, freeLimit, !officialMeta\.officialMetaLocked\)/);
  assert.match(route, /const parentLocked = isArticleLocked\(article, hasFullAccess, freeLimit\);/);
  // The lock row is promised only for ديباجة text left once the card and the موجز are out.
  assert.match(route, /preambleLocked: officialMeta\.officialMetaLocked && !!\(readerExtras\.preamble\.trim\(\) \|\| regulationPreamble\.trim\(\)\)/);
});

test("the catalogue sends the موجز to everyone through the same flag, from the service-role read", () => {
  const init = read("src/app/api/library/init/route.ts");
  assert.match(init, /wanted: lawSummaryVisible\(hasFullAccess\) \? \["summary", "sort"\] : \["sort"\]/);
  // Read on the service-role client (summary_brief is column-locked for anon).
  assert.match(init, /fetchSection\("laws",[\s\S]*?\}, serverOnly, \{/);
  // Locked law rows still lose the body fields; the official fields stay masked.
  assert.match(init, /stripFields\(\{ \.\.\.row \}, \["preamble", "description", "article_status_summary"\]\)/);
  assert.match(init, /maskListOfficialFields\(shaped, hasFullAccess\)/);
});

test("the sidebar card says «للمشتركين» once for the rows a guest does not get", () => {
  const sidebar = read("src/app/laws/[slug]/_sidebar.tsx");
  const cardBranch = sidebar.slice(sidebar.indexOf("if (law.metadata_card) {"), sidebar.indexOf("زر حفظ في مجلداتي"));
  assert.match(cardBranch, /\{metaLocked && \(\s*<OfficialMetaLockedRow/);
});

test("a guest keeps the card's type row even when its key is «نوع الوثيقة» (owner ٢٦١)", () => {
  const card = {
    main: [
      { key: "نوع الوثيقة", value: "لائحة تنفيذية" },
      { key: "وثيقة النظام (PDF)", value: "[PDF](https://example.gov.sa/a.pdf)" },
      { key: "نوع المستند", value: "قرار رقم (5)" },
    ],
    more: [],
  };
  assert.deepEqual(cardForViewer(card, false)?.main, [{ key: "نوع الوثيقة", value: "لائحة تنفيذية" }]);
});
