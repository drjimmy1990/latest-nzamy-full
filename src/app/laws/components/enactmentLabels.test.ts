import assert from "node:assert/strict";
import test from "node:test";
import { dayCountUnit, sinceEffectiveLabel } from "./enactmentLabels.ts";

test("sinceEffectiveLabel: today, singular, dual, plural and 11+ forms", () => {
  assert.equal(sinceEffectiveLabel(0), "بدأ سريانه اليوم");
  assert.equal(sinceEffectiveLabel(1), "بدأ سريانه منذ يوم");
  assert.equal(sinceEffectiveLabel(2), "بدأ سريانه منذ يومين");
  assert.equal(sinceEffectiveLabel(3), "بدأ سريانه منذ 3 أيام");
  assert.equal(sinceEffectiveLabel(10), "بدأ سريانه منذ 10 أيام");
  assert.equal(sinceEffectiveLabel(11), "بدأ سريانه منذ 11 يوماً");
  assert.equal(sinceEffectiveLabel(14), "بدأ سريانه منذ 14 يوماً");
});

test("sinceEffectiveLabel: junk and negatives read as today, never «منذ -1»", () => {
  assert.equal(sinceEffectiveLabel(-3), "بدأ سريانه اليوم");
  assert.equal(sinceEffectiveLabel(NaN), "بدأ سريانه اليوم");
});

test("dayCountUnit: the unit under a countdown number agrees with it", () => {
  assert.equal(dayCountUnit(1), "يوم");
  assert.equal(dayCountUnit(2), "يومان");
  assert.equal(dayCountUnit(3), "أيام");
  assert.equal(dayCountUnit(10), "أيام");
  assert.equal(dayCountUnit(11), "يوماً");
  assert.equal(dayCountUnit(120), "يوماً");
});

test("dayCountUnit past 100 follows the last two digits", () => {
  assert.equal(dayCountUnit(103), "أيام");
  assert.equal(dayCountUnit(110), "أيام");
  assert.equal(dayCountUnit(114), "يوماً");
  assert.equal(dayCountUnit(276), "يوماً");
  assert.equal(dayCountUnit(100), "يوم");
  assert.equal(dayCountUnit(200), "يوم");
});
