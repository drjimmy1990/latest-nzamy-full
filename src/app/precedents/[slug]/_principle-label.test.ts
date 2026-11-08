import { test } from "node:test";
import assert from "node:assert/strict";
import { principleLabel } from "./_principle-label.ts";

test("#22: a numbered ruling keeps its number", () => {
  assert.equal(principleLabel("12", true, true), "مبدأ رقم (12)");
  assert.equal(principleLabel(12, true, false), "مبدأ رقم 12");
  assert.equal(principleLabel("12", false, true), "Principle # (12)");
  assert.equal(principleLabel("12", false, false), "Principle #12");
});

test("#22: an unnumbered ruling gets no number, never «()»", () => {
  for (const empty of ["", "  ", null, undefined]) {
    assert.equal(principleLabel(empty, true, true), "مبدأ");
    assert.equal(principleLabel(empty, false, false), "Principle");
  }
});
