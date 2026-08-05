/**
 * _citation.test.ts — pins the two defects the citation module exists to fix,
 * so a future edit cannot quietly reintroduce them.
 *
 * Run: npx tsx "src/app/laws/[slug]/_citation.test.ts"
 *
 * Arabic literals are written as \u escapes wherever a bidi-rendered string
 * would be ambiguous to read in a diff. Where a whole phrase is clearer inline
 * it is written inline and compared against a computed value, never eyeballed.
 */
import assert from "node:assert/strict";
import { buildCitation, isPageLocator, LOCATOR_NOUNS } from "./_citation";

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
};

// ── The regression that motivated the module ─────────────────────────────────

test("a page marker is never dressed up as an article", () => {
  const c = buildCitation(
    {
      docTitle: "الدليل الاجرائي لنظام السلامة",
      docType: "دليل إرشادي",
      numberText: "الصفحة 3",
    },
    true,
  );
  assert.equal(c.kind, "page");
  // The old inline template produced «المادة (الصفحة 3) من نظام (…)».
  assert.ok(!c.plain.includes("المادة"), `must not say المادة: ${c.plain}`);
  assert.ok(c.plain.includes("الصفحة (3)"), c.plain);
  // …and it must not be called a نظام either.
  assert.ok(c.plain.includes("دليل إرشادي"), c.plain);
});

test("LOCATOR_NOUNS excludes every page-ish noun", () => {
  for (const bad of ["الصفحة", "صفحة", "ص", "Page", "Article"]) {
    assert.ok(
      !(LOCATOR_NOUNS as readonly string[]).includes(bad),
      `${bad} must never be a locator noun`,
    );
  }
});

test("Arabic-Indic page digits are recognised too", () => {
  assert.ok(isPageLocator("الصفحة ٤"));
  assert.ok(isPageLocator("صفحة 12"));
  assert.ok(isPageLocator("ص. 7"));
  assert.ok(!isPageLocator("السادسة والأربعون"));
  assert.ok(!isPageLocator(""));
  assert.ok(!isPageLocator(null));
});

// ── Document kind ────────────────────────────────────────────────────────────

test("the document's real kind is used, not a hardcoded نظام", () => {
  const reg = buildCitation(
    { docTitle: "لائحة العمل", docType: "لائحة تنفيذية", numberText: "الثالثة" },
    true,
  );
  assert.ok(reg.plain.includes("من لائحة تنفيذية (لائحة العمل)"), reg.plain);

  const law = buildCitation(
    { docTitle: "نظام العمل", docType: "نظام", numberText: "الثالثة" },
    true,
  );
  assert.ok(law.plain.includes("من نظام (نظام العمل)"), law.plain);
});

test("an unknown kind omits the noun rather than guessing", () => {
  const c = buildCitation(
    { docTitle: "وثيقة ما", docType: "شيء غير معروف", numberText: "الأولى" },
    true,
  );
  assert.ok(!c.plain.includes("نظام"), `must not invent نظام: ${c.plain}`);
  assert.ok(c.plain.includes("من (وثيقة ما)"), c.plain);
});

test("a missing kind omits the noun rather than guessing", () => {
  const c = buildCitation({ docTitle: "وثيقة ما", numberText: "الأولى" }, true);
  assert.ok(c.plain.includes("من (وثيقة ما)"), c.plain);
});

// ── Locator handling ─────────────────────────────────────────────────────────

test("a locator that already carries its noun is not doubled", () => {
  const c = buildCitation(
    { docTitle: "نظام العمل", docType: "نظام", numberText: "المادة السادسة" },
    true,
  );
  assert.equal(c.plain.split("المادة").length - 1, 1, `doubled noun: ${c.plain}`);
  assert.ok(c.plain.includes("المادة (السادسة)"), c.plain);
});

test("displayNum is the fallback when the source has no number_text", () => {
  const c = buildCitation(
    { docTitle: "نظام العمل", docType: "نظام", displayNum: "المادة 12" },
    true,
  );
  assert.ok(c.plain.includes("المادة (12)"), c.plain);
});

test("no locator at all cites the document, not a phantom article", () => {
  const c = buildCitation({ docTitle: "نظام العمل", docType: "نظام" }, true);
  assert.equal(c.kind, "document");
  assert.ok(!c.plain.includes("()"), `empty parens: ${c.plain}`);
  assert.ok(c.plain.startsWith("من نظام (نظام العمل)"), c.plain);
});

// ── Repealed wording ─────────────────────────────────────────────────────────

test("repealed text says so, in both languages", () => {
  const ar = buildCitation(
    { docTitle: "نظام العمل", docType: "نظام", numberText: "الخامسة", status: "repealed" },
    true,
  );
  assert.ok(ar.plain.includes("الملغاة"), ar.plain);
  assert.ok(ar.plain.includes("قبل الإلغاء"), ar.plain);

  const en = buildCitation(
    { docTitle: "Labor Law", docType: "نظام", numberText: "5", status: "repealed" },
    false,
  );
  assert.ok(en.plain.includes("(repealed)"), en.plain);
  assert.ok(en.plain.includes("prior to repeal"), en.plain);
});

test("an active article carries no repeal wording", () => {
  const c = buildCitation(
    { docTitle: "نظام العمل", docType: "نظام", numberText: "الخامسة", status: "active" },
    true,
  );
  assert.ok(!c.plain.includes("الملغاة"), c.plain);
  assert.ok(!c.plain.includes("قبل الإلغاء"), c.plain);
});

// ── Executive regulation ─────────────────────────────────────────────────────

test("the executive-regulation form is preserved", () => {
  const c = buildCitation(
    {
      docTitle: "نظام العمل ولوائحه التنفيذية",
      docType: "نظام",
      regulationRef: "المادة الثالثة",
    },
    true,
  );
  assert.equal(c.kind, "regulation");
  // The reader's «ولوائحه التنفيذية» suffix belongs to the page title, not the law.
  assert.ok(c.plain.includes("لنظام (نظام العمل)"), c.plain);
  assert.ok(!c.plain.includes("ولوائحه"), c.plain);
  assert.ok(c.plain.includes("المادة (الثالثة)"), c.plain);
});

// ── Shape guarantees ─────────────────────────────────────────────────────────

test("html is the plain form in bold, and neither ends in whitespace", () => {
  for (const s of [
    { docTitle: "نظام العمل", docType: "نظام", numberText: "الأولى" },
    { docTitle: "دليل", docType: "دليل إرشادي", numberText: "الصفحة 9" },
    { docTitle: "وثيقة" },
  ]) {
    for (const rtl of [true, false]) {
      const c = buildCitation(s, rtl);
      assert.equal(c.html, `<b>${c.plain}</b>`);
      assert.equal(c.plain, c.plain.trim(), `untrimmed: "${c.plain}"`);
      assert.ok(!/\s{2,}/.test(c.plain), `double space: "${c.plain}"`);
    }
  }
});

console.log(`✔ _citation: ${passed} tests passed`);
