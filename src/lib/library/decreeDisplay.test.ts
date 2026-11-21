import test from "node:test";
import assert from "node:assert/strict";
import { decreeCategoryLabel, decreePreambleForDisplay, hasBlockMarkup, pageSnippet } from "./decreeDisplay.ts";

/** The shape of decree م/115 in screenshot lib07 (owner file 03 L9). */
const LIB07 = [
  "# مرسوم ملكي رقم م/115 وتاريخ 1439/12/05هـ",
  "",
  "<details open>",
  "<summary>📝 موجز القرار (خلاصة سريعة)</summary>",
  "",
  "> الموضوع: تعديل نظام المرور",
  "> القرار المتخذ: - المادة الأولى",
  "",
  "</details>",
  "",
  "### 📊 بطاقة تعريف المرسوم/القرار",
  "",
  "| الحقل | القيمة |",
  "| :--- | :--- |",
  "| **نوع الوثيقة** | مرسوم ملكي |",
  "| **رقم الأداة وتاريخها** | مرسوم ملكي رقم (م/115) وتاريخ 1439-12-05هـ |",
  "| **الجهة المصدرة** | الديوان الملكي |",
  "",
  "## الديباجة",
  "",
  "بعون الله تعالى، نحن سلمان بن عبدالعزيز آل سعود، ملك المملكة العربية السعودية، بعد الاطلاع على **المادة الأولى** …",
].join("\n");

test("L9-a lib07: the موجز leaves the preamble, the card becomes rows, the prose stays word for word", () => {
  const out = decreePreambleForDisplay(LIB07);
  assert.ok(!out.text.includes("موجز"), out.text);
  assert.ok(!out.text.includes("الموضوع: تعديل نظام المرور"), "the موجز is the summary box's, never repeated");
  assert.ok(!/<details|<summary|\|\s*:?-{3}/.test(out.text), out.text);
  assert.ok(out.text.includes("بعون الله تعالى، نحن سلمان بن عبدالعزيز آل سعود"), out.text);
  assert.ok(out.card, "the identity card is lifted out");
  const keys = out.card!.main.map((f) => f.key);
  assert.ok(keys.includes("نوع الوثيقة"), keys.join("|"));
  assert.ok(keys.includes("الجهة المصدرة"), keys.join("|"));
  for (const f of out.card!.main) assert.ok(!f.key.includes("**") && !f.value.includes("**"), `${f.key}: ${f.value}`);
});

test("L9-a: what is left is Markdown for MD — no raw tag or table row survives", () => {
  const { text } = decreePreambleForDisplay(LIB07);
  // The renderer draws headings and bold; the only marks left are ones it draws.
  for (const line of text.split("\n")) {
    assert.ok(!/^\s*\|/.test(line), line);
    assert.ok(!/<\/?(?:details|summary)/i.test(line), line);
  }
});

test("L9-a: a preamble that was only the title, the موجز and the card shows no section", () => {
  const onlyBlocks = LIB07.split("## الديباجة")[0];
  assert.deepEqual(decreePreambleForDisplay(onlyBlocks).text, "");
  assert.deepEqual(decreePreambleForDisplay("").text, "");
  assert.deepEqual(decreePreambleForDisplay(null), { text: "", card: null });
});

test("L9-a: a plain preamble passes unchanged", () => {
  const plain = "بعون الله تعالى\nنحن ملك المملكة العربية السعودية\nرسمنا بما هو آت";
  assert.deepEqual(decreePreambleForDisplay(plain), { text: plain, card: null });
});

test("L9-a: hasBlockMarkup — headings, <details>, tables yes; bold and plain prose no", () => {
  assert.equal(hasBlockMarkup("### المادة الأولى\nنص"), true);
  assert.equal(hasBlockMarkup("نص\n<details>\n<summary>x</summary>\n</details>"), true);
  assert.equal(hasBlockMarkup("| أ | ب |\n| --- | --- |\n| 1 | 2 |"), true);
  assert.equal(hasBlockMarkup("المادة الثانية: **١-** الطريق: كل سبيل مفتوح"), false);
  assert.equal(hasBlockMarkup("رقم #5 في السطر"), false);
  assert.equal(hasBlockMarkup(null), false);
});

test("L9-b lib07: the side-list snippet has no Markdown marks", () => {
  assert.equal(pageSnippet("المادة الثانية: **١-** الطريق: كل سبيل مفتوح للسير العام"), "المادة الثانية: ١- الطريق: كل سبيل مفتوح للسي...");
  assert.equal(pageSnippet("### المادة الأولى\nنص", 45), "المادة الأولى نص");
  assert.equal(pageSnippet("<details><summary>x</summary>y</details>"), "x y");
  assert.equal(pageSnippet(""), "");
});

test("New 5 lib07: «تصنيف الملف» is the section's name; an unknown code hides the row", () => {
  assert.equal(decreeCategoryLabel("30"), "الأوامر والتعاميم والمراسيم");
  assert.equal(decreeCategoryLabel("SA-30"), "الأوامر والتعاميم والمراسيم");
  assert.equal(decreeCategoryLabel("8"), "المالي والمصرفي");
  assert.equal(decreeCategoryLabel("08", false), "Financial & Banking");
  assert.equal(decreeCategoryLabel("77"), null);
  assert.equal(decreeCategoryLabel(""), null);
  assert.equal(decreeCategoryLabel(null), null);
});

test("Q101: a non-subscriber never reads a decree's number or date in its title", async () => {
  const { decreeTitleForViewer } = await import("./decreeDisplay.ts");
  const row = { title: "مرسوم ملكي رقم م/115 وتاريخ 1439/12/05ه", type: "royal_decree", summary: "الموضوع: تعديل نظام المرور" };
  const guest = decreeTitleForViewer(row, false);
  assert.ok(guest.trim() !== "", "never empty");
  assert.doesNotMatch(guest, /115|1439|م\/|[٠-٩]{3}/, guest);
  assert.match(guest, /مرسوم ملكي/);
  assert.equal(decreeTitleForViewer(row, true), row.title);
  // nothing safe left → the type label or the generic name, never ''
  const bare = decreeTitleForViewer({ title: "رقم 4567 وتاريخ 1440/1/1هـ", type: "unknown" }, false);
  assert.ok(bare.trim() !== "" && !/4567|1440/.test(bare), bare);
  // a title with no number passes as it is
  assert.equal(decreeTitleForViewer({ title: "تعميم بشأن الإجراءات", type: "circular" }, false), "تعميم بشأن الإجراءات");
});
