/**
 * runErrors.test.ts — what a failed run tells its owner. R30 dropped the review
 * polling and the rejected / review_timeout copy (no hold path is built).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/runErrors.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runFailureMessage } from "./runErrors.ts";
import { FOUNDER_CREDIT_REFUNDED_FAILURE } from "../membership/founderPlan.ts";

test("runFailureMessage: refunded, not refunded, and a credit run", () => {
  assert.equal(runFailureMessage("model_error", true, false), "تعذّر إكمال الطلب، وأُعيدت نقاطك");
  assert.equal(runFailureMessage("model_error", false, false), "تعذّر إكمال الطلب");
  assert.equal(runFailureMessage(null, false, false), "تعذّر إكمال الطلب");
  // A credit run gets its credit back, never «أُعيدت نقاطك» (R20), whatever the code.
  assert.equal(runFailureMessage("model_error", true, true), FOUNDER_CREDIT_REFUNDED_FAILURE);
  assert.equal(runFailureMessage(null, false, true), FOUNDER_CREDIT_REFUNDED_FAILURE);
});

test("runFailureMessage: no copy promises a review decision that nothing delivers (R30)", () => {
  for (const code of ["rejected", "review_timeout"]) {
    assert.equal(runFailureMessage(code, true, false), "تعذّر إكمال الطلب، وأُعيدت نقاطك");
  }
});

test("useAiRun: a failed poll reads the one message, and its review branch is unchanged (R30)", () => {
  const hook = readFileSync(join(process.cwd(), "src", "hooks", "useAiRun.ts"), "utf8");
  assert.match(hook, /runFailureMessage\(/);
  assert.doesNotMatch(hook, /"تعذّر إكمال الطلب، وأُعيدت نقاطك"/, "no second copy of the sentence");
  assert.doesNotMatch(hook, /reviewPollDelay/);
});
