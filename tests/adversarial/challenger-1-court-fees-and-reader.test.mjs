/**
 * tests/adversarial/challenger-1-court-fees-and-reader.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Adversarial Stress Tests & Empirical Oracles (Challenger 1)
 *
 * Verifies:
 * 1. Court Fee Calculator Logic (`src/components/calculators/judicialCosts.ts`)
 *    - Boundary conditions, statutory caps (1M SAR first-instance, 10k SAR appeal)
 *    - Stress testing with claim amounts: 0, -100, 1, 100, 10_000, 100_000,
 *      19_999_999, 20_000_000 (boundary), 50_000_000, 100_000_000, 1_000_000_000 SAR.
 *    - Required specific assertions:
 *      * first-instance 50,000,000 SAR yields exactly 1,000,000 SAR (capped: true)
 *      * appeal fee for 500,000 SAR yields exactly 10,000 SAR (capped: true)
 *      * combined first-instance + appeal on 50,000,000 SAR yields exactly 1,010,000 SAR
 * 2. Legal Reader Clause Numbering (`src/app/laws/[slug]/_numbered-item.ts`)
 *    - Preserving numbers ("1.", "1\.", "١.", "١٠.", "100.")
 *    - Rejection of non-clauses ("1.5 مليون", "نص عادي", "• نقطة", "- شرطة")
 * 3. Unclosed `<details>` Markdown Parsing in `_article-components.tsx`
 *    - Fallback behavior when markdown terminates without `</details>` tag
 *    - Multi-line content recovery, default summary assignment, chained blocks
 *
 * Execution:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import tsx --test tests/adversarial/challenger-1-court-fees-and-reader.test.mjs
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const fileInRepo = (...segments) => path.join(REPO_ROOT, ...segments);
const repoUrl = (...segments) => pathToFileURL(fileInRepo(...segments)).href;

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Judicial Costs Calculator Logic (judicialCosts.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe("Adversarial Suite 1: Court Fee Calculator Logic (judicialCosts.ts)", async () => {
  const {
    MONETARY_CLAIM_RATE,
    FIRST_INSTANCE_COST_CAP_SAR,
    APPEAL_COST_CAP_SAR,
    JUDICIAL_COSTS_ESTIMATE_LABEL,
    estimateJudicialCosts,
    parseClaimAmount,
  } = await import(repoUrl("src", "components", "calculators", "judicialCosts.ts"));

  test("Oracle 1.1: Statutory constants adhere to Court Costs Law & Decision #167", () => {
    assert.equal(MONETARY_CLAIM_RATE, 0.05, "Statutory rate must be exactly 5% (0.05)");
    assert.equal(FIRST_INSTANCE_COST_CAP_SAR, 1_000_000, "First-instance ceiling must be 1,000,000 SAR");
    assert.equal(APPEAL_COST_CAP_SAR, 10_000, "Appeal ceiling must be 10,000 SAR");
    assert.equal(JUDICIAL_COSTS_ESTIMATE_LABEL, "تقديرية استرشادية", "Label must be 'تقديرية استرشادية'");
  });

  describe("Oracle 1.2: Mandatory Claim Stress Spectrum", () => {
    // 1. Claim = 0: must return null (exempt / non-positive claims produce no calculation)
    test("Claim = 0 SAR returns null", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 0,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.equal(res, null, "0 SAR claim must return null");
    });

    // 2. Claim = -100: must return null (negative values produce no calculation)
    test("Claim = -100 SAR returns null", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: -100,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.equal(res, null, "Negative claim amount must return null");
    });

    // 3. Claim = 1 SAR: 5% is 0.05 SAR -> rounded to whole riyals is 0 SAR
    test("Claim = 1 SAR calculates 0 SAR fee without capping", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 1,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.ok(res, "1 SAR claim must produce an estimate");
      assert.equal(res.lines[0].amountSar, 0);
      assert.equal(res.lines[0].capped, false);
      assert.equal(res.lines[1].amountSar, 0);
      assert.equal(res.lines[1].capped, false);
      assert.equal(res.totalSar, 0);
    });

    // 4. Claim = 100 SAR: 5% is 5 SAR
    test("Claim = 100 SAR calculates 5 SAR fee per stage", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 100,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 5);
      assert.equal(res.lines[0].capped, false);
      assert.equal(res.lines[1].amountSar, 5);
      assert.equal(res.lines[1].capped, false);
      assert.equal(res.totalSar, 10);
    });

    // 5. Claim = 10,000 SAR: 5% is 500 SAR
    test("Claim = 10,000 SAR calculates 500 SAR fee per stage", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 10_000,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 500);
      assert.equal(res.lines[0].capped, false);
      assert.equal(res.lines[1].amountSar, 500);
      assert.equal(res.lines[1].capped, false);
      assert.equal(res.totalSar, 1_000);
    });

    // 6. Claim = 100,000 SAR: 5% is 5,000 SAR
    test("Claim = 100,000 SAR calculates 5,000 SAR fee per stage", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 100_000,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 5_000);
      assert.equal(res.lines[0].capped, false);
      assert.equal(res.lines[1].amountSar, 5_000);
      assert.equal(res.lines[1].capped, false);
      assert.equal(res.totalSar, 10_000);
    });

    // 7. Claim = 19,999_999 SAR: 5% is 999,999.95 -> rounds to 1,000,000 SAR (capped: false)
    test("Claim = 19,999,999 SAR yields 1,000,000 SAR without capped flag", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 19_999_999,
        includeFirstInstance: true,
        includeAppeal: false,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 1_000_000);
      assert.equal(res.lines[0].capped, false, "At or under 1,000,000 rounded, capped must be false");
      assert.equal(res.totalSar, 1_000_000);
    });

    // 8. Claim = 20,000,000 SAR (Exact First-Instance Boundary): 5% is exactly 1,000,000 SAR
    test("Claim = 20,000,000 SAR yields exactly 1,000,000 SAR with capped: false", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 20_000_000,
        includeFirstInstance: true,
        includeAppeal: false,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 1_000_000);
      assert.equal(res.lines[0].capped, false, "Exactly at boundary, capped flag is false");
      assert.equal(res.totalSar, 1_000_000);
    });

    // 8b. Boundary above: Claim = 20,000,010 SAR: 5% is 1,000,000.5 -> 1,000,001 SAR (capped: true)
    test("Claim = 20,000,010 SAR crosses whole-riyal threshold into capped: true", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 20_000_010,
        includeFirstInstance: true,
        includeAppeal: false,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 1_000_000);
      assert.equal(res.lines[0].capped, true, "Above boundary, capped flag must be true");
      assert.equal(res.totalSar, 1_000_000);
    });

    // 9. Claim = 50,000,000 SAR:
    // First-instance: exactly 1,000,000 SAR (capped: true)
    // Appeal: exactly 10,000 SAR (capped: true)
    // Combined: exactly 1,010,000 SAR
    test("Claim = 50,000,000 SAR yields exactly 1,000,000 first-instance, 10,000 appeal, and 1,010,000 combined", () => {
      // First-instance isolated
      const fi = estimateJudicialCosts({
        claimAmountSar: 50_000_000,
        includeFirstInstance: true,
        includeAppeal: false,
      });
      assert.ok(fi);
      assert.equal(fi.lines[0].amountSar, 1_000_000, "First instance must be exactly 1,000,000 SAR");
      assert.equal(fi.lines[0].capped, true, "First instance must be capped: true");
      assert.equal(fi.totalSar, 1_000_000);

      // Combined
      const combined = estimateJudicialCosts({
        claimAmountSar: 50_000_000,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.ok(combined);
      assert.equal(combined.lines[0].id, "first-instance");
      assert.equal(combined.lines[0].amountSar, 1_000_000);
      assert.equal(combined.lines[0].capped, true);

      assert.equal(combined.lines[1].id, "appeal");
      assert.equal(combined.lines[1].amountSar, 10_000);
      assert.equal(combined.lines[1].capped, true);

      assert.equal(combined.totalSar, 1_010_000, "Combined total must be exactly 1,010,000 SAR");
    });

    // 10. Claim = 100,000,000 SAR:
    test("Claim = 100,000,000 SAR caps both stages to 1,010,000 SAR total", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 100_000_000,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 1_000_000);
      assert.equal(res.lines[0].capped, true);
      assert.equal(res.lines[1].amountSar, 10_000);
      assert.equal(res.lines[1].capped, true);
      assert.equal(res.totalSar, 1_010_000);
    });

    // 11. Claim = 1,000,000,000 SAR:
    test("Claim = 1,000,000,000 SAR caps both stages to 1,010,000 SAR total", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 1_000_000_000,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 1_000_000);
      assert.equal(res.lines[0].capped, true);
      assert.equal(res.lines[1].amountSar, 10_000);
      assert.equal(res.lines[1].capped, true);
      assert.equal(res.totalSar, 1_010_000);
    });
  });

  describe("Oracle 1.3: Appeal Specific Verification & Boundaries", () => {
    // Confirm appeal fee for 500,000 SAR yields exactly 10,000 SAR (capped: true)
    test("Confirm appeal fee for 500,000 SAR yields exactly 10,000 SAR (capped: true)", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 500_000,
        includeFirstInstance: false,
        includeAppeal: true,
      });
      assert.ok(res);
      assert.equal(res.lines.length, 1);
      assert.equal(res.lines[0].id, "appeal");
      assert.equal(res.lines[0].amountSar, 10_000, "5% of 500,000 is 25,000 -> capped at 10,000 SAR");
      assert.equal(res.lines[0].capped, true, "Must have capped: true");
      assert.equal(res.totalSar, 10_000);
    });

    // Appeal boundary: 200,000 SAR -> 5% is 10,000 SAR (capped: false)
    test("Appeal fee for 200,000 SAR yields 10,000 SAR with capped: false", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 200_000,
        includeFirstInstance: false,
        includeAppeal: true,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 10_000);
      assert.equal(res.lines[0].capped, false, "At exact 10,000 cap, capped is false");
    });

    // Appeal boundary above: 200,010 SAR -> 5% is 10,000.5 -> 10,001 SAR (capped: true)
    test("Appeal fee for 200,010 SAR yields 10,000 SAR with capped: true", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: 200_010,
        includeFirstInstance: false,
        includeAppeal: true,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 10_000);
      assert.equal(res.lines[0].capped, true);
    });
  });

  describe("Oracle 1.4: Extreme Numerical Inputs & Edge Cases", () => {
    test("Non-finite numbers (NaN, Infinity, -Infinity) return null", () => {
      for (const val of [NaN, Infinity, -Infinity]) {
        assert.equal(
          estimateJudicialCosts({
            claimAmountSar: val,
            includeFirstInstance: true,
            includeAppeal: true,
          }),
          null,
          `Expected null for ${val}`
        );
      }
    });

    test("De-selected stages return null even with valid positive amount", () => {
      assert.equal(
        estimateJudicialCosts({
          claimAmountSar: 100_000,
          includeFirstInstance: false,
          includeAppeal: false,
        }),
        null,
        "No stage selected must return null"
      );
    });

    test("Number.MAX_SAFE_INTEGER does not crash and enforces statutory ceilings", () => {
      const res = estimateJudicialCosts({
        claimAmountSar: Number.MAX_SAFE_INTEGER,
        includeFirstInstance: true,
        includeAppeal: true,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 1_000_000);
      assert.equal(res.lines[0].capped, true);
      assert.equal(res.lines[1].amountSar, 10_000);
      assert.equal(res.lines[1].capped, true);
      assert.equal(res.totalSar, 1_010_000);
    });

    test("Fractional claims round half up correctly to whole riyals", () => {
      // 1,234.5 * 0.05 = 61.725 -> rounds to 62 SAR
      const res = estimateJudicialCosts({
        claimAmountSar: 1_234.5,
        includeFirstInstance: true,
        includeAppeal: false,
      });
      assert.ok(res);
      assert.equal(res.lines[0].amountSar, 62);
    });
  });

  describe("Oracle 1.5: String Amount Parser (parseClaimAmount)", () => {
    test("Parses standard Western digits and formatted strings", () => {
      assert.equal(parseClaimAmount("50000000"), 50_000_000);
      assert.equal(parseClaimAmount("50,000,000"), 50_000_000);
      assert.equal(parseClaimAmount(" 50,000,000 "), 50_000_000);
      assert.equal(parseClaimAmount("1234.5"), 1234.5);
    });

    test("Parses Arabic-Indic digits with Arabic comma separators", () => {
      assert.equal(parseClaimAmount("٥٠٠٠٠٠٠٠"), 50_000_000);
      assert.equal(parseClaimAmount("٥٠٬٠٠٠٬٠٠٠"), 50_000_000);
      assert.equal(parseClaimAmount("١٢٣٤.٥"), 1234.5);
    });

    test("Rejects invalid, empty, or malicious strings", () => {
      for (const invalid of ["", "   ", "0", "-100", "abc", "1e6", "1.2.3", "٥٠ ألف", "undefined", "null"]) {
        assert.equal(parseClaimAmount(invalid), null, `Expected null for '${invalid}'`);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Legal Reader Clause Numbering (_numbered-item.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe("Adversarial Suite 2: Legal Reader Clause Numbering (_numbered-item.ts)", async () => {
  const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));

  describe("Oracle 2.1: Mandatory Dispatch Edge Cases", () => {
    test("Matches '1. ' with empty trailing text", () => {
      assert.deepEqual(splitNumberedItem("1. "), { number: "1", text: "" });
    });

    test("Matches escaped '1\\. ' with empty trailing text", () => {
      assert.deepEqual(splitNumberedItem("1\\. "), { number: "1", text: "" });
    });

    test("Matches Arabic-Indic '١. ' with empty trailing text", () => {
      assert.deepEqual(splitNumberedItem("١. "), { number: "١", text: "" });
    });

    test("Matches Arabic-Indic '١٠. ' with empty trailing text", () => {
      assert.deepEqual(splitNumberedItem("١٠. "), { number: "١٠", text: "" });
    });

    test("Matches 3-digit '100. ' with empty trailing text", () => {
      assert.deepEqual(splitNumberedItem("100. "), { number: "100", text: "" });
    });

    test("MUST NOT MATCH decimal number: '1.5 مليون'", () => {
      assert.equal(splitNumberedItem("1.5 مليون"), null, "'1.5 مليون' must not match as a list item");
    });

    test("MUST NOT MATCH plain text: 'نص عادي'", () => {
      assert.equal(splitNumberedItem("نص عادي"), null, "'نص عادي' must not match");
    });

    test("MUST NOT MATCH bullet point: '• نقطة'", () => {
      assert.equal(splitNumberedItem("• نقطة"), null, "'• نقطة' must not match");
    });

    test("MUST NOT MATCH dash item: '- شرطة'", () => {
      assert.equal(splitNumberedItem("- شرطة"), null, "'- شرطة' must not match");
    });
  });

  describe("Oracle 2.2: Full Clause Formatting & Body Preservation", () => {
    test("Preserves plain Western number and following text", () => {
      assert.deepEqual(splitNumberedItem("1. يلتزم المرخص له بالآتي"), {
        number: "1",
        text: "يلتزم المرخص له بالآتي",
      });
      assert.deepEqual(splitNumberedItem("12. تقديم التقارير المالية"), {
        number: "12",
        text: "تقديم التقارير المالية",
      });
    });

    test("Strips CommonMark backslash escape while preserving number and text", () => {
      assert.deepEqual(splitNumberedItem("3\\. تقديم الضمان المالي"), {
        number: "3",
        text: "تقديم الضمان المالي",
      });
      assert.deepEqual(splitNumberedItem("25\\. إشعار الوزارة خلال 30 يوماً"), {
        number: "25",
        text: "إشعار الوزارة خلال 30 يوماً",
      });
    });

    test("Preserves Arabic-Indic numerals with both single and double digits", () => {
      assert.deepEqual(splitNumberedItem("١. سداد المقابل المالي"), {
        number: "١",
        text: "سداد المقابل المالي",
      });
      assert.deepEqual(splitNumberedItem("١٠\\. الالتزام بالمعايير الفنية"), {
        number: "١٠",
        text: "الالتزام بالمعايير الفنية",
      });
      assert.deepEqual(splitNumberedItem("٩٩. البند الأخير"), {
        number: "٩٩",
        text: "البند الأخير",
      });
    });

    test("Handles zero and multi-digit clauses", () => {
      assert.deepEqual(splitNumberedItem("0. بند رقم صفر"), {
        number: "0",
        text: "بند رقم صفر",
      });
      assert.deepEqual(splitNumberedItem("٠. بند عربي صفر"), {
        number: "٠",
        text: "بند عربي صفر",
      });
      assert.deepEqual(splitNumberedItem("999\\. بند CommonMark متقدم"), {
        number: "999",
        text: "بند CommonMark متقدم",
      });
    });
  });

  describe("Oracle 2.3: Adversarial Rejection (False Positive Prevention)", () => {
    test("Rejects numbers without trailing space", () => {
      assert.equal(splitNumberedItem("1."), null, "'1.' without space must return null");
      assert.equal(splitNumberedItem("1\\."), null, "'1\\.' without space must return null");
      assert.equal(splitNumberedItem("١."), null, "'١.' without space must return null");
    });

    test("Rejects decimal numbers and mathematical expressions", () => {
      assert.equal(splitNumberedItem("3.14159 نسبة ثابتة"), null);
      assert.equal(splitNumberedItem("0.5 كجم"), null);
      assert.equal(splitNumberedItem("10.00 ر.س"), null);
    });

    test("Rejects dates and version strings", () => {
      assert.equal(splitNumberedItem("2026.10.09 تاريخ التقرير"), null);
      assert.equal(splitNumberedItem("1.2.3 إصدار الحزمة"), null);
    });

    test("Rejects alternative list brackets and delimiters", () => {
      assert.equal(splitNumberedItem("(1) بند فرعي"), null);
      assert.equal(splitNumberedItem("[1] بند فرعي"), null);
      assert.equal(splitNumberedItem("1- بند بفاصلة شرطة"), null);
      assert.equal(splitNumberedItem("1: بند بنقطتين"), null);
    });

    test("Rejects headings or mid-line occurrences", () => {
      assert.equal(splitNumberedItem("المادة 1. الأحكام العامة"), null);
      assert.equal(splitNumberedItem("فقرة 2. شروط القبول"), null);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Unclosed <details> Markdown Parsing (_article-components.tsx)
// ─────────────────────────────────────────────────────────────────────────────

describe("Adversarial Suite 3: Unclosed <details> Parsing (_article-components.tsx)", async () => {
  // Extract parseMarkdownContent cleanly from _article-components.tsx for direct AST analysis
  const articleComponentsPath = fileInRepo("src", "app", "laws", "[slug]", "_article-components.tsx");
  const src = fs.readFileSync(articleComponentsPath, "utf8");

  const { splitNumberedItem } = await import(repoUrl("src", "app", "laws", "[slug]", "_numbered-item.ts"));

  // Isolate parseMarkdownContent function body
  const fnMatch = src.match(/function parseMarkdownContent\(text:\s*string\): ParseBlock\[\]\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "parseMarkdownContent function must exist in _article-components.tsx");

  const ts = (await import("typescript")).default;

  const start = src.indexOf("function parseMarkdownContent");
  const end = src.indexOf("function renderMarkdownTableToHtml");
  const fnTs = src.slice(start, end).trim();
  const fnJs = ts.transpileModule(fnTs, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  // Construct callable function with splitNumberedItem bound in scope
  const parseMarkdownContent = new Function("splitNumberedItem", `
    ${fnJs}
    return parseMarkdownContent;
  `)(splitNumberedItem);

  test("Oracle 3.1: Standard closed <details> block parses correctly", () => {
    const md = `<details>\n<summary>نص التعديل بموجب المرسوم م/5</summary>\nنص المادة قبل التعديل كاملاً\n</details>`;
    const blocks = parseMarkdownContent(md, splitNumberedItem);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "details");
    assert.equal(blocks[0].summary, "نص التعديل بموجب المرسوم م/5");
    assert.equal(blocks[0].content, "نص المادة قبل التعديل كاملاً");
  });

  test("Oracle 3.2: Unclosed <details> at EOF with <summary> does NOT drop content", () => {
    const md = `<details>\n<summary>تعديل غير مغلق رسمياً\nالسطر الأول من النص التاريخي\nالسطر الثاني من النص التاريخي`;
    const blocks = parseMarkdownContent(md, splitNumberedItem);
    assert.equal(blocks.length, 1, "Unclosed block must not be lost");
    assert.equal(blocks[0].type, "details");
    assert.equal(blocks[0].summary, "تعديل غير مغلق رسمياً");
    assert.equal(blocks[0].content, "السطر الأول من النص التاريخي\nالسطر الثاني من النص التاريخي");
  });

  test("Oracle 3.3: Unclosed <details> at EOF without <summary> assigns statutory fallback summary", () => {
    const md = `<details>\nنص تاريخي مباشر دون ملخص`;
    const blocks = parseMarkdownContent(md, splitNumberedItem);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "details");
    assert.equal(blocks[0].summary, "📜 النص قبل التعديل وتفاصيل قرار/مرسوم التعديل");
    assert.equal(blocks[0].content, "نص تاريخي مباشر دون ملخص");
  });

  test("Oracle 3.4: Chained unclosed <details> recovers all blocks sequentially", () => {
    const md = [
      "<details>",
      "<summary>تعديل أول</summary>",
      "محتوى التعديل الأول",
      "<details>",
      "<summary>تعديل ثانٍ</summary>",
      "محتوى التعديل الثاني",
    ].join("\n");

    const blocks = parseMarkdownContent(md, splitNumberedItem);
    assert.equal(blocks.length, 2, "Both unclosed details blocks must be captured");
    assert.equal(blocks[0].type, "details");
    assert.equal(blocks[0].summary, "تعديل أول");
    assert.equal(blocks[0].content, "محتوى التعديل الأول");

    assert.equal(blocks[1].type, "details");
    assert.equal(blocks[1].summary, "تعديل ثانٍ");
    assert.equal(blocks[1].content, "محتوى التعديل الثاني");
  });

  test("Oracle 3.5: Strips leading '>' blockquote formatting inside details", () => {
    const md = [
      "<details>",
      "<summary>تعديل باقتباس</summary>",
      "> سطر مقتبس أول",
      "> سطر مقتبس ثانٍ",
      "</details>",
    ].join("\n");

    const blocks = parseMarkdownContent(md, splitNumberedItem);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].content, "سطر مقتبس أول\nسطر مقتبس ثانٍ");
  });

  test("Oracle 3.6: Coexistence of <details> with numbered items and headings", () => {
    const md = [
      "## المادة الأولى",
      "1. البند الأول من المادة",
      "2\\. البند الثاني مع باك سلاش",
      "<details>",
      "<summary>التعديل السابق</summary>",
      "كانت المادة تنص سابقاً على كذا وكذا",
      "</details>",
      "فقرة ختامية بعد التعديل",
    ].join("\n");

    const blocks = parseMarkdownContent(md, splitNumberedItem);
    assert.equal(blocks.length, 5);
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[1].type, "num-list-item");
    assert.equal(blocks[1].number, "1");
    assert.equal(blocks[2].type, "num-list-item");
    assert.equal(blocks[2].number, "2");
    assert.equal(blocks[3].type, "details");
    assert.equal(blocks[3].summary, "التعديل السابق");
    assert.equal(blocks[4].type, "paragraph");
  });
});
