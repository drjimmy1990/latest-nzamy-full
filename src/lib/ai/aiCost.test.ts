/**
 * aiCost.test.ts — owner ١٥٦ (batch l13): the real cost per tool on the admin
 * AI usage page. Tokens × the one price table; a run without tokens or without
 * a price is never shown as free.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { costWindow, sarText, type CostRunRow } from "./aiCost.ts";
import { MODEL_PRICES, SAR_PER_USD, hasTokens, modelPriceOf, usageCostUsd } from "./modelPrices.ts";

const NOW = new Date("2026-11-23T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const row = (over: Partial<CostRunRow> = {}): CostRunRow => ({
  tool: "quick-answer",
  model: "gemini-3.1-flash-lite",
  usage: { input_tokens: 1_000_000, output_tokens: 0, cache_read_tokens: 0 },
  status: "succeeded",
  created_at: daysAgo(1),
  user_id: "u-user",
  ...over,
});

test("the price table: the model every workflow uses, with its source", () => {
  const p = MODEL_PRICES["gemini-3.1-flash-lite"];
  assert.ok(p, "the workflows' model has a price");
  assert.equal(p.inputUsdPerM, 0.25);
  assert.equal(p.outputUsdPerM, 1.5);
  assert.equal(p.cachedUsdPerM, 0.025);
  assert.match(p.source, /^https:\/\/\S+ .*20\d\d-\d\d-\d\d/);
  assert.equal(SAR_PER_USD, 3.75);
  // The id the workflows report (workflows.mjs MODEL_ID) is the table's key.
  const wf = readFileSync(new URL("../../../n8n/ai/workflows.mjs", import.meta.url), "utf8");
  const m = /modelName: "models\/([^"]+)"/.exec(wf);
  assert.ok(m && modelPriceOf(m[1]), `the workflows' model ${m?.[1]} is priced`);
  assert.equal(modelPriceOf("models/gemini-3.1-flash-lite"), p, "the models/ prefix is tolerated");
  assert.equal(modelPriceOf("some-other-model"), null);
  assert.equal(modelPriceOf(null), null);
});

test("cost: input less the cached part at the input rate, cached at the cache rate, output (thinking included) at the output rate", () => {
  const p = MODEL_PRICES["gemini-3.1-flash-lite"];
  assert.equal(usageCostUsd({ input_tokens: 1_000_000, output_tokens: 0 }, p), 0.25);
  assert.equal(usageCostUsd({ input_tokens: 0, output_tokens: 1_000_000 }, p), 1.5);
  // 400k cached of a 1M prompt: 600k × 0.25 + 400k × 0.025 = 0.15 + 0.01
  assert.ok(Math.abs(usageCostUsd({ input_tokens: 1_000_000, cache_read_tokens: 400_000, output_tokens: 0 }, p) - 0.16) < 1e-12);
  // A cached count above the prompt cannot make the cost negative.
  assert.ok(usageCostUsd({ input_tokens: 10, cache_read_tokens: 99, output_tokens: 0 }, p) >= 0);
  assert.equal(hasTokens({ input_tokens: 0, output_tokens: 0 }), false);
  assert.equal(hasTokens(null), false);
  assert.equal(hasTokens({ input_tokens: 5 }), true);
});

test("a window sums per tool, splits admin from users, and never counts an unknown run as free", () => {
  const rows: CostRunRow[] = [
    row(), // 0.25 USD, user
    row({ user_id: "u-admin", usage: { input_tokens: 0, output_tokens: 1_000_000 } }), // 1.5 USD, admin
    row({ usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 } }), // old 0/0 run
    row({ usage: null, status: "failed" }), // failed before the model answered
    row({ model: "unknown-model" }), // tokens, no price
    row({ tool: "legal-drafter", status: "failed" }), // failed after the model answered: still billed
    row({ created_at: daysAgo(10) }), // outside 7, inside 30
    row({ created_at: daysAgo(40) }), // outside both
  ];
  const w7 = costWindow(rows, new Set(["u-admin"]), NOW, 7);
  const qa = w7.tools.find((t) => t.tool === "quick-answer")!;
  assert.equal(qa.runs, 5);
  assert.equal(qa.failedRuns, 1);
  assert.equal(qa.pricedRuns, 2);
  assert.equal(qa.noUsageRuns, 2);
  assert.equal(qa.unpricedRuns, 1);
  assert.equal(qa.costUsd, 1.75);
  assert.equal(qa.costSar, 1.75 * 3.75);
  assert.equal(qa.adminRuns, 1);
  assert.equal(qa.adminCostSar, 1.5 * 3.75);
  assert.equal(qa.userRuns, 4);
  assert.equal(qa.userCostSar, 0.25 * 3.75);
  assert.deepEqual(qa.models.sort(), ["gemini-3.1-flash-lite", "unknown-model"]);
  const drafter = w7.tools.find((t) => t.tool === "legal-drafter")!;
  assert.equal(drafter.failedRuns, 1);
  assert.equal(drafter.costUsd, 0.25, "a failed run that spent tokens is billed");
  assert.equal(w7.tools[0].tool, "quick-answer", "dearest first");
  assert.equal(w7.total.runs, 6);
  assert.equal(w7.total.costUsd, 2);
  assert.equal(w7.total.noUsageRuns, 2);

  const w30 = costWindow(rows, new Set(["u-admin"]), NOW, 30);
  assert.equal(w30.total.runs, 7);
  assert.equal(w30.total.costUsd, 2.25);
  assert.equal(costWindow([], new Set(), NOW, 7).tools.length, 0);
});

test("money text keeps small amounts visible", () => {
  assert.match(sarText(0.0012), /٠٫٠٠١٢/);
  assert.match(sarText(12.5), /١٢٫٥٠/);
  assert.match(sarText(0), /ر\.س$/);
});
