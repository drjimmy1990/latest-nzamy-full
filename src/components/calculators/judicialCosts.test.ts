import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEAL_COST_SAR,
  CASSATION_COST_SAR,
  FIRST_INSTANCE_BANDS,
  FIRST_INSTANCE_COST_CAP_SAR,
  JUDICIAL_COSTS_ESTIMATE_LABEL,
  RECONSIDERATION_COST_SAR,
  estimateJudicialCosts,
  firstInstanceBand,
  parseClaimAmount,
} from "./judicialCosts.ts";

const firstOnly = { includeFirstInstance: true, includeAppeal: false };
const fee = (claimAmountSar: number) => estimateJudicialCosts({ claimAmountSar, ...firstOnly })!.lines[0];

test("the constants are the regulation's (owner answer ١٨٢): four bands, a 1,000,000 SAR ceiling, flat 5,000 / 7,000 / 10,000", () => {
  assert.deepEqual(FIRST_INSTANCE_BANDS.map((b) => [b.below, b.rate]), [
    [100_000, 0.05],
    [500_000, 0.04],
    [1_000_000, 0.03],
    [Number.POSITIVE_INFINITY, 0.02],
  ]);
  assert.equal(FIRST_INSTANCE_COST_CAP_SAR, 1_000_000);
  assert.equal(APPEAL_COST_SAR, 5_000);
  assert.equal(CASSATION_COST_SAR, 7_000);
  assert.equal(RECONSIDERATION_COST_SAR, 10_000);
  assert.equal(JUDICIAL_COSTS_ESTIMATE_LABEL, "تقديرية استرشادية");
});

test("each band's rate applies to the whole claim, with the edges where Article 2 puts them", () => {
  assert.equal(fee(40_000).amountSar, 2_000);       // 5%
  assert.equal(fee(99_999).amountSar, 5_000);       // 5% of 99,999 = 4,999.95 → 5,000
  assert.equal(fee(100_000).amountSar, 4_000);      // «مائة ألف ريال فأكثر» → 4% of the whole
  assert.equal(fee(250_000).amountSar, 10_000);     // 4%, not 5% of 100,000 + 4% of 150,000 (11,000)
  assert.equal(fee(499_999).amountSar, 20_000);     // 4% → 19,999.96 → 20,000
  assert.equal(fee(500_000).amountSar, 15_000);     // 3%
  assert.equal(fee(999_999).amountSar, 30_000);     // 3% → 29,999.97 → 30,000
  assert.equal(fee(1_000_000).amountSar, 20_000);   // 2%
  assert.equal(firstInstanceBand(1_000_000).percentAr, "٢٪");
  assert.ok([40_000, 250_000, 500_000, 1_000_000].every((a) => !fee(a).capped));
});

test("the 1,000,000 SAR ceiling: 50,000,000 lands on it exactly (not capped), above it is capped", () => {
  assert.deepEqual([fee(50_000_000).amountSar, fee(50_000_000).capped], [1_000_000, false]);
  assert.deepEqual([fee(80_000_000).amountSar, fee(80_000_000).capped], [1_000_000, true]);
  assert.match(fee(80_000_000).basis, /الحد الأعلى/);
});

test("the first-instance basis names the rate and the band", () => {
  const line = fee(250_000);
  assert.match(line.basis, /٤٪/);
  assert.match(line.basis, /من ١٠٠ ألف إلى أقل من ٥٠٠ ألف ريال/);
  assert.match(line.basis, /المادة الثانية من اللائحة التنفيذية/);
});

test("requests are flat amounts whatever the claim (Article 6)", () => {
  for (const claimAmountSar of [1_000, 150_000, 5_000_000]) {
    const r = estimateJudicialCosts({
      claimAmountSar,
      includeFirstInstance: false,
      includeAppeal: true,
      includeCassation: true,
      includeReconsideration: true,
    })!;
    assert.deepEqual(r.lines.map((l) => [l.id, l.amountSar, l.capped]), [
      ["appeal", 5_000, false],
      ["cassation", 7_000, false],
      ["reconsideration", 10_000, false],
    ]);
    assert.ok(r.lines.every((l) => /مبلغ مقطوع/.test(l.basis) && /المادة السادسة/.test(l.basis)));
  }
});

test("all four lines come in court order and add up", () => {
  const r = estimateJudicialCosts({
    claimAmountSar: 2_000_000,
    includeFirstInstance: true,
    includeAppeal: true,
    includeCassation: true,
    includeReconsideration: true,
  })!;
  assert.deepEqual(r.lines.map((l) => [l.id, l.amountSar]), [
    ["first-instance", 40_000],
    ["appeal", 5_000],
    ["cassation", 7_000],
    ["reconsideration", 10_000],
  ]);
  assert.equal(r.totalSar, 62_000);
  assert.deepEqual(r.lines.map((l) => l.label), ["قيد الدعوى (الدرجة الأولى)", "طلب الاستئناف", "طلب النقض", "طلب التماس إعادة النظر"]);
});

test("figures are whole riyals", () => {
  assert.equal(fee(1_234.5).amountSar, 62);
});

test("nothing to estimate → null, never a zero that reads as «exempt»", () => {
  for (const claimAmountSar of [0, -5, NaN, Infinity]) {
    assert.equal(estimateJudicialCosts({ claimAmountSar, includeFirstInstance: true, includeAppeal: true }), null, String(claimAmountSar));
  }
  assert.equal(
    estimateJudicialCosts({ claimAmountSar: 1000, includeFirstInstance: false, includeAppeal: false, includeCassation: false, includeReconsideration: false }),
    null,
  );
});

test("parseClaimAmount reads Western and Arabic-Indic digits with separators", () => {
  assert.equal(parseClaimAmount("250,000"), 250_000);
  assert.equal(parseClaimAmount(" 250000 "), 250_000);
  assert.equal(parseClaimAmount("٢٥٠٬٠٠٠"), 250_000);
  assert.equal(parseClaimAmount("1500.5"), 1500.5);
});

test("parseClaimAmount refuses anything that is not a positive amount", () => {
  for (const raw of ["", "abc", "0", "-100", "1e6", "12ر.س", "1.2.3"]) {
    assert.equal(parseClaimAmount(raw), null, raw);
  }
});

// N9 (fix plan 2026-10-16), owner answer ١٨٢: the tab subtitle states the
// bands' ceiling and all three request amounts, never a 5%-for-all or a 10,000
// appeal cap.
test("the fee calculator's court-fees subtitle states the regulation's figures", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../../app/ai/fee-calculator/page.tsx", import.meta.url), "utf8");
  const row = page.split(/\r?\n/).find((line) => line.includes('id: "court_fees"'));
  assert.ok(row, "court_fees tab not found");
  const desc = /desc: "([^"]*)"/.exec(row!)?.[1] ?? "";
  const ar = (n: number) => n.toLocaleString("ar-SA");
  for (const text of [
    "بحد أقصى مليون ريال",
    `الاستئناف ${ar(APPEAL_COST_SAR)}`,
    `النقض ${ar(CASSATION_COST_SAR)}`,
    `إعادة النظر ${ar(RECONSIDERATION_COST_SAR)}`,
  ]) {
    assert.ok(desc.includes(text), `missing «${text}» in: ${desc}`);
  }
  assert.ok(!desc.includes("بحد أقصى ١٠٬٠٠٠"), desc);
});

test("the court-fees screen states the bands and the flat amounts", async () => {
  const { readFileSync } = await import("node:fs");
  const screen = readFileSync(new URL("./CalcCourtFees.tsx", import.meta.url), "utf8");
  for (const text of ["٥٪", "٤٪", "٣٪", "٢٪", "٥٬٠٠٠", "٧٬٠٠٠", "١٠٬٠٠٠", "مليون"]) {
    assert.ok(screen.includes(text), text);
  }
  assert.ok(!screen.includes("الاستئناف بحد أقصى"), "the old appeal cap is still on the screen");
});
