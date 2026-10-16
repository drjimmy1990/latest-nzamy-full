import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEAL_COST_CAP_SAR,
  CASSATION_COST_CAP_SAR,
  FIRST_INSTANCE_COST_CAP_SAR,
  JUDICIAL_COSTS_ESTIMATE_LABEL,
  MONETARY_CLAIM_RATE,
  RECONSIDERATION_COST_CAP_SAR,
  estimateJudicialCosts,
  parseClaimAmount,
} from "./judicialCosts.ts";

const both = { includeFirstInstance: true, includeAppeal: true };

test("the constants are the statutory caps and owner's rule (Decision #167): 5%, 1,000,000 SAR first instance cap, and 10,000 SAR appeal cap", () => {
  assert.equal(MONETARY_CLAIM_RATE, 0.05);
  assert.equal(FIRST_INSTANCE_COST_CAP_SAR, 1_000_000);
  assert.equal(APPEAL_COST_CAP_SAR, 10_000);
  assert.equal(JUDICIAL_COSTS_ESTIMATE_LABEL, "تقديرية استرشادية");
});

test("first instance is 5% of the claim, capped at 1,000,000 SAR (Owner Decision #167)", () => {
  const small = estimateJudicialCosts({ claimAmountSar: 40_000, includeFirstInstance: true, includeAppeal: false })!;
  assert.deepEqual(small.lines.map((l) => [l.id, l.amountSar]), [["first-instance", 2_000]]);
  assert.equal(small.lines[0].capped, false);

  const large = estimateJudicialCosts({ claimAmountSar: 50_000_000, includeFirstInstance: true, includeAppeal: false })!;
  assert.equal(large.totalSar, 1_000_000);
  assert.equal(large.lines[0].amountSar, FIRST_INSTANCE_COST_CAP_SAR);
  assert.equal(large.lines[0].capped, true);
});

test("first instance exactly at the cap (20,000,000 → 1,000,000) is not reported as capped", () => {
  const r = estimateJudicialCosts({ claimAmountSar: 20_000_000, includeFirstInstance: true, includeAppeal: false })!;
  assert.equal(r.lines[0].amountSar, 1_000_000);
  assert.equal(r.lines[0].capped, false);
});

test("an appeal is 5% of the amount below the cap", () => {
  const r = estimateJudicialCosts({ claimAmountSar: 150_000, includeFirstInstance: false, includeAppeal: true })!;
  assert.equal(r.lines[0].id, "appeal");
  assert.equal(r.lines[0].amountSar, 7_500);
  assert.equal(r.lines[0].capped, false);
});

test("an appeal never exceeds 10,000 SAR", () => {
  const r = estimateJudicialCosts({ claimAmountSar: 1_000_000, includeFirstInstance: false, includeAppeal: true })!;
  assert.equal(r.lines[0].amountSar, APPEAL_COST_CAP_SAR);
  assert.equal(r.lines[0].capped, true);
});

test("exactly at the cap (200,000 → 10,000) is not reported as capped", () => {
  const r = estimateJudicialCosts({ claimAmountSar: 200_000, includeFirstInstance: false, includeAppeal: true })!;
  assert.equal(r.lines[0].amountSar, 10_000);
  assert.equal(r.lines[0].capped, false);
});

test("both stages add up, in order", () => {
  const r = estimateJudicialCosts({ claimAmountSar: 1_000_000, ...both })!;
  assert.deepEqual(r.lines.map((l) => l.amountSar), [50_000, 10_000]);
  assert.equal(r.totalSar, 60_000);
});

test("both stages capped for 50,000,000 SAR claim", () => {
  const r = estimateJudicialCosts({ claimAmountSar: 50_000_000, ...both })!;
  assert.deepEqual(r.lines.map((l) => l.amountSar), [1_000_000, 10_000]);
  assert.equal(r.lines[0].capped, true);
  assert.equal(r.lines[1].capped, true);
  assert.equal(r.totalSar, 1_010_000);
});

test("figures are whole riyals", () => {
  const r = estimateJudicialCosts({ claimAmountSar: 1_234.5, ...both })!;
  assert.deepEqual(r.lines.map((l) => l.amountSar), [62, 62]);
});

test("nothing to estimate → null, never a zero that reads as «exempt»", () => {
  for (const claimAmountSar of [0, -5, NaN, Infinity]) {
    assert.equal(estimateJudicialCosts({ claimAmountSar, ...both }), null, String(claimAmountSar));
  }
  assert.equal(estimateJudicialCosts({ claimAmountSar: 1000, includeFirstInstance: false, includeAppeal: false }), null);
});

test("Owner Decision #167: cassation is capped at 7,000 SAR and reconsideration at 10,000 SAR", () => {
  assert.equal(CASSATION_COST_CAP_SAR, 7_000);
  assert.equal(RECONSIDERATION_COST_CAP_SAR, 10_000);
});

test("cassation is 5% below its cap; exactly at the cap (140,000 → 7,000) is not reported as capped", () => {
  const below = estimateJudicialCosts({ claimAmountSar: 100_000, includeFirstInstance: false, includeAppeal: false, includeCassation: true })!;
  assert.deepEqual(below.lines.map((l) => [l.id, l.amountSar, l.capped]), [["cassation", 5_000, false]]);
  assert.equal(below.lines[0].label, "طلب النقض");

  const at = estimateJudicialCosts({ claimAmountSar: 140_000, includeFirstInstance: false, includeAppeal: false, includeCassation: true })!;
  assert.equal(at.lines[0].amountSar, 7_000);
  assert.equal(at.lines[0].capped, false);
});

test("cassation never exceeds 7,000 SAR", () => {
  const r = estimateJudicialCosts({ claimAmountSar: 1_000_000, includeFirstInstance: false, includeAppeal: false, includeCassation: true })!;
  assert.equal(r.lines[0].amountSar, CASSATION_COST_CAP_SAR);
  assert.equal(r.lines[0].capped, true);
  assert.match(r.lines[0].basis, /٧٬٠٠٠/);
});

test("reconsideration is 5% below its cap and never exceeds 10,000 SAR", () => {
  const below = estimateJudicialCosts({ claimAmountSar: 150_000, includeFirstInstance: false, includeAppeal: false, includeReconsideration: true })!;
  assert.deepEqual(below.lines.map((l) => [l.id, l.amountSar, l.capped]), [["reconsideration", 7_500, false]]);
  assert.equal(below.lines[0].label, "طلب التماس إعادة النظر");

  const at = estimateJudicialCosts({ claimAmountSar: 200_000, includeFirstInstance: false, includeAppeal: false, includeReconsideration: true })!;
  assert.equal(at.lines[0].amountSar, 10_000);
  assert.equal(at.lines[0].capped, false);

  const over = estimateJudicialCosts({ claimAmountSar: 5_000_000, includeFirstInstance: false, includeAppeal: false, includeReconsideration: true })!;
  assert.equal(over.lines[0].amountSar, RECONSIDERATION_COST_CAP_SAR);
  assert.equal(over.lines[0].capped, true);
});

test("all four lines come in court order and add up", () => {
  const r = estimateJudicialCosts({
    claimAmountSar: 50_000_000,
    includeFirstInstance: true,
    includeAppeal: true,
    includeCassation: true,
    includeReconsideration: true,
  })!;
  assert.deepEqual(r.lines.map((l) => [l.id, l.amountSar]), [
    ["first-instance", 1_000_000],
    ["appeal", 10_000],
    ["cassation", 7_000],
    ["reconsideration", 10_000],
  ]);
  assert.equal(r.totalSar, 1_027_000);
  assert.ok(r.lines.every((l) => l.capped));
});

test("a request picked alone is enough to estimate; none picked is still null", () => {
  assert.notEqual(estimateJudicialCosts({ claimAmountSar: 1000, includeFirstInstance: false, includeAppeal: false, includeCassation: true }), null);
  assert.notEqual(estimateJudicialCosts({ claimAmountSar: 1000, includeFirstInstance: false, includeAppeal: false, includeReconsideration: true }), null);
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

// N9 (fix plan 2026-10-16): the fee calculator's tab subtitle named only the
// first-instance and appeal caps. Any surface that states caps states all four.
test("the fee calculator's court-fees subtitle names all four caps", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../../app/ai/fee-calculator/page.tsx", import.meta.url), "utf8");
  const row = page.split(/\r?\n/).find((line) => line.includes('id: "court_fees"'));
  assert.ok(row, "court_fees tab not found");
  const desc = /desc: "([^"]*)"/.exec(row!)?.[1] ?? "";
  const ar = (n: number) => n.toLocaleString("ar-SA");
  // The first-instance cap is written in words («مليون»).
  assert.equal(FIRST_INSTANCE_COST_CAP_SAR, 1_000_000);
  const caps = [
    "بحد أقصى مليون ريال للدرجة الأولى",
    `الاستئناف بحد أقصى ${ar(APPEAL_COST_CAP_SAR)}`,
    `النقض ${ar(CASSATION_COST_CAP_SAR)}`,
    `إعادة النظر ${ar(RECONSIDERATION_COST_CAP_SAR)}`,
  ];
  const named = caps.filter((text) => desc.includes(text)).length;
  assert.equal(named, caps.length, `partial cap list: ${desc}`);
});
