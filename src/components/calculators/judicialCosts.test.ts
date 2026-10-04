import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEAL_COST_CAP_SAR,
  JUDICIAL_COSTS_ESTIMATE_LABEL,
  MONETARY_CLAIM_RATE,
  estimateJudicialCosts,
  parseClaimAmount,
} from "./judicialCosts.ts";

const both = { includeFirstInstance: true, includeAppeal: true };

test("the constants are the owner's rule (Q149): 5% and a 10,000 SAR appeal cap", () => {
  assert.equal(MONETARY_CLAIM_RATE, 0.05);
  assert.equal(APPEAL_COST_CAP_SAR, 10_000);
  assert.equal(JUDICIAL_COSTS_ESTIMATE_LABEL, "تقديرية استرشادية");
});

test("first instance is 5% of the claim, with no cap of our own invention", () => {
  const small = estimateJudicialCosts({ claimAmountSar: 40_000, includeFirstInstance: true, includeAppeal: false })!;
  assert.deepEqual(small.lines.map((l) => [l.id, l.amountSar]), [["first-instance", 2_000]]);
  const large = estimateJudicialCosts({ claimAmountSar: 50_000_000, includeFirstInstance: true, includeAppeal: false })!;
  assert.equal(large.totalSar, 2_500_000);
  assert.equal(large.lines[0].capped, false);
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
