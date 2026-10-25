/**
 * N1.2 — the law preamble is not split on the template's `***` rules. The
 * standard file template puts `***` between the موجز block, the identity card
 * and the H1, so splitting on it labelled the card and the title
 * «اللائحة التنفيذية». Only the REGULATION_PREAMBLE marker splits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGULATION_PREAMBLE_SEPARATOR, joinStoredPreamble, splitStoredPreamble } from "./splitPreamble.ts";

/** Shaped like library.laws.preamble of `precious-metals-customer-due-diligence-guide` (local export 2026-10-16). */
const PRECIOUS_METALS = [
  "<details open>",
  "<summary>📝 موجز المستند (خلاصة سريعة)</summary>",
  "",
  "> **الموضوع والقرار المتخذ:** يهدف الدليل إلى مساعدة تجار المعادن الثمينة على الامتثال.",
  "",
  "</details>",
  "",
  "***",
  "",
  "### 📊 بطاقة تعريف الوثيقة",
  "",
  "| الحقل | القيمة |",
  "| :--- | :--- |",
  "| **نوع الوثيقة** | دليل إرشادي |",
  "| **الجهة المصدرة** | وزارة التجارة |",
  "",
  "***",
  "",
  "# الدليل الإرشادي بشأن العناية الواجبة بالعميل",
  "",
  "",
  "",
  "***",
  "",
  "## صفحات الدليل",
].join("\n");

const REG = "قرار وزير التجارة رقم (284) وتاريخ 1444/6/23هـ\nأولاً: الموافقة على اللائحة التنفيذية لنظام الشركات بالصيغة المرافقة.";

test("the template's *** rules never make a regulation preamble", () => {
  const out = splitStoredPreamble(PRECIOUS_METALS);
  assert.equal(out.regulationPreamble, "");
  assert.equal(out.preamble, PRECIOUS_METALS.trim());
  assert.match(out.preamble, /بطاقة تعريف الوثيقة/);
  assert.match(out.preamble, /^# الدليل الإرشادي/m);
});

test("a single *** with plain decree prose after it stays in the law preamble too", () => {
  const text = "# نظام\n\n***\n\n**قرار مجلس الوزراء رقم (104) وتاريخ 07 / 07 / 1379ه**\n\nإن مجلس الوزراء…";
  assert.deepEqual(splitStoredPreamble(text), { preamble: text.trim(), regulationPreamble: "" });
});

test("the marker the seeder writes splits the two", () => {
  const stored = joinStoredPreamble(PRECIOUS_METALS, REG);
  assert.ok(stored.includes(REGULATION_PREAMBLE_SEPARATOR));
  const out = splitStoredPreamble(stored);
  assert.equal(out.preamble, PRECIOUS_METALS.trim());
  assert.equal(out.regulationPreamble, REG);
});

test("no regulation preamble → the stored text is the preamble, unchanged", () => {
  assert.equal(joinStoredPreamble(PRECIOUS_METALS, ""), PRECIOUS_METALS);
  assert.equal(joinStoredPreamble("", undefined), "");
  assert.equal(joinStoredPreamble(null, null), "");
});

test("a REGULATION_PREAMBLE block left inside the file's preamble is lifted out", () => {
  // extractPreamble keeps everything above the first ARTICLE/CHAPTER anchor,
  // so a block written there arrives inside the preamble, `>`-quoted.
  const stored = [
    "# نظام الشركات",
    "",
    "<!-- REGULATION_PREAMBLE -->",
    "> قرار وزير التجارة رقم (284) وتاريخ 1444/6/23هـ",
    "> أولاً: الموافقة على اللائحة التنفيذية لنظام الشركات بالصيغة المرافقة.",
    "<!-- REGULATION_PREAMBLE_END -->",
    "",
    "***",
    "",
    "## المواد",
  ].join("\n");
  const out = splitStoredPreamble(stored);
  assert.equal(out.regulationPreamble, REG);
  assert.doesNotMatch(out.preamble, /REGULATION_PREAMBLE|قرار وزير التجارة/);
  assert.match(out.preamble, /^# نظام الشركات/);
  assert.match(out.preamble, /## المواد$/);
});

test("a legacy row (block inside AND the seeder's old `***` + copy appended) drops the duplicate", () => {
  const filePreamble = "# نظام الشركات\n\n<!-- REGULATION_PREAMBLE -->\n> قرار وزير التجارة رقم (284) وتاريخ 1444/6/23هـ\n> أولاً: الموافقة على اللائحة التنفيذية لنظام الشركات بالصيغة المرافقة.\n<!-- REGULATION_PREAMBLE_END -->";
  const legacy = `${filePreamble}\n***\n${REG}`;
  const out = splitStoredPreamble(legacy);
  assert.equal(out.regulationPreamble, REG);
  assert.equal(out.preamble, "# نظام الشركات");
});

test("no marker text ever reaches the reader", () => {
  for (const stored of [joinStoredPreamble("أ", "ب"), joinStoredPreamble("أ\n***\nج", "ب")]) {
    const out = splitStoredPreamble(stored);
    assert.doesNotMatch(out.preamble + out.regulationPreamble, /<!--/);
  }
});

test("empty and non-string input", () => {
  assert.deepEqual(splitStoredPreamble(""), { preamble: "", regulationPreamble: "" });
  assert.deepEqual(splitStoredPreamble(null), { preamble: "", regulationPreamble: "" });
  assert.deepEqual(splitStoredPreamble(undefined), { preamble: "", regulationPreamble: "" });
});

test("the seeder does not write the block twice when the file kept it in its preamble", () => {
  const filePreamble = "# نظام\n<!-- REGULATION_PREAMBLE -->\n> قرار\n<!-- REGULATION_PREAMBLE_END -->\n***\n## المواد";
  const stored = joinStoredPreamble(filePreamble, "قرار");
  assert.equal(stored, filePreamble);
  assert.deepEqual(splitStoredPreamble(stored), { preamble: "# نظام\n\n***\n## المواد", regulationPreamble: "قرار" });
});

// ─── Rows loaded by the OLD seeder (no marker): `${preamble}\n***\n${reg}` ──
// Live rows keep that shape until the owner's next load. The old seeder
// appended the parser's trimmed regulation_preamble after a tight `\n***\n` at
// the very END of the trimmed preamble (git show 58ab027c:scripts/seed-library.ts).
// Measured over the owner corpus (last_owner, 1,529 laws): the two rows of that
// shape split back exactly, and no plain preamble splits.

/** The old seeder's join, verbatim. */
const oldSeederJoin = (preamble: string, reg: string) => preamble + (reg ? `\n***\n${reg}` : "");

/** Shaped like civil-service-law: the law preamble ends with `</details>` + `---`. */
const CIVIL_SERVICE_LAW = [
  "<details>",
  "<summary>📜 ديباجة المرسوم الملكي</summary>",
  "",
  "يقرر ما يلي: الموافقة على نظام الخدمة المدنية بالصيغة المرافقة لهذا.",
  "",
  "**النائب الثاني لرئيس مجلس الوزراء**",
  "",
  "</details>",
  "",
  "***",
  "",
  "# نظام الخدمة المدنية",
  "",
  "---",
].join("\n");
const CIVIL_SERVICE_REG = [
  "**اللائحة التنفيذية للموارد البشرية في الخدمة المدنية**",
  "*(صادرة بقرار وزير الخدمة المدنية رقم 1550 وتاريخ 1440/06/09هـ)*",
  "## الباب الأول: التعريفات والأحكام العامة",
].join("\n");

/** Shaped like nazaha-anti-corruption-commission-law: the regulation preamble is a level-5 heading. */
const NAZAHA_LAW = "# نظام هيئة الرقابة ومكافحة الفساد\n\n***\n\n<details>\n<summary>ديباجة</summary>\n\nرئيس مجلس الوزراء\n\n</details>\n\n\n## المواد";
const NAZAHA_REG = "##### ديباجة النظام الملكي رقم (أ/303) وتاريخ 1446/07/30ه\nبسم الله الرحمن الرحيم\nأمرنا بما هو آت:\nسلمان بن عبدالعزيز آل سعود\n---";

test("legacy row: an old-seeder join (civil-service shape) splits back exactly", () => {
  const out = splitStoredPreamble(oldSeederJoin(CIVIL_SERVICE_LAW, CIVIL_SERVICE_REG));
  assert.equal(out.preamble, CIVIL_SERVICE_LAW);
  assert.equal(out.regulationPreamble, CIVIL_SERVICE_REG);
});

test("legacy row: an old-seeder join (nazaha shape, ##### ديباجة) splits back exactly", () => {
  const out = splitStoredPreamble(oldSeederJoin(NAZAHA_LAW, NAZAHA_REG));
  assert.equal(out.preamble, NAZAHA_LAW);
  assert.equal(out.regulationPreamble, NAZAHA_REG);
});

test("legacy row: an empty law preamble joined by the old seeder still splits", () => {
  assert.deepEqual(splitStoredPreamble(oldSeederJoin("", CIVIL_SERVICE_REG)), { preamble: "", regulationPreamble: CIVIL_SERVICE_REG });
});

test("legacy fallback: a tight template seam before «## المواد» is not a regulation", () => {
  // نظام العمل / نظام الانضباط الوظيفي: the last `***` is tight on both sides.
  const text = "<details>\n<summary>ديباجة</summary>\n\nرئيس مجلس الوزراء\n\n</details>\n***\n## المواد";
  assert.deepEqual(splitStoredPreamble(text), { preamble: text, regulationPreamble: "" });
});

test("legacy fallback: the treaty template's «[نص ديباجة القرار …]» rules are not a regulation", () => {
  // Section 29: tight `***` rules around a placeholder line that says ديباجة.
  const text = "<details>\n<summary>📄 ديباجة القرار والتمهيد</summary>\n***\n[نص ديباجة القرار مستخرج بصرياً]\n***\n</details>\n\n### الصفحة 1\nبعون الله تعالى";
  assert.deepEqual(splitStoredPreamble(text), { preamble: text, regulationPreamble: "" });
  // …even if the placeholder were the tail.
  const tail = "<summary>📄 ديباجة القرار والتمهيد</summary>\n***\n[نص ديباجة القرار مستخرج بصرياً]";
  assert.deepEqual(splitStoredPreamble(tail), { preamble: tail, regulationPreamble: "" });
});

test("legacy fallback: plain prose after a tight *** stays in the law preamble", () => {
  // GCC rules: «…المواثيق\n***\nوافق المجلس الأعلى…» — no heading, no لائحة.
  const text = "واتساقاً مع المواثيق\n***\nوافق المجلس الأعلى لمجلس التعاون لدول الخليج العربية في دورته (44)";
  assert.deepEqual(splitStoredPreamble(text), { preamble: text, regulationPreamble: "" });
  // A heading that names neither لائحة nor ديباجة does not split either.
  const heading = "# نظام\n***\n## الباب الأول: أحكام عامة";
  assert.deepEqual(splitStoredPreamble(heading), { preamble: heading, regulationPreamble: "" });
});

test("legacy fallback: a *** with blank lines around it (the template's rule) never splits", () => {
  const text = "# نظام\n\n***\n\n**اللائحة التنفيذية**\nنص";
  assert.deepEqual(splitStoredPreamble(text), { preamble: text, regulationPreamble: "" });
});

test("the precious-metals shape stays whole under the fallback too", () => {
  assert.deepEqual(splitStoredPreamble(PRECIOUS_METALS), { preamble: PRECIOUS_METALS.trim(), regulationPreamble: "" });
});
