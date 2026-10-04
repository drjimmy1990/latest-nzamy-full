import { test } from "node:test";
import assert from "node:assert/strict";
import { articleDisplayLabel, articleLocatorText, cleanNumberText, leadingOrdinal } from "./_article-label.ts";

test("keeps a normal locator as the source wrote it", () => {
  assert.equal(articleDisplayLabel("المادة الأولى", 1), "المادة الأولى");
  assert.equal(articleDisplayLabel("المادة (12)", 12), "المادة (12)");
  assert.equal(articleDisplayLabel("أولاً", 1), "أولاً");
  assert.equal(articleDisplayLabel("10-1", 10), "10-1");
});

test("strips markdown heading marks and the trailing colon", () => {
  assert.equal(cleanNumberText("### المادة (1):"), "المادة (1)");
  assert.equal(articleDisplayLabel("### المادة (1):", 1), "المادة (1)");
  assert.equal(articleDisplayLabel("# المادة الثالثة", 3), "المادة الثالثة");
});

test("an instrument name in place of a number falls back to «المادة N»", () => {
  assert.equal(articleDisplayLabel("اللائحة التنفيذية لنظام العمل", 7), "المادة 7");
  assert.equal(articleDisplayLabel("لائحة عمال الخدمة المنزلية ومن في حكمهم:", 2), "المادة 2");
  assert.equal(articleDisplayLabel("نظام العمل", 4), "المادة 4");
});

test("a zero or missing number is never printed as «المادة 0»", () => {
  assert.equal(articleDisplayLabel("المادة الأولى:", 0), "المادة الأولى");
  assert.equal(articleDisplayLabel("اللائحة التنفيذية لنظام العمل", 0), "اللائحة التنفيذية لنظام العمل");
  assert.equal(articleDisplayLabel("", 0), "");
});

test("empty text uses the number; no number keeps whatever text exists", () => {
  assert.equal(articleDisplayLabel("", 5), "المادة 5");
  assert.equal(articleDisplayLabel(null, 5), "المادة 5");
  assert.equal(articleDisplayLabel("اللائحة التنفيذية لنظام العمل", null), "اللائحة التنفيذية لنظام العمل");
});

test("articleLocatorText keeps a real locator, cleaned of heading marks", () => {
  assert.equal(articleLocatorText("### المادة (1):", 1), "المادة (1)");
  assert.equal(articleLocatorText("المادة الأولى:", 0), "المادة الأولى");
  assert.equal(articleLocatorText("السادسة والأربعون", 46), "السادسة والأربعون");
  assert.equal(articleLocatorText("10-1", 10), "10-1");
  // A page marker is the source's own position; the citation builder
  // recognises it and cites it as a page, so it is passed through.
  assert.equal(articleLocatorText("الصفحة 3", 0), "الصفحة 3");
});

test("articleLocatorText is null for a title, a sentence, or nothing — never a synthesised «المادة N»", () => {
  assert.equal(articleLocatorText("اللائحة التنفيذية لنظام العمل", 7), null);
  assert.equal(articleLocatorText("لائحة عمال الخدمة المنزلية ومن في حكمهم:", 2), null);
  assert.equal(articleLocatorText("اللائحة التنفيذية لنظام العمل", 0), null);
  assert.equal(articleLocatorText("", 5), null);
  assert.equal(articleLocatorText(null, 5), null);
  assert.equal(articleLocatorText("   :  ", 5), null);
  const sentence = "يجب على صاحب العمل أن يوفر للعامل بيئة عمل آمنة وأن يتخذ جميع الاحتياطات اللازمة لحمايته";
  assert.ok(sentence.length > 60);
  assert.equal(articleLocatorText(sentence, 3), null);
});

test("the display label is the locator when there is one, else the fallback", () => {
  for (const [text, n] of [
    ["### المادة (1):", 1], ["اللائحة التنفيذية لنظام العمل", 7], ["", 5], ["أولاً", 1],
  ] as const) {
    const locator = articleLocatorText(text, n);
    if (locator !== null) assert.equal(articleDisplayLabel(text, n), locator);
    else assert.equal(articleDisplayLabel(text, n), `المادة ${n}`);
  }
});

// ── Ordinals (owner report 2026-10-03: «ثالثًا- الأمانة العامة…» showed «المادة 52») ──

// A real-length heading: over 60 characters, so only its first 20 decide.
const CHAMBERS_TAIL = "- الأمانة العامة للغرف التجارية الصناعية وتنظيم أعمالها وتحديد اختصاصاتها";

test("every spelling of an ordinal is a locator: tanween after or before the alef, bare alef", () => {
  // \u escapes so the two tanween orders cannot be confused in a diff:
  // «ثالثاً» = …ث ا ً (alef, then fathatan); «ثالثًا» = …ث ً ا (fathatan, then alef).
  const after = "\u062B\u0627\u0644\u062B\u0627\u064B";   // ثالثاً
  const before = "\u062B\u0627\u0644\u062B\u064B\u0627";  // ثالثًا
  const bare = "\u062B\u0627\u0644\u062B\u0627";          // ثالثا
  for (const ordinal of [after, before, bare]) {
    const long = `${ordinal}${CHAMBERS_TAIL}`;
    assert.ok(long.length > 60);
    assert.equal(articleDisplayLabel(long, 52), long, `«${ordinal}…» must keep its own label`);
    assert.equal(articleLocatorText(long, 52), long);
    // Short forms, with the separators the corpus uses.
    for (const sep of [" ", ":", "-", "–", "ـ", "."]) {
      assert.equal(articleLocatorText(`${ordinal}${sep}`, 3), `${ordinal}${sep}`.replace(/[\s:：]+$/, ""));
    }
  }
});

test("all ten ordinals, both tanween orders, plus «اولاً» and the doubled-alef slip «سادساا»", () => {
  const stems = ["أول", "اول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع", "ثامن", "تاسع", "عاشر"];
  for (const stem of stems) {
    for (const suffix of ["\u0627\u064B", "\u064B\u0627", "\u0627"]) {
      const long = `${stem}${suffix}${CHAMBERS_TAIL}`;
      assert.equal(articleDisplayLabel(long, 9), long, `${stem}${suffix}`);
    }
  }
  const slip = `سادساا${CHAMBERS_TAIL}`;
  assert.equal(articleDisplayLabel(slip, 6), slip);
});

test("bare «ثالث» is not the adverbial ordinal; the compound «ثالث عشر» is", () => {
  const bare = `ثالث${CHAMBERS_TAIL}`;
  assert.equal(articleLocatorText(bare, 52), null);
  assert.equal(articleDisplayLabel(bare, 52), "المادة 52");
  const compound = `ثالث عشر${CHAMBERS_TAIL}`;
  assert.equal(articleDisplayLabel(compound, 13), compound);
  const eleventh = `حادي عشر${CHAMBERS_TAIL}`;
  assert.equal(articleDisplayLabel(eleventh, 11), eleventh);
  // Short text has always been kept as written (no change).
  assert.equal(articleDisplayLabel("ثالث", 3), "ثالث");
});

test("«تعديل» and «الدليل» stay titles, not locators", () => {
  const amendTitle = "تعديل بعض أحكام اللائحة التنفيذية لنظام الغرف التجارية الصناعية الصادر بقرار وزاري";
  const guideTitle = "الدليل الإجرائي لتنظيم أعمال الغرف التجارية الصناعية وتحديد اختصاصات الأمانة العامة";
  assert.ok(amendTitle.length > 60 && guideTitle.length > 60);
  assert.equal(articleDisplayLabel(amendTitle, 4), "المادة 4");
  assert.equal(articleDisplayLabel(guideTitle, 5), "المادة 5");
});

// ── number = 0 ───────────────────────────────────────────────────────────────

test("number 0 (or \"0\", or blank) shows number_text — never «المادة 0»", () => {
  for (const zero of [0, "0", " 0 ", "", null, undefined]) {
    assert.equal(articleDisplayLabel("السادسة والأربعون", zero), "السادسة والأربعون");
    assert.equal(articleDisplayLabel("اللائحة التنفيذية لنظام العمل", zero), "اللائحة التنفيذية لنظام العمل");
    const title = "يجب على صاحب العمل أن يوفر للعامل بيئة عمل آمنة وأن يتخذ جميع الاحتياطات اللازمة لحمايته";
    assert.equal(articleDisplayLabel(title, zero), title);
    assert.doesNotMatch(articleDisplayLabel("", zero), /المادة\s*0/);
  }
  // A real positive number still backs a title.
  assert.equal(articleDisplayLabel("اللائحة التنفيذية لنظام العمل", "7"), "المادة 7");
});

test("leadingOrdinal returns the opening ordinal exactly as written, or null", () => {
  assert.equal(leadingOrdinal(`\u062B\u0627\u0644\u062B\u064B\u0627${CHAMBERS_TAIL}`), "\u062B\u0627\u0644\u062B\u064B\u0627");
  assert.equal(leadingOrdinal("ثالثاً: النطاق"), "ثالثاً");
  assert.equal(leadingOrdinal("ثالث عشر- أحكام"), "ثالث عشر");
  assert.equal(leadingOrdinal("ثالث الأمور"), null);
  assert.equal(leadingOrdinal("المادة الثالثة"), null);
  assert.equal(leadingOrdinal(null), null);
});
