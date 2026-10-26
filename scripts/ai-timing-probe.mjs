#!/usr/bin/env node
/**
 * ai-timing-probe.mjs — the wave-0 timing check (docs/plans/2026-10-26-ai-services-n8n-plan.md,
 * «Wave 0», done-when): 20 calls to the echo-fast workflow on the DEEP tier
 * (Sonnet) with a full-size package (~6,000 tokens of sources + 6 turns of
 * history), straight to n8n — no app, no database, no points. Prints p50 / p95.
 * A tool whose p95 is over 35 s moves to the job class before its wave.
 *
 * Reads NZAMY_AI_KEY from .env.ai-keys (never printed). Needs the echo-fast
 * workflow active and the Anthropic key set in n8n. Each call costs a few
 * cents of Sonnet tokens.
 *
 *   node scripts/ai-timing-probe.mjs [--n 20] [--base https://n8n.asra3.com/webhook]
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const N = Number(opt("n", "20"));
const BASE = opt("base", "https://n8n.asra3.com/webhook").replace(/\/+$/, "");

const keys = fs.readFileSync(".env.ai-keys", "utf8");
const key = /^NZAMY_AI_KEY=(.+)$/m.exec(keys)?.[1]?.trim();
if (!key) {
  console.error("NZAMY_AI_KEY not found in .env.ai-keys");
  process.exit(2);
}

// ~6,000 tokens of Arabic legal-looking text, split into 8 sources.
const para = "تنص المادة على أن لصاحب العمل فسخ العقد دون مكافأة أو إشعار في الحالات المحددة نظاماً، بشرط أن يتيح للعامل الفرصة لإبداء أسباب معارضته للفسخ. ";
const sources = Array.from({ length: 8 }, (_, i) => ({
  sid: `S${i + 1}`,
  kind: "article",
  id: `probe-${i + 1}`,
  title: "نظام العمل",
  number: String(80 + i),
  text: para.repeat(28),
  full_text: true,
}));
const history = Array.from({ length: 6 }, (_, i) => ({
  role: i % 2 ? "assistant" : "user",
  text: i % 2 ? "الجواب السابق باختصار مع الإشارة إلى المادة ذات الصلة." : "سؤال سابق عن فسخ عقد العمل بسبب الغياب المتكرر.",
}));

const times = [];
let failures = 0;
for (let i = 0; i < N; i++) {
  const body = {
    v: 1,
    run_id: `probe-${Date.now()}-${i}`,
    tool: "echo-fast",
    class: "fast",
    model_tier: "deep",
    input: { text: "هل يحق لصاحب العمل فصلي بسبب الغياب؟", use_model: true, long_answer: true },
    sources,
    history,
    respond: { mode: "sync" },
  };
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/nzamy-ai/echo-fast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nzamy-Key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const json = await res.json().catch(() => ({}));
    const ms = performance.now() - t0;
    const ok = res.status === 200 && json.status === "succeeded";
    if (!ok) failures++;
    times.push(ms);
    console.log(`#${i + 1} ${res.status} ${json.status ?? "?"} ${(ms / 1000).toFixed(1)}s${json.error ? ` ${json.error.code}` : ""}`);
  } catch (err) {
    failures++;
    console.log(`#${i + 1} error ${err.name} after ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  }
}

const sorted = [...times].sort((a, b) => a - b);
const pct = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : NaN;
console.log(`\nruns ${N}, failures ${failures}`);
console.log(`p50 ${(pct(50) / 1000).toFixed(1)}s · p95 ${(pct(95) / 1000).toFixed(1)}s · max ${(sorted.at(-1) / 1000).toFixed(1)}s`);
console.log(pct(95) > 35_000 ? "p95 over 35 s → the consult tool must be a job tool" : "p95 within 35 s → the consult tool can stay fast");
