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
