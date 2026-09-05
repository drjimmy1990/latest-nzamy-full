import test from "node:test";
import assert from "node:assert/strict";

import { trialLengthLabel } from "./inviteTrialLabel.ts";

test("the three named cases read as a duration, not a day count", () => {
  assert.equal(trialLengthLabel(30, true), "شهر كامل");
  assert.equal(trialLengthLabel(60, true), "شهرين كاملين");
  assert.equal(trialLengthLabel(90, true), "3 أشهر كاملة");
  assert.equal(trialLengthLabel(30, false), "1 full month");
  assert.equal(trialLengthLabel(60, false), "2 full months");
  assert.equal(trialLengthLabel(90, false), "3 full months");
});

test("the schema default (14) is never promised as three months", () => {
  // invitations.trial_days defaults to 14 (20260706_content_and_ops.sql) and
  // carries no CHECK — the old mock only ever produced 30/60/90, so a real
  // 14-day invite fell through to the `return` at the bottom of the mock's
  // trialLabel and rendered «3 أشهر كاملة». That must not happen here.
  const ar = trialLengthLabel(14, true);
  const en = trialLengthLabel(14, false);
  assert.notEqual(ar, "3 أشهر كاملة");
  assert.notEqual(en, "3 full months");
  assert.equal(ar, "١٤ يوماً");
  assert.equal(en, "14 days");
});

test("arbitrary day counts follow the Arabic counted-noun rule (arabicCount.ts)", () => {
  // 1: no digit, singular noun — never «١ يوماً».
  assert.equal(trialLengthLabel(1, true), "يوم واحد");
  // 2: no digit, dual — never «٢ يوماً».
  assert.equal(trialLengthLabel(2, true), "يومان");
  // 3-10: digit + PLURAL noun «أيام» — never the 11-and-up tamyiz «يوماً».
  assert.equal(trialLengthLabel(3, true), "٣ أيام");
  assert.equal(trialLengthLabel(7, true), "٧ أيام");
  assert.equal(trialLengthLabel(10, true), "١٠ أيام");
  // 11 and up: digit + SINGULAR noun (the tamyiz) «يوماً».
  assert.equal(trialLengthLabel(11, true), "١١ يوماً");
  assert.equal(trialLengthLabel(365, true), "٣٦٥ يوماً");
  // English has no such agreement — plain singular/plural.
  assert.equal(trialLengthLabel(7, false), "7 days");
  assert.equal(trialLengthLabel(1, false), "1 day");
});

test("non-positive or non-finite input renders a safe fallback, never NaN", () => {
  assert.equal(trialLengthLabel(0, true), "فترة تجريبية");
  assert.equal(trialLengthLabel(-5, true), "فترة تجريبية");
  assert.equal(trialLengthLabel(Number.NaN, true), "فترة تجريبية");
  assert.equal(trialLengthLabel(Number.POSITIVE_INFINITY, false), "a trial period");
  for (const days of [0, -5, Number.NaN]) {
    assert.doesNotMatch(trialLengthLabel(days, true), /NaN/);
  }
});

test("a fractional count floors before rendering", () => {
  assert.equal(trialLengthLabel(30.9, true), "شهر كامل");
  assert.equal(trialLengthLabel(14.7, true), "١٤ يوماً");
});
