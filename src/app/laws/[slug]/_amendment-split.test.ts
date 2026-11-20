/**
 * O12 / T14b (batch l11), owner file 16 §3–§4: «تعديل:» and «نص … قبل التعديل»
 * out of the current text, one card per version, and a diff against the
 * clean text. Fixtures follow نظام القضاء, article 1, as the 10-03 corpus
 * writes it (the tail of «سابعاً» of the executive mechanism) and as the
 * reader showed it in screenshots 03 and 04.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "src/app/laws/[slug]/_amendment-split.test.ts"
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  diffCandidates,
  mergeLiftedVersions,
  paragraphsOf,
  pickDiffTarget,
  splitAmendmentText,
  versionKey,
} from "./_amendment-split.ts";
import { visibleAmendments } from "./_previous-versions.ts";

const CURRENT = "القضاة مستقلون، لا سلطان عليهم في قضائهم لغير أحكام الشريعة الإسلامية والأنظمة المرعية، وليس لأحد التدخل في القضاء.";
const P5_BEFORE_113 =
  "استمرار الهيئات الابتدائية لتسوية الخلافات العمالية والهيئة العليا لتسوية الخلافات العمالية، في النظر في الدعاوى العمالية، واستمرار العمل بلائحة المرافعات أمام تلك الهيئات وبالباب (الرابع عشر) من نظام العمل الصادر بالمرسوم الملكي رقم (م/51) بتاريخ 1426/8/23ه، الخاص بهيئات تسوية الخلافات العمالية، وذلك فيما يتعلق بالدعاوى المقيدة لديها قبل مباشرة المحاكم العمالية اختصاصاتها إلى أن يصدر بها قرار نهائي يتضمن الفصل في الدعوى.";
const P5_ORIGINAL =
  "استمرار الهيئات الابتدائية لتسوية الخلافات العمالية والهيئة العليا لتسوية الخلافات العمالية ؛ في النظر في الدعاوى العمالية ، واستمرار العمل بلائحة المرافعات أمام تلك الهيئات ، وذلك حتى تنشأ المحاكم العمالية وتباشر اختصاصاتها .";
const P7_ORIGINAL =
  "يحدد المجلس الأعلى للقضاء فترة انتقالية - بعد تعديل نظام المرافعات الشرعية ونظام الإجراءات الجزائية - لتباشر بعدها المحاكم العمالية اختصاصاتها المنصوص عليها نظاماً، وتنتقل بعد ذلك القضايا القائمة وما يتعلق بها من هيئات تسوية الخلافات العمالية والهيئة العليا لتسوية الخلافات العمالية إلى المحاكم العمالية للفصل فيها ، وذلك بالتنسيق بين رئيس المجلس الأعلى للقضاء ووزير العمل والتنمية الاجتماعية ، ويراعى في ذلك الاختصاص المكاني ، وتحاط وزارة العدل بما تم من ترتيبات في هذا الشأن .";
const REG_NAME = "آلية العمل التنفيذية لنظام القضاء ونظام ديوان المظالم";

/** The leaked tail: what the old loader left after the regulation cut at the م/113 anchor. */
const LEAKED_TAIL = [
  ">",
  "> > **🔄 تعديل:** عدلت الفقرة (5) بموجب المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09ه لتصبح بالنص الظاهر في بند (5) أعلاه.",
  ">",
  "> > **ونص الفقرة (5) قبل هذا التعديل (كما عدلت بالمرسوم م/6):**",
  ">",
  `> > "${P5_BEFORE_113}"`,
  ">",
  ">",
  ">",
  '> <!-- AMENDMENT {"type": "تعديل", "decree": "المرسوم الملكي رقم (م/6) وتاريخ 1440/01/02ه", "date": "1440/01/02ه", "source": "NCAR_UMM_ALQURA_4746"} -->',
  ">",
  "> > **🔄 تعديل:** عدلت الفقرة (5) وحذفت عبارة من الفقرة (7) بموجب المرسوم الملكي رقم (م/6) وتاريخ 1440/01/02ه.",
  ">",
  "> > **ونص الفقرة (5) الأصلي قبل التعديل:**",
  ">",
  `> > "${P5_ORIGINAL}"`,
  ">",
  "> > **ونص الفقرة (7) الأصلي قبل التعديل وحذف العبارة منها:**",
  ">",
  `> > "${P7_ORIGINAL}"`,
  ">",
  ">",
  "> </details>",
  "",
];
const LIVE_TEXT = [CURRENT, "", "### القسم الأول: آلية العمل التنفيذية لنظام القضاء", "", ...LEAKED_TAIL].join("\n");

/** The five rows the reader received for it (l9-reader report; screenshot 04). */
const ROWS = [
  { date: "1443/11/09هـ", source: "المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09هـ", summary: "📜 الإصدارات السابقة", fullText: "" },
  { date: "1440/01/02هـ", source: "المرسوم الملكي رقم (م/6) وتاريخ 1440/01/02هـ", summary: "", fullText: "" },
  { date: null, source: null, summary: "", fullText: `> "${P5_BEFORE_113}"` },
  { date: null, source: null, summary: "", fullText: `> "${P5_ORIGINAL}"` },
  { date: null, source: null, summary: "", fullText: `> "${P7_ORIGINAL}"` },
];

test("file 16 §3: article 1 of نظام القضاء keeps its current paragraph only", () => {
  const { current, lifted } = splitAmendmentText(LIVE_TEXT, [REG_NAME]);
  assert.equal(current, CURRENT, "no note, no superseded text, no dangling heading");
  assert.equal(lifted.length, 2, "one group per amendment (م/113, م/6)");
  assert.match(lifted[0].note, /^تعديل: عدلت الفقرة \(5\) بموجب المرسوم الملكي رقم \(م\/113\)/);
  assert.deepEqual(lifted[0].parts.map((p) => p.label), ["ونص الفقرة (5) قبل هذا التعديل (كما عدلت بالمرسوم م/6)"]);
  assert.equal(lifted[1].decree, "المرسوم الملكي رقم (م/6) وتاريخ 1440/01/02ه", "the anchor's decree");
  assert.equal(lifted[1].parts.length, 2, "¶5 and ¶7 under the same م/6 note");
  for (const v of lifted) for (const p of v.parts) assert.doesNotMatch(p.text, /^\s*>/m, "no quote mark left");
});

test("file 16 §4: 5 rows + the leaked text → exactly 2 cards, newest first, count = cards, none empty", () => {
  const { lifted } = splitAmendmentText(LIVE_TEXT, [REG_NAME]);
  const cards = visibleAmendments(mergeLiftedVersions(ROWS, lifted, true));
  assert.equal(cards.length, 2);
  assert.match(cards[0].summary, /م\/113/, "م/113 (1443) before م/6 (1440)");
  assert.match(cards[1].summary, /م\/6/);
  assert.equal(cards[0].parts?.length, 1);
  assert.equal(cards[1].parts?.length, 2);
  for (const c of cards) {
    assert.equal(c.textMissing, false);
    for (const p of c.parts ?? []) assert.ok(!p.text.startsWith('"'), "no wrapping quotes");
  }
  // The two ¶5 wordings differ only by «،» / «؛» and spacing: never merged into one.
  assert.notEqual(versionKey(P5_BEFORE_113), versionKey(P5_ORIGINAL));
});

test("a viewer without official metadata: the note and decree are withheld, the wordings stay", () => {
  const { lifted } = splitAmendmentText(LIVE_TEXT, [REG_NAME]);
  const locked = ROWS.map((r) => ({ ...r, date: null, source: null, sourceLocked: true }));
  const cards = visibleAmendments(mergeLiftedVersions(locked, lifted, false));
  assert.equal(cards.length, 2, "the withheld decree-only rows are not cards (lock line only)");
  for (const c of cards) {
    assert.equal(c.sourceLocked, true);
    assert.equal(c.summary, "");
    assert.equal(c.source, "");
    assert.ok((c.parts?.length ?? 0) > 0);
  }
  assert.ok(cards[0].parts?.[0].text.startsWith("استمرار الهيئات"), "still newest first (the hidden order key)");
});

test("idempotent: clean text and positioned rows stay as they are", () => {
  const { current, lifted } = splitAmendmentText(CURRENT, [REG_NAME]);
  assert.equal(current, CURRENT);
  assert.deepEqual(lifted, []);
  const rows = [
    { date: "1443/11/09", source: "م/113", summary: "", fullText: "نص أ", position: 0 },
    { date: "1440/01/02", source: "م/6", summary: "", fullText: "نص ب", position: 1 },
  ];
  assert.equal(visibleAmendments(mergeLiftedVersions(rows, lifted, true)).length, 2);
  // CRLF text keeps its line endings when nothing is lifted.
  const crlf = `${CURRENT}\r\n\r\nالفقرة الثانية.`;
  assert.equal(splitAmendmentText(crlf).current, crlf);
});

test("never lifted: a definitions list, a note in the middle, an unquoted multi-paragraph run, a <details> block", () => {
  const defs = ["يقصد بالألفاظ الآتية:", "**الإلغاء** : إنهاء العمل بالحكم.", "**التعديل** : تغيير الحكم."].join("\n");
  assert.equal(splitAmendmentText(defs).current, defs);
  const middle = ["النص الحالي.", "**🔄 تعديل:** عدلت الفقرة (1).", "**ونص الفقرة (1) قبل التعديل:**", "النص القديم.", "", "فقرة حالية بعدها."].join("\n");
  assert.equal(splitAmendmentText(middle).current, middle, "current text follows: the run is not trailing");
  const twoParas = ["النص الحالي.", "**النص قبل التعديل:**", "الفقرة القديمة الأولى.", "", "قد تكون هذه فقرة حالية."].join("\n");
  assert.equal(splitAmendmentText(twoParas).current, twoParas, "an unquoted body is one paragraph, never «to the end»");
  const folded = ["النص الحالي.", "<details>", "<summary>📜 الإصدارات السابقة</summary>", "**🔄 تعديل:** عدلت.", "**النص قبل التعديل:**", "قديم.", "</details>"].join("\n");
  assert.equal(splitAmendmentText(folded).current, folded, "a <details> block is the MD toggle's, not lifted");
  // Quoted current text after a deeper quoted history block ends the run: nothing lifted.
  const shallower = ["> > **🔄 تعديل:** عدلت الفقرة (2).", "> > **النص قبل التعديل:**", "> > قديم.", "> 3. فقرة حالية من اللائحة."].join("\n");
  assert.equal(splitAmendmentText(`النص.\n${shallower}`).current, `النص.\n${shallower}`);
});

test("an unquoted trailing history is lifted: note, label and its one paragraph", () => {
  const text = ["النص الحالي للمادة.", "", "تعديل: عُدّلت هذه المادة بموجب المرسوم الملكي رقم (م/9) وتاريخ 1440/05/01هـ.", "**النص قبل التعديل:**", "النص القديم للمادة."].join("\n");
  const { current, lifted } = splitAmendmentText(text);
  assert.equal(current, "النص الحالي للمادة.");
  assert.equal(lifted.length, 1);
  assert.deepEqual(lifted[0].parts, [{ label: "النص قبل التعديل", text: "النص القديم للمادة." }]);
});

test("a dangling heading goes only when it names one of the article's regulations", () => {
  const text = `${CURRENT}\n\n### القسم الأول: آلية العمل التنفيذية لنظام القضاء\n`;
  assert.equal(splitAmendmentText(text, [REG_NAME]).current, CURRENT);
  assert.equal(splitAmendmentText(text, []).current, text, "no regulation: the heading stays");
  const other = `${CURRENT}\n\n### الفصل الثاني: أحكام عامة`;
  assert.equal(splitAmendmentText(other, [REG_NAME]).current, other);
});

test("the diff target: the paragraph a wording shares most words with, or none", () => {
  const regulation = [
    "> 5. **إنهاء أعمال هيئات تسوية الخلافات العمالية، وإنهاء العمل بلائحة المرافعات أمام تلك الهيئات، وبالباب (الرابع عشر) من نظام العمل الصادر بالمرسوم الملكي رقم (م/51) بتاريخ 1426/8/23ه الخاص بهيئات تسوية الخلافات العمالية، بمضي (ستة) أشهر من تاريخه.**",
    ">",
    "> 7. **يحدد المجلس الأعلى للقضاء فترة انتقالية - بعد تعديل نظام المرافعات الشرعية ونظام الإجراءات الجزائية - لتباشر بعدها المحاكم العمالية اختصاصاتها المنصوص عليها نظاماً.**",
  ].join("\n");
  const cands = diffCandidates(CURRENT, regulation);
  assert.ok(cands.length >= 3);
  assert.match(pickDiffTarget(P7_ORIGINAL, cands) ?? "", /^7\. يحدد المجلس الأعلى للقضاء/, "¶7 against the regulation's ¶7");
  assert.match(pickDiffTarget(P5_BEFORE_113, cands) ?? "", /^5\. إنهاء أعمال هيئات/, "¶5 against the regulation's ¶5");
  assert.equal(pickDiffTarget(P7_ORIGINAL, diffCandidates(CURRENT)), null, "article 1's own text is unrelated: no diff");
  // A whole earlier wording of the article itself is compared with the article.
  assert.equal(pickDiffTarget("القضاة مستقلون، لا سلطان عليهم في قضائهم لغير أحكام الشريعة.", diffCandidates(CURRENT)), CURRENT);
  assert.deepEqual(paragraphsOf("> 1. أ\n> 2. ب\n\nج"), ["1. أ", "2. ب", "ج"]);
});

test("the reader: one choke point in the page mapping, cards from the merge, diff target per part", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(page, /const split = isRepealedArticleStatus\(a\.status \|\| ""\) \? null : splitAmendmentText\(a\.text \|\| '', regulationNamesOf\(a\)\);/);
  assert.match(page, /text: split \? split\.current : a\.text \|\| '',/);
  assert.match(page, /liftedVersions: split && a\.free !== false \? split\.lifted : undefined,/);
  const reader = readFileSync(new URL("./_article-components.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(reader, /visibleAmendments\(mergeLiftedVersions\(article\.amendments, article\.liftedVersions, showAmendmentSource\)\)/);
  assert.match(reader, /\(isAmended \|\| \(article\.liftedVersions\?\.length \?\? 0\) > 0\) && previousVersions\.length > 0/);
  assert.match(reader, /currentText=\{pickDiffTarget\(/);
});

test("the reader: the «معدّلة» badge opens the history; an empty toggle is not drawn", () => {
  const reader = readFileSync(new URL("./_article-components.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(reader, /<details\n\s*ref=\{historyRef\}/);
  assert.match(reader, /const d = historyRef\.current;\n\s*if \(!d\) return;\n\s*d\.open = true;/);
  assert.ok(reader.includes('if (!(block.content ?? "").replace(/^[\\s>]*$/gm, "").trim()) return null;'), "no empty toggle");
  // The non-subscriber rule is passed from the page, as the law API applies it to the rows.
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.equal((page.match(/showAmendmentSource=\{viewerIsSubscriber === true && !officialMeta\.locked\}/g) ?? []).length, 2);
});

test("a stored row with the same wording but small differences is still one card; two real versions stay two", async () => {
  const { wordF1, SAME_VERSION_F1 } = await import("./_amendment-split.ts");
  assert.ok(wordF1(P5_BEFORE_113, P5_ORIGINAL) < SAME_VERSION_F1, "the two ¶5 wordings are two versions");
  const { lifted } = splitAmendmentText(LIVE_TEXT, [REG_NAME]);
  const noisy = ROWS.map((r) => (r.fullText ? { ...r, fullText: `> > ${r.fullText.replace(/،/g, " ، ").replace(/\.$/, "")}  ` } : r));
  assert.equal(visibleAmendments(mergeLiftedVersions(noisy, lifted, true)).length, 2);
});
