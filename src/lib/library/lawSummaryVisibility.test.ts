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
import { GUEST_CARD_KEYS, LAW_SUMMARY_AUDIENCE, cardForViewer, cardRowValue, cardStatusValue, guestCardValue, lawReaderExtras, lawSummaryVisible, withCleanCardRows } from "./lawSummaryVisibility.ts";
import { LAW_CARD_PRIMARY_FIELDS, lawCardLayout } from "./lawCardFields.ts";

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
      // The status words (owner ٢٥٩): «معدّل» stays, the decision it cites does not.
      { key: "حالة التشريع", value: "ساري — معدّل" },
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
    { key: "حالة التشريع", value: "ساري — معدّل" },
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
  assert.match(route, /regulationPreamble: officialMeta\.officialMetaLocked \? '' : withCleanCardRows\(regulationPreamble\),/);
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
  assert.deepEqual(cardForViewer(card, false)?.main, [
    { key: "نوع الوثيقة", value: "لائحة تنفيذية" },
    { key: "نوع المستند", value: "قرار" },
  ]);
});

// ── The guest card is an ALLOWLIST (review of b0317922, 2026-10-26) ─────────

test("GUEST_CARD_KEYS is النوع / الحالة / الجهة المصدرة from the one field list — never the dates", () => {
  const expected = LAW_CARD_PRIMARY_FIELDS.filter((f) => f.id === "type" || f.id === "status" || f.id === "issuer").flatMap((f) => f.keys);
  assert.deepEqual([...GUEST_CARD_KEYS].sort(), [...expected].sort());
  for (const f of LAW_CARD_PRIMARY_FIELDS.filter((x) => x.id === "issueDate" || x.id === "lastAmendment")) {
    for (const key of f.keys) assert.ok(!GUEST_CARD_KEYS.has(key), key);
  }
});

test("the allowlist is what protects: an innocent row under any other key is dropped for a guest", () => {
  // None of these values cites or dates anything: a blocklist kept every one.
  const innocent = [
    { key: "ملاحظة", value: "نص" },
    { key: "التصنيف", value: "القسم الإجرائي" },
    { key: "الموضوع", value: "تنظيم مهنة المحاماة" },
    { key: "اللوائح المدمجة", value: "اللائحة التنفيذية" },
    { key: "السند النظامي", value: "نظام التعاملات الإلكترونية" },
    { key: "صك الإصدار", value: "صك" },
    { key: "سنة الإصدار", value: "غير محدد" },
    { key: "الرقم", value: "غير متوفر" },
    { key: "تاريخ الإصدار", value: "غير متوفر" },
    { key: "آخر تعديل", value: "لا يوجد" },
  ];
  assert.equal(cardForViewer({ main: innocent, more: innocent }, false), null);
  const out = cardForViewer({ main: [{ key: "نوع التشريع", value: "نظام" }, ...innocent], more: innocent }, false);
  assert.deepEqual(out, { main: [{ key: "نوع التشريع", value: "نظام" }], more: [] });
  // A subscriber still gets everything — but a «غير متوفر» that is only a gap note (owner ٢٥٩).
  assert.deepEqual(
    cardForViewer({ main: innocent, more: [] }, true)?.main,
    innocent.filter((r) => r.value !== "غير متوفر"),
  );
});

const RLM = String.fromCharCode(0x200f);
const LRM = String.fromCharCode(0x200e);
const ALM = String.fromCharCode(0x061c);
const UNSAFE = /[0-9٠-٩۰-۹]|https?:|www\.|\.(?:sa|com|gov)\b/i;
const BIDI = new RegExp(`[${RLM}${LRM}${ALM}]`);

test("the reviewer's probe values, under an allowed key, never reach a guest with a digit, a link or a bidi mark", () => {
  const values = [
    "قرار وزاري 5595", "بقرار وزير العدل 921", "تعميم (19/3227)", "قرارات وزارية (59510، 484، 25)",
    "م/١٤", `م${RLM}/14`, "المرسوم الملكي م 14", "22 رمضان 1442هـ", "١٥ شوال ١٤٢٨هـ", "2021/05/04م",
    "04-05-2021", "1442.9.22", "2019/12/01م", "www.boe.gov.sa/ViewSystem", "laws.boe.gov.sa",
    "[الرابط](https://boe.gov.sa)", "٢٧-٠٥-١٣٩٩هـ", "الصادر في ١٤٤٢/٣/٢هـ", "الموافقة السامية ذات الرقم ٤٥٦",
  ];
  for (const key of GUEST_CARD_KEYS) {
    for (const v of values) {
      for (const value of [v, `مجلس الوزراء ${v}`, `ساري — ${v}`, `وزارة العدل (${v})`]) {
        const sent = JSON.stringify(cardForViewer({ main: [{ key, value }], more: [] }, false));
        assert.ok(!UNSAFE.test(sent) && !BIDI.test(sent), `${key}: ${value} → ${sent}`);
      }
    }
  }
});

test("allowed values are cleaned for a guest, from last_owner's own shapes", () => {
  const cases: Array<[string, string, string | null]> = [
    ["حالة التشريع", "ساري — معدّل، آخر تعديل بمرسوم ملكي (م/21) وتاريخ 1447/01/26هـ", "ساري — معدّل"],
    ["حالة التشريع", "ملغى — مُستبدَل بنظام البيئة (قرار مجلس الوزراء رقم 729 وتاريخ 16/11/1441هـ)", "ملغى"],
    ["حالة التشريع", "ساري — معدّل", "ساري — معدّل"],
    ["حالة التشريع", "مُستبدَل بتنظيم إعانة البحث عن عمل 1442هـ", null],
    ["الجهة المصدرة", "وزير المالية (تنفيذاً لنظام ضريبة الدخل، المرسوم الملكي رقم م/1 وتاريخ 1425/01/15هـ)", "وزير المالية"],
    ["الجهة المصدرة", "هيئة الحكومة الرقمية (dga.gov.sa)", "هيئة الحكومة الرقمية"],
    ["الجهة المصدرة", "الهيئة العامة للطيران المدني (GACA)", "الهيئة العامة للطيران المدني (GACA)"],
    ["الجهة المصدرة", "[هيئة الخبراء](https://laws.boe.gov.sa/x)", "هيئة الخبراء"],
    ["الجهة المصدرة", `مجلس${RLM} الوزراء${LRM}`, "مجلس الوزراء"],
  ];
  for (const [key, value, expected] of cases) {
    const out = cardForViewer({ main: [{ key, value }], more: [] }, false);
    assert.deepEqual(out?.main[0]?.value ?? null, expected, value);
  }
  assert.equal(guestCardValue("ساري"), "ساري");
});

test("the pipeline note «— تحقَّق منه YYYY-MM-DD» is removed from every row, for EVERY viewer", () => {
  const card = {
    main: [{ key: "الجهة المصدرة", value: "مجلس الوزراء — تحقَّق منه 2026-07-28" }],
    more: [{ key: "الجهة الإدارية المصدرة", value: "وزير العدل — تحقق منه" }, { key: "الموضوع", value: "عام — تحقَّق منه 2026-07-28" }],
  };
  for (const isSubscriber of [true, false]) {
    const out = cardForViewer(card, isSubscriber);
    assert.equal(out?.main[0].value, "مجلس الوزراء", String(isSubscriber));
    assert.equal(out?.more[0].value, "وزير العدل", String(isSubscriber));
  }
  // Not only the issuer's (owner ٢٥٩, 2026-10-26): a date, an instrument, a subject.
  assert.equal(cardForViewer(card, true)?.more[1].value, "عام");
});

// ── Owner ٢٥٩ (أ): no gap / verification note in ANY row ───────────────────

test("cardRowValue: the export's gap and verification notes go, the rest stays (last_owner's own values)", () => {
  const cases: Array<[string, string | null]> = [
    // «— تحقَّق منه …» on a date / an instrument.
    ["24 ربيع الآخر 1435هـ — تحقَّق منه 2026-07-28", "24 ربيع الآخر 1435هـ"],
    ["٥ شوّال ١٤٤١هـ (قرار وزير العدل رقم 8056) — تحقَّق منه 2026-07-19", "٥ شوّال ١٤٤١هـ (قرار وزير العدل رقم 8056)"],
    ["قرار مجلس الوزراء رقم (162) وتاريخ 24 ربيع الآخر 1435هـ — تحقَّق منه 2026-07-28", "قرار مجلس الوزراء رقم (162) وتاريخ 24 ربيع الآخر 1435هـ"],
    ["لا يوجد — لم تُعدَّل أي مادة منذ صدور النظام (تحقُّق حي 2026-07-20)", "لا يوجد — لم تُعدَّل أي مادة منذ صدور النظام"],
    ["2025/02/09م (بحسب صفحة اللوائح الحية على بوابة الهيئة، تم التحقق 2026-07-19)", "2025/02/09م"],
    // «غير مؤكَّد» on a date: the qualifier goes, the date stays.
    ["1372/01/24هـ (التحويل الميلادي الدقيق غير مؤكد — راجع ملاحظة المراجعة البشرية في الفرونت-ماتر)", "1372/01/24هـ"],
    ["1960-06-25م (تاريخ عام تقديري من BOE، اليوم/الشهر الدقيقان غير مؤكَّدين)", "1960-06-25م (تاريخ عام تقديري من BOE)"],
    ["المادة (15): بعد 18 شهراً من تاريخ النشر في الجريدة الرسمية (تاريخ النشر الفعلي غير مؤكَّد من المصدر)", "المادة (15): بعد 18 شهراً من تاريخ النشر في الجريدة الرسمية"],
    ["لائحة صادرة عن مؤسسة النقد العربي السعودي (رقم القرار غير مؤكَّد من مصدر أولي)", "لائحة صادرة عن مؤسسة النقد العربي السعودي"],
    // «غير متوفر» / «لم يُعثر»: the note goes; a value that was only a note goes.
    ["غير متوفر في المصدر — يعمل به بعد تسعين يوماً من نشره (المادة 49)", "يعمل به بعد تسعين يوماً من نشره (المادة 49)"],
    ["1442/01/19ه (البند حادي عشر: نافذة من تاريخ النشر؛ لم يُعثر على تاريخ نشر منفصل)", "1442/01/19ه (البند حادي عشر: نافذة من تاريخ النشر)"],
    ["الملك (بصيغة تصديق عالي) — ديباجة الإصدار الأصلي غير متوفرة في المصدر المستخدم لمزيد من التفصيل", "الملك (بصيغة تصديق عالي)"],
    ["[هيئة الخبراء](https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/x/1) · الموقع الرسمي: غير متوفر", "[هيئة الخبراء](https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/x/1)"],
    ["[infath.gov.sa](https://infath.gov.sa/) (رابط مباشر لنص الدليل نفسه غير متاح على الموقع الرسمي)", "[infath.gov.sa](https://infath.gov.sa/)"],
    ["غير متوفر (الرابط المسجَّل سابقاً لا يفتح الوثيقة؛ لم يُعثر على بديل صحيح عند التحقق 2026-07-19)", null],
    ["غير متوفرهـ", null],
    ["غير متاح في المصدر الحي", null],
    // A stamp inside a sentence goes; the sentence stays.
    [
      "صدر مرسوم ملكي رقم (م/237) بنظام جديد. تحقق مباشر 2026-07-19 من بوابة هيئة الخبراء: نُشر بالفعل بتاريخ 1447/11/14هـ.",
      "صدر مرسوم ملكي رقم (م/237) بنظام جديد. نُشر بالفعل بتاريخ 1447/11/14هـ.",
    ],
  ];
  for (const [value, expected] of cases) assert.equal(cardRowValue(value), expected, value);
});

test("cardRowValue leaves the law's own words alone — «التحقق», «المرجح», English terms, links", () => {
  for (const value of [
    "قائمة التحقق - تقييم هيكل دليل التدريب",
    "ضوابط تصنيف الخدمات الحكومية الرقمية الحساسة ومستويات التحقق",
    "امتداد للضوابط الأساسية للأمن السيبراني (ECC-1:2018) — لا يتحقق الالتزام بها إلا بالالتزام المستمر بـECC أولاً",
    "500 ريال + 575 ريال (رسوم تحقق شهادة أجنبية، لمرة واحدة عند الحاجة)",
    "تعميم بشأن التحقق من هوية العملاء عبر مصدر موثوق",
    "تعميم بشأن التأكيد على بذل العناية الواجبة عند التحقق من دخل العميل قبل منح التمويل",
    "تعميم بشأن التحقق من السمات الحيوية (biometric authentication) عند بدء/إنشاء العلاقة 'عن بعد'",
    "أمر سامي بشأن إلزام الجهات الحكومية بالعناية بدقة ترجمة النسخ العربية للاتفاقيات ومطابقتها للنص المرجح",
    "تخفيض معدل الأصول المرجحة بأوزان المخاطر المتعلقة بالتمويل العقاري",
    "الهيئة العامة للطيران المدني (GACA) - قطاع سلامة الطيران والاستدامة البيئية",
    "[بوابة دار الوثائق الوطنية (ncar)](https://ncar.gov.sa)",
    "مواصفة قياسية خليجية معتمدة من اللجنة الفنية الخليجية رقم (TC05)",
    "الهيئة العامة للغذاء والدواء (sfda.gov.sa)",
  ]) {
    assert.equal(cardRowValue(value), value, value);
  }
});

// Review of 81295e33: an approximate date keeps its qualifier, and a note
// never takes legal content (an article, a date, a period, a number) with it.

test("cardRowValue keeps «تقريباً» / «تقديري» / «المرجَّح»: without them an approximate date reads as exact", () => {
  for (const value of [
    "2024-06-05م تقريباً — وفق المادة (16): بعد (180) يوماً من تاريخ النشر",
    "1445/02/14هـ (الموافق تقريباً 2023-08-30م)",
    "1447/08/22هـ (الموافق 2026-02-10م تقريباً)",
    "2006-02-28م تقريباً (60 يوماً بعد النشر)",
    "2025-12-12م (تقريباً، مشتق من تاريخ الإصدار المؤكَّد)",
    "1444/06/06هـ (عدد أم القرى رقم 4963 المرجَّح)",
  ]) {
    assert.equal(cardRowValue(value), value, value);
  }
  const cases: Array<[string, string]> = [
    // The date's own note goes; its «تقريباً» stays.
    ["بعد (30) يوماً من تاريخ النشر (م17) — الموافق تقريباً 1987-08-30م (التحويل الهجري الدقيق غير مؤكَّد)", "بعد (30) يوماً من تاريخ النشر (م17) — الموافق تقريباً 1987-08-30م"],
    ["2021-01-10م تقريباً — بعد (30) يوماً من تاريخ النشر (المادة 18)؛ المقابل الهجري غير محسوب", "2021-01-10م تقريباً — بعد (30) يوماً من تاريخ النشر (المادة 18)"],
    ["1423/9/26هـ (تقديري، راجع ملاحظة تاريخ النفاذ)", "1423/9/26هـ (تقديري)"],
    // «بأفضل تقدير متاح»: filler words; the estimated date is the law's.
    [
      "من تاريخ نشرها في موقع الهيئة (المادة العاشرة) — يقدَّر بتاريخ الاعتماد 1447/06/23هـ الموافق 2025-12-14م بأفضل تقدير متاح",
      "من تاريخ نشرها في موقع الهيئة (المادة العاشرة) — يقدَّر بتاريخ الاعتماد 1447/06/23هـ الموافق 2025-12-14م",
    ],
  ];
  for (const [value, expected] of cases) assert.equal(cardRowValue(value), expected, value);
});

test("cardRowValue drops the note words only — the article, the period, the gazette number stay", () => {
  const cases: Array<[string, string | null]> = [
    // A note head with the law inside its aside: the aside is the value.
    [
      "غير متوفر في المصدر (المادة (19): تُنشر في الجريدة الرسمية ويُعمل بها بعد ستة أشهر من تاريخ نشرها؛ تاريخ النشر غير مسجَّل في المصدر)",
      "المادة (19): تُنشر في الجريدة الرسمية ويُعمل بها بعد ستة أشهر من تاريخ نشرها",
    ],
    ["لم تُعثر عليها في المكتبة بعد (تصدر خلال 60 يوماً من موافقة المجلس وفق المادة 56)", "تصدر خلال 60 يوماً من موافقة المجلس وفق المادة 56"],
    // A clause that goes on to note: the segments before the note stay.
    [
      "غير متوفر في المصدر — المادة (21) تنص على النفاذ من تاريخ النشر، وتاريخ النشر الفعلي غير مؤكَّد من مصدر أولي مستقل",
      "المادة (21) تنص على النفاذ من تاريخ النشر",
    ],
    ["ملحق (1) — نموذج عقد الرعاية (مُشار إليه بالمادة 7، غير متوفر نصه في المصدر المستخرَج)", "ملحق (1) — نموذج عقد الرعاية (مُشار إليه بالمادة 7)"],
    // «مؤكَّد عبر <site> و…»: the lead goes, the gazette issue and its date stay.
    [
      "عُدّلت بالمرسومين (م/6) وتاريخ 1440/01/02هـ (مؤكَّد عبر ncar.gov.sa وجريدة أم القرى العدد 4746 وتاريخ 1440/01/18هـ) و(م/113) وتاريخ 1443/11/09هـ",
      "عُدّلت بالمرسومين (م/6) وتاريخ 1440/01/02هـ (جريدة أم القرى العدد 4746 وتاريخ 1440/01/18هـ) و(م/113) وتاريخ 1443/11/09هـ",
    ],
    // A stamp's bare date is never unwrapped as if it were the law.
    [
      "صدر تحديث شامل للائحة بقرار المحافظ رقم (179/م ش ت). تم التحقق المباشر (2026-07-22) من نص اللائحة: جميع الاستشهادات صحيحة، بما فيها أبواب التحصيل",
      "صدر تحديث شامل للائحة بقرار المحافظ رقم (179/م ش ت).",
    ],
    // A note about our own link, figures and all, is still only a note.
    ["غير متوفر (الرابط المسجَّل سابقاً يفتح النظام الأساسي لعام 1432هـ وليس تعديل 1447هـ المحدد؛ لم يُعثر على بديل صحيح عند التحقق 2026-07-19)", null],
    ["غير متوفر (نموذج إجرائي داخلي للهيئة)", null],
  ];
  for (const [value, expected] of cases) assert.equal(cardRowValue(value), expected, value);
});

test("the «تاريخ السريان (النفاذ) محسوباً» row keeps its article once the note goes", () => {
  const card = {
    main: [{ key: "نوع التشريع", value: "لائحة" }],
    more: [{ key: "تاريخ السريان (النفاذ) محسوباً", value: "غير متوفر في المصدر — المادة (21) تنص على النفاذ من تاريخ النشر، وتاريخ النشر الفعلي غير مؤكَّد من مصدر أولي مستقل" }],
  };
  assert.deepEqual(cardForViewer(card, true)?.more, [{ key: "تاريخ السريان (النفاذ) محسوباً", value: "المادة (21) تنص على النفاذ من تاريخ النشر" }]);
});

// ── The same rows where the reader prints the card's Markdown ─────────────

const DECREE_PREAMBLE = [
  "<details>",
  "<summary>📊 بطاقة تعريف القرار والبيانات التنظيمية</summary>",
  "",
  "### ⚖️ معلومات التشريع الأساسية",
  "| الحقل | القيمة |",
  "| :--- | :--- |",
  "| **نوع التشريع** | قرار مجلس الوزراء |",
  "| **تاريخ الإصدار** | ٢٥/٠٢/١٤٤٧هـ |",
  "| **تاريخ النشر في الجريدة الرسمية** | غير متوفر |",
  "",
  "### 🔗 روابط وبوابات التشريع",
  "| البوابة | الرابط |",
  "| :--- | :--- |",
  "| **رابط هيئة الخبراء** | غير متوفر |",
  "| **رابط بوابة وزارة العدل** | غير متوفر |",
  "",
  "</details>",
  "",
  "### 📊 بطاقة تعريف قرار مجلس الوزراء",
  "",
  "| الحقل | القيمة |",
  "| :--- | :--- |",
  "| **حالة التشريع** | ساري (Active) |",
  "| **أداة الإصدار** | قرار مجلس الوزراء رقم (157) وتاريخ 1447/02/25هـ — تحقَّق منه 2026-07-19 |",
  "| **المصدر الرسمي** | غير متوفر (الرابط المسجَّل سابقاً لا يفتح الوثيقة؛ لم يُعثر على بديل صحيح عند التحقق 2026-07-19) |",
  "| **تاريخ الاستخراج** | 2026-06-12 |",
  "",
  "# القرار",
  "",
  "## ديباجة القرار",
  "| البند | المبلغ |",
  "| :--- | :--- |",
  "| رسم التسجيل | غير متوفر |",
].join("\n");

test("withCleanCardRows: a decree's card rows as the law card gives them; the decree's own table is untouched", () => {
  const out = withCleanCardRows(DECREE_PREAMBLE);
  for (const word of ["المصدر الرسمي", "لم يُعثر", "تحقَّق منه", "تاريخ الاستخراج", "تاريخ النشر في الجريدة الرسمية", "روابط وبوابات", "رابط هيئة الخبراء", "Active"]) {
    assert.ok(!out.includes(word), word);
  }
  assert.ok(out.includes("| **نوع التشريع** | قرار مجلس الوزراء |"));
  assert.ok(out.includes("| **تاريخ الإصدار** | ٢٥/٠٢/١٤٤٧هـ |"));
  assert.ok(out.includes("| **حالة التشريع** | ساري |"));
  assert.ok(out.includes("| **أداة الإصدار** | قرار مجلس الوزراء رقم (157) وتاريخ 1447/02/25هـ |"));
  // Not a card: the ديباجة's own table keeps every row, its «غير متوفر» too.
  assert.ok(out.endsWith("## ديباجة القرار\n| البند | المبلغ |\n| :--- | :--- |\n| رسم التسجيل | غير متوفر |"), out);
});

test("withCleanCardRows: a precedent card collapsed onto its heading line loses its placeholder rows only", () => {
  const text =
    "## سابقة قضائية رقم 3432937\n\n### بطاقة تعريف السابقة القضائية وبيانات الحكم | الحقل | القيمة | | :--- | :--- | | **الجهة المصدرة** | المحكمة العامة | | **رقم القضية** | 32255222 | | **ملخص القضية** | غير متوفر |\n\n### ملخص القضية\n\nنص الحكم.";
  assert.equal(
    withCleanCardRows(text),
    "## سابقة قضائية رقم 3432937\n\n### بطاقة تعريف السابقة القضائية وبيانات الحكم | الحقل | القيمة | | :--- | :--- | | **الجهة المصدرة** | المحكمة العامة | | **رقم القضية** | 32255222 |\n\n### ملخص القضية\n\nنص الحكم.",
  );
});

test("withCleanCardRows on the 09-20 export's circular cards: the number stays, the extraction notes go", () => {
  const out = withCleanCardRows(
    [
      "### 📊 بطاقة تعريف التعميم",
      "",
      "| الحقل | القيمة |",
      "| :--- | :--- |",
      "| **رقم التعميم وتاريخه** | تعميم رقم 31 في أرشيف تعاميم الهيئة؛ الرقم المرجعي وتاريخ الإصدار غير واضحين في النص المستخرج (تلف في ترويسة المستند الأصلي بسبب مشكلة OCR) |",
      "| **حالة اكتمال النص المستخرج** | نص مقروء جزئياً — تلف في ترميز الأحرف العربية (bidi corruption)، انظر التنبيه أعلاه |",
      "| **المصدر الرسمي** | — |",
    ].join("\n"),
  );
  assert.equal(out, "### 📊 بطاقة تعريف التعميم\n\n| الحقل | القيمة |\n| :--- | :--- |\n| **رقم التعميم وتاريخه** | تعميم رقم 31 في أرشيف تعاميم الهيئة |");
});

test("withCleanCardRows returns the same string when there is nothing to clean", () => {
  const clean = "### 📊 بطاقة تعريف النظام\r\n\r\n| الحقل | القيمة |\r\n| :--- | :--- |\r\n| **نوع التشريع** | نظام |\r\n";
  assert.equal(withCleanCardRows(clean), clean);
  assert.equal(withCleanCardRows("إن مجلس الوزراء…"), "إن مجلس الوزراء…");
  assert.equal(withCleanCardRows(""), "");
});

test("the decree route cleans the preamble's card in the subscriber branch only, and a page only once it is unlocked", () => {
  const route = read("src/app/api/library/decrees/[id]/route.ts");
  assert.match(route, /preamble: isSubscriber \? withCleanCardRows\(preamble\) : ''/);
  // The lock is read off the stored preamble; the page lock (١٨٣) is decided before any cleaning.
  assert.match(route, /preambleLocked: !isSubscriber && preamble\.trim\(\) !== ''/);
  assert.match(route, /idx < unlockedCount && typeof p\.content === 'string' \? withCleanCardRows\(p\.content\) : ''/);
  assert.match(route, /const unlockedCount = free === -1 \? pages\.length : Math\.min\(free, pages\.length\);/);
  assert.equal(route.match(/withCleanCardRows\(/g)?.length, 2);
});

test("a second card the reader cannot lift («🗂️ البطاقة التعريفية …») leaves the law preamble with clean rows", () => {
  const preamble = [
    "### 📊 بطاقة تعريف نظام",
    "",
    "| الحقل | القيمة |",
    "| :--- | :--- |",
    "| **نوع التشريع** | نظام |",
    "",
    "***",
    "",
    "<details>",
    "<summary>🗂️ البطاقة التعريفية للنظام وبيانات التشريع</summary>",
    "",
    "### 🔄 بيانات آخر تحديث",
    "| الحقل | القيمة |",
    "|:--- |:--- |",
    "| **أداة إصدار آخر تحديث** | لا توجد تعديلات لاحقة |",
    "| **تاريخ أداة آخر تحديث** | — |",
    "| **مرفق أداة آخر تحديث (PDF)** | غير متوفر |",
    "",
    "</details>",
    "",
    "## ديباجة النظام",
    "",
    "بعد الاطلاع على …",
  ].join("\n");
  const out = lawReaderExtras(preamble, true).preamble;
  assert.ok(!out.includes("غير متوفر"), out);
  assert.ok(!out.includes("تاريخ أداة آخر تحديث"), out);
  assert.ok(out.includes("| **أداة إصدار آخر تحديث** | لا توجد تعديلات لاحقة |"), out);
  assert.ok(out.includes("بعد الاطلاع على …"), out);
});

test("the precedents route cleans a principle's card before the 150-character cut", () => {
  const route = read("src/app/api/library/precedents/[slug]/route.ts");
  assert.match(route, /const text = typeof p\.text === 'string' \? withCleanCardRows\(p\.text\) : p\.text;\s*return isLocked \? truncate\(text, 150\) : text;/);
});

test("the export's file rows are dropped for EVERY viewer; a status row loses its English gloss", () => {
  const card = {
    main: [
      { key: "نوع التشريع", value: "نظام" },
      { key: "حالة التشريع", value: "نشط (active)" },
      { key: "الجهة المصدرة", value: "الملك (بصيغة تصديق عالي) — ديباجة الإصدار الأصلي غير متوفرة في المصدر المستخدم" },
    ],
    more: [
      { key: "تاريخ الاستخراج", value: "2026-06-12" },
      { key: "معيار التنسيق", value: "بنية مسطحة بدون مطويات (V3.3 Zero-Details Protocol)" },
      { key: "معيار الهيكلة", value: "نظام المطويات للحيثيات والوقائع (Rule 20 BOG Protocol)" },
      { key: "الملف الأصلي (PDF)", value: "المبادئ والقرارات القانونية.pdf" },
      { key: "طريقة التفريغ", value: "تفريغ بصري حرفي (Gemini Vision OCR Page-by-Page)" },
      { key: "عدد الصفحات المستخرجة", value: "4" },
      { key: "ملاحظة تحقق", value: "رقم القرار (448) مرجَّح بثقة عالية" },
      { key: "ملاحظة هيكلية", value: "رُقّمت وحداته كصفحات (PAGE)" },
      { key: "⚠️ ملاحظة تكرار محتمل", value: "نفس أداة الإصدار — راجع حقل `review_reason`" },
      { key: "ملاحظة التحديث", value: "هذا الملف يوثّق إصدار 2016م." },
      { key: "المصدر الرسمي", value: "غير متوفر (الرابط المسجَّل سابقاً لا يفتح الوثيقة؛ لم يُعثر على بديل صحيح عند التحقق 2026-07-19)" },
      { key: "حالة المستند", value: "جاري العمل على النظام (بحسب المصدر الرسمي BOE)" },
      { key: "الموضوع", value: "تعميم بشأن الإطار التنظيمي (Red Teaming)" },
    ],
  };
  for (const isSubscriber of [true, false]) {
    const out = cardForViewer(card, isSubscriber);
    const sent = JSON.stringify(out);
    for (const word of ["تاريخ الاستخراج", "معيار", "الملف الأصلي", "طريقة التفريغ", "المستخرجة", "ملاحظة", "غير متوفر", "لم يُعثر", "active", "BOE"]) {
      assert.ok(!sent.includes(word), `${word} (${isSubscriber})`);
    }
    assert.equal(out?.main.find((r) => r.key === "حالة التشريع")?.value, "نشط", String(isSubscriber));
    assert.equal(out?.main.find((r) => r.key === "الجهة المصدرة")?.value, "الملك (بصيغة تصديق عالي)", String(isSubscriber));
  }
  assert.deepEqual(cardForViewer(card, true)?.more, [
    { key: "حالة المستند", value: "جاري العمل على النظام" },
    // Outside a status row an English term is the law's own: it stays.
    { key: "الموضوع", value: "تعميم بشأن الإطار التنظيمي (Red Teaming)" },
  ]);
});

// ── Owner ٢٥٩ (أ): no «unverified» note in a status, for EVERY viewer ───────

test("cardStatusValue: the status words only — notes, cross-references and citations go (last_owner's own values)", () => {
  const cases: Array<[string, string | null]> = [
    ["ساري (بحاجة تحقق حي — لا رقم/تاريخ إصدار مؤكَّد في المصدر المستخرَج)", "ساري"],
    ["ساري (أداة الإصدار وتاريخها بحاجة تحقق حي — راجع «المزيد»)", "ساري"],
    ["ساري جزئياً — راجع التنبيه أدناه", "ساري جزئياً"],
    ["ساري — \u26A0\uFE0F صدر نظام بديل، نُشر ولم يسرِ بعد (راجع «المزيد»)", "ساري — صدر نظام بديل، نُشر ولم يسرِ بعد"],
    ["ساري — معدّل، آخر تعديل بـ المرسوم الملكي رقم (م/93) وتاريخ 1443/10/01هـ (الموافق 2022-05-02م)", "ساري — معدّل"],
    ["ساري — معدّل بمرسوم ملكي رقم (م/123) وتاريخ 1447/06/10هـ", "ساري — معدّل"],
    ["ساري — معدَّلة بالقرار رقم (2022-15-1) وتاريخ 1443/07/01هـ", "ساري — معدَّلة"],
    ["ساري — معدّل (المواد 4 و5 و6)", "ساري — معدّل"],
    ["ساري — معدّل", "ساري — معدّل"],
    ["ملغى — مُستبدَل بنظام مهنة المحاسبة والمراجعة (المرسوم الملكي وتاريخ 27/7/1442هـ)", "ملغى"],
    ["صادر ولم يدخل حيز النفاذ بعد — نفاذه 1448/02/28هـ (2026-08-12م)", "صادر ولم يدخل حيز النفاذ بعد"],
    ["ملغاة بالكامل بموجب سياسة ترخيص المنشأة القانونية، صفر 1446هـ (الموافق أغسطس 2024م)", "ملغاة بالكامل بموجب سياسة ترخيص المنشأة القانونية"],
    ["\uD83D\uDEAB ملغاة", "ملغاة"],
    ["\u2705 نافذ", "نافذ"],
    ["صدر — لم يُتحقّق من النشر", "صدر"],
    ["صدر — غير مؤكَّد النشر", "صدر"],
    ["ساري — يحتاج مراجعة", "ساري"],
    ["لم يُتحقّق من الحالة", null],
    ["بحاجة تحقق حي", null],
    ["ساري", "ساري"],
  ];
  for (const [value, expected] of cases) assert.equal(cardStatusValue(value), expected, value);
});

test("a status row is cleaned for a guest AND a subscriber; «حالة المراجعة» / «حالة الاكتمال» rows are dropped", () => {
  const card = {
    main: [
      { key: "حالة التشريع", value: "ساري (بحاجة تحقق حي — لا رقم/تاريخ إصدار مؤكَّد في المصدر المستخرَج)" },
      { key: "\u26A0\uFE0F حالة المراجعة", value: "ملف مُستخرَج حديثاً من PDF حي (2026-07-23)؛ يُوصى بمراجعة قبل الاعتماد — راجع `review_note`" },
      { key: "الجهة المصدرة", value: "مجلس الوزراء" },
    ],
    more: [
      { key: "حالة النفاذ", value: "\u26A0\uFE0F لم يدخل حيز التنفيذ بعد — يعمل به بعد 90 يوماً من تاريخ نشره (المادة 15)" },
      { key: "**\u26A0\uFE0F حالة الاكتمال**", value: "**ملف جزئي — راجع حقل `source_note`" },
      { key: "الحالة", value: "لم يُتحقّق من الحالة" },
      { key: "مادة الإحالة", value: "راجع المادة (5)" },
    ],
  };
  for (const isSubscriber of [true, false]) {
    const out = cardForViewer(card, isSubscriber);
    assert.deepEqual(out?.main.find((r) => r.key === "حالة التشريع")?.value, "ساري", String(isSubscriber));
    const sent = JSON.stringify(out);
    for (const note of ["بحاجة تحقق", "حالة المراجعة", "حالة الاكتمال", "ملف جزئي", "لم يُتحقّق", "مؤكَّد"]) {
      assert.ok(!sent.includes(note), `${note} (${isSubscriber})`);
    }
  }
  const sub = cardForViewer(card, true);
  assert.deepEqual(sub?.more, [
    { key: "حالة النفاذ", value: "لم يدخل حيز التنفيذ بعد" },
    // Not a status key: a subscriber's other rows are as the file has them.
    { key: "مادة الإحالة", value: "راجع المادة (5)" },
  ]);
});

test("with a recorded status, the file's cleaned status row equal to the badge is not repeated behind «المزيد»", () => {
  const out = lawReaderExtras(
    PREAMBLE.replace("ساري — معدّل، آخر تحديث بقرار وزير العدل رقم (512)", "ساري (بحاجة تحقق حي — لا رقم/تاريخ إصدار مؤكَّد في المصدر المستخرَج)"),
    true,
  );
  assert.ok(out.metadata_card);
  const layout = lawCardLayout(out.metadata_card, { status: { labelAr: "ساري", labelEn: "Active", tone: "effective" } });
  assert.equal(layout.primary.find((f) => f.id === "status")?.source, "db");
  assert.ok(!layout.more.some((f) => f.key === "حالة التشريع"), JSON.stringify(layout.more));
});
