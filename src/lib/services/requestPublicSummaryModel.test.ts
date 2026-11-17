/**
 * requestPublicSummaryModel.test.ts — the AI half of the open-request summary
 * (owner ١٩). The n8n call is a fake: no live model is called.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/requestPublicSummaryModel.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REQUEST_SUMMARY_PATH,
  modelPublicSummary,
  requestSummaryModelEnabled,
  type SummaryCall,
} from "./requestPublicSummaryModel.ts";
import { fallbackPublicSummary, isSafePublicSummary } from "./requestPublicSummary.ts";

const SRC = {
  type: "service",
  description: "اسمي ماجد الشمري وجوالي 0551234567، لدي نزاع مع المؤجر على استرداد مبلغ التأمين بعد إخلاء الشقة",
  names: ["ماجد الشمري"],
};

const fake = (outcome: Awaited<ReturnType<SummaryCall>>) => {
  const calls: Parameters<SummaryCall>[0][] = [];
  const call: SummaryCall = async (c) => {
    calls.push(c);
    return outcome;
  };
  return { call, calls };
};

test("switch: on only with REQUEST_SUMMARY_AI=on and the n8n base + key", () => {
  assert.equal(requestSummaryModelEnabled({}), false);
  assert.equal(requestSummaryModelEnabled({ REQUEST_SUMMARY_AI: "on" }), false);
  assert.equal(requestSummaryModelEnabled({ N8N_AI_BASE_URL: "https://n", NZAMY_AI_KEY: "k" }), false);
  assert.equal(requestSummaryModelEnabled({ REQUEST_SUMMARY_AI: "off", N8N_AI_BASE_URL: "https://n", NZAMY_AI_KEY: "k" }), false);
  assert.equal(requestSummaryModelEnabled({ REQUEST_SUMMARY_AI: " ON ", N8N_AI_BASE_URL: "https://n", NZAMY_AI_KEY: "k" }), true);
});

test("the model is sent the scrubbed text only — no name, mobile, id or account data", async () => {
  const { call, calls } = fake({ kind: "result", result: { summary: "نزاع مع المؤجر على استرداد التأمين بعد الإخلاء" } });
  const r = await modelPublicSummary(SRC, call);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, REQUEST_SUMMARY_PATH);
  assert.equal(calls[0].mode, "sync");
  const sent = JSON.stringify((calls[0].body as { input: unknown }).input);
  assert.doesNotMatch(sent, /ماجد|الشمري|0551234567|\d/u, sent);
  assert.deepEqual(Object.keys(calls[0].body as object).sort(), ["input", "max_chars", "tool"]);
  assert.deepEqual(r, { summary: "نزاع مع المؤجر على استرداد التأمين بعد الإخلاء", source: "model" });
});

test("a model line that leaks a mobile or the name is cleaned by the post-check", async () => {
  const { call } = fake({ kind: "result", result: { summary: "ماجد الشمري يطلب استرداد التأمين، جواله ٠٥٥١٢٣٤٥٦٧" } });
  const r = await modelPublicSummary(SRC, call);
  assert.ok(r.summary && isSafePublicSummary(r.summary), String(r.summary));
  assert.doesNotMatch(r.summary, /ماجد|الشمري/u);
  assert.notEqual(r.source, "model");
});

test("n8n unconfigured / timeout / HTTP error / 202 / a throw → the deterministic fallback", async () => {
  const fallback = fallbackPublicSummary(SRC);
  for (const outcome of [
    { kind: "failed", code: "n8n_unconfigured", detail: "unset" },
    { kind: "failed", code: "timeout", detail: "slow" },
    { kind: "failed", code: "n8n_http", detail: "HTTP 404" },
    { kind: "accepted" },
    { kind: "result", result: { nope: true } },
  ] as const) {
    const { call } = fake(outcome);
    const r = await modelPublicSummary(SRC, call);
    assert.equal(r.source, "fallback", JSON.stringify(outcome));
    assert.equal(r.summary, fallback);
  }
  const r = await modelPublicSummary(SRC, async () => {
    throw new Error("boom");
  });
  assert.equal(r.source, "fallback");
});

test("nothing worth summarising → no model call at all", async () => {
  const { call, calls } = fake({ kind: "result", result: "س" });
  const r = await modelPublicSummary({ type: "consultation", description: "0551234567" }, call);
  assert.equal(calls.length, 0);
  assert.equal(r.summary, "استشارة");
});
