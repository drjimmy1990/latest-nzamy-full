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
import { RUN_ERROR_AR, runFailureMessage } from "./runErrors.ts";
import { AI_COPY } from "./runCore.ts";
import { runPageView } from "./runPageView.ts";
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

test("E4: a refunded run names its failure; the copies equal their AI_COPY twins", () => {
  assert.equal(RUN_ERROR_AR.no_sources, AI_COPY.noSources);
  assert.equal(RUN_ERROR_AR.ungrounded, AI_COPY.ungrounded);
  assert.equal(RUN_ERROR_AR.timeout, AI_COPY.timeout);
  for (const code of ["no_queries", "store_failed", "bad_reply", "model_error", "unreachable", "internal"]) {
    assert.equal(RUN_ERROR_AR[code], AI_COPY.failed, code);
  }
  assert.equal(runFailureMessage("no_sources", true, false), AI_COPY.noSources);
  assert.equal(runFailureMessage("ungrounded", true, false), AI_COPY.ungrounded);
  assert.equal(runFailureMessage("timeout", true, false), AI_COPY.timeout);
});

test("E4: no refund is claimed unless it happened, a credit run keeps its own sentence, and a strange code is generic", () => {
  assert.equal(runFailureMessage("no_sources", false, false), "تعذّر إكمال الطلب");
  assert.equal(runFailureMessage("timeout", false, false), "تعذّر إكمال الطلب");
  assert.equal(runFailureMessage("no_sources", true, true), FOUNDER_CREDIT_REFUNDED_FAILURE);
  assert.equal(runFailureMessage("constructor", true, false), AI_COPY.failed);
  assert.equal(runFailureMessage("__proto__", true, false), AI_COPY.failed);
  assert.equal(runFailureMessage(null, true, false), AI_COPY.failed);
});

test("E4: the run page shows the same specific failure", () => {
  assert.equal(runPageView({ status: "failed", error_code: "no_sources", refunded_at: "2026-11-05T00:00:00Z" }).message, AI_COPY.noSources);
});

test("E4: the client copy imports nothing from runCore, so no server code reaches the bundle", () => {
  const src = readFileSync(join(process.cwd(), "src", "lib", "ai", "runErrors.ts"), "utf8");
  assert.doesNotMatch(src, /from "\.\/runCore/);
});
