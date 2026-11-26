/**
 * aiModel.test.ts — owner س٢١٩ (batch l16): the AI model as an admin setting.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/aiModel.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_MODEL_CHOICES, AI_MODEL_DEFAULT, AI_MODEL_RETIRED, AI_MODEL_SETTING, aiModelId, aiModelSettingIssue, parseAiModel, retiredAiModelNoteAr } from "./aiModel.ts";
import { MODEL_PRICES, modelPriceOf } from "./modelPrices.ts";

test("the default is 3.5 flash-lite (owner س٢١٩) and comes first; every choice has a price", () => {
  assert.equal(AI_MODEL_SETTING, "ai_model");
  assert.equal(AI_MODEL_DEFAULT, "models/gemini-3.5-flash-lite");
  assert.equal(AI_MODEL_CHOICES[0], AI_MODEL_DEFAULT);
  assert.equal(new Set(AI_MODEL_CHOICES).size, AI_MODEL_CHOICES.length);
  for (const m of AI_MODEL_CHOICES) {
    assert.ok(m.startsWith("models/"), m);
    assert.ok(modelPriceOf(m), `${m} has a price row`);
    assert.ok(modelPriceOf(aiModelId(m)), `${aiModelId(m)} (as usage.model reports it) has a price row`);
  }
  assert.equal(AI_MODEL_CHOICES.length, Object.keys(MODEL_PRICES).length - AI_MODEL_RETIRED.size, "every priced model but a retired one may be chosen");
});

test("owner ٢٢٦: gemini-3.1-flash-lite is not offered, keeps its price, and a saved choice of it is flagged", () => {
  assert.ok(AI_MODEL_RETIRED.has("models/gemini-3.1-flash-lite"));
  assert.ok(!AI_MODEL_CHOICES.includes("models/gemini-3.1-flash-lite"));
  assert.ok(MODEL_PRICES["gemini-3.1-flash-lite"], "older runs are still priced");
  assert.ok(aiModelSettingIssue({ model: "models/gemini-3.1-flash-lite" }), "the settings route refuses it");
  assert.match(retiredAiModelNoteAr({ model: "models/gemini-3.1-flash-lite" }) ?? "", /أُوقف.*النموذج الافتراضي/);
  for (const v of [null, {}, { model: AI_MODEL_DEFAULT }, { model: "models/gpt-4o" }]) assert.equal(retiredAiModelNoteAr(v), null, JSON.stringify(v));
  const runs = readFileSync(join(process.cwd(), "src/app/api/v1/admin/ai-runs/route.ts"), "utf8");
  assert.match(runs, /retiredNote: retiredAiModelNoteAr\(byKey\.get\(AI_MODEL_SETTING\)\)/);
  const page = readFileSync(join(process.cwd(), "src/app/dashboard/admin/ai-usage/page.tsx"), "utf8");
  assert.match(page, /\{aiModel\.retiredNote && \(/);
});

test("parseAiModel: an allowed name is kept; anything else is the default", () => {
  assert.equal(parseAiModel({ model: AI_MODEL_DEFAULT }), AI_MODEL_DEFAULT);
  assert.equal(parseAiModel({ model: `  ${AI_MODEL_DEFAULT} ` }), AI_MODEL_DEFAULT);
  // Owner ٢٢٦: the retired model reads as the default, however it is spelled.
  for (const bad of [null, undefined, "models/gemini-3.1-flash-lite", [], {}, { model: 3 }, { model: "gemini-3.1-flash-lite" }, { model: "models/gpt-4o" },
    { model: "models/gemini-3.1-flash-lite" }, { model: "  models/gemini-3.1-flash-lite " }]) {
    assert.equal(parseAiModel(bad), AI_MODEL_DEFAULT, JSON.stringify(bad));
  }
});

test("aiModelSettingIssue: exactly {model: an allowed name}", () => {
  for (const m of AI_MODEL_CHOICES) assert.equal(aiModelSettingIssue({ model: m }), null, m);
  for (const bad of [null, "x", [], {}, { model: 1 }, { model: "models/gpt-4o" }, { model: AI_MODEL_DEFAULT, tier: "deep" }, { model: ` ${AI_MODEL_DEFAULT}` }]) {
    assert.ok(aiModelSettingIssue(bad), JSON.stringify(bad));
  }
});

test("the admin settings route allow-lists and validates ai_model; the admin runs route reads it", () => {
  const settings = readFileSync(join(process.cwd(), "src/app/api/v1/admin/settings/route.ts"), "utf8");
  assert.match(settings, /\n  AI_MODEL_SETTING,\r?\n/);
  assert.match(settings, /\[AI_MODEL_SETTING\]: aiModelSettingIssue,/);
  const runs = readFileSync(join(process.cwd(), "src/app/api/v1/admin/ai-runs/route.ts"), "utf8");
  assert.match(runs, /AI_MODEL_SETTING\]\)/);
  assert.match(runs, /current: parseAiModel\(/);
});
