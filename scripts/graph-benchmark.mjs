#!/usr/bin/env node
/**
 * scripts/graph-benchmark.mjs — Saudi Legal Arabic Embedding & GraphRAG Benchmark CLI
 *
 * Evaluates colloquial Saudi Arabic legal queries against target statutory articles
 * across any registered model/dimension (`gemini-embedding-2-768`, `gemini-embedding-2-1536`,
 * `openai-3-large-1536`, `openai-3-large-3072`, etc.), measuring Top-1 accuracy,
 * cosine separation margin, and latency.
 *
 * Usage:
 *   npm run graph:benchmark
 *   node --import tsx scripts/graph-benchmark.mjs --models=gemini-embedding-2-768,gemini-embedding-2-1536
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  embedQueryText,
  embedTexts,
  hasEmbeddingCredentials,
  resolveEmbeddingModelProfile,
} from "../src/lib/ai/embeddingClient.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

for (const name of [".env.local", ".env"]) {
  const p = join(ROOT, name);
  if (!existsSync(p)) continue;
  for (const rawLine of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const CORPUS = [
  {
    id: "labor-77",
    text: "المستند: نظام العمل | الباب الخامس\nالمادة 77: ما لم يتضمن العقد تعويضاً محدداً مقابل إنهائه من أحد الطرفين لسبب غير مشروع، يستحق الطرف المتضرر من إنهاء العقد تعويضاً بأجر خمسة عشر يوماً عن كل سنة من سنوات خدمة العامل.",
  },
  {
    id: "labor-80",
    text: "المستند: نظام العمل | الباب الخامس\nالمادة 80: لا يجوز لصاحب العمل فسخ العقد دون مكافأة العامل أو إشعاره أو تعويضه إلا في حالات الاعتداء أو عدم تأدية الالتزامات الجوهرية أو الغياب دون سبب مشروع أكثر من ثلاثين يوماً.",
  },
  {
    id: "labor-109",
    text: "المستند: نظام العمل | الإجازات\nالمادة 109: يستحق العامل عن كل عام إجازة سنوية لا تقل مدتها عن واحد وعشرين يوماً تزاد إلى ثلاثين يوماً إذا أمضى خمس سنوات متصلة.",
  },
  {
    id: "comm-paper-87",
    text: "المستند: نظام الأوراق التجارية | السند لأمر\nالمادة 87: يشتمل السند لأمر على شرط الأمر أو عبارة سند لأمر وتعهد غير معلق على شرط بوفاء مبلغ معين من النقود وتاريخ الاستحقاق وتوقيع من أنشأ السند.",
  },
  {
    id: "civil-338",
    text: "المستند: نظام المعاملات المدنية | عقد البيع — ضمان العيوب الخفية\nالمادة 338: يضمن البائع خلو المبيع من أي عيب يفوت به غرض معتبر أو ينقص من قيمته نقصاً مؤثراً ولو لم يكن عالماً بوجوده.",
  },
];

const QUERIES = [
  { q: "طردوني من الشركة فجأة بدون سبب وبدون تعويض", expected: "labor-77" },
  { q: "متى يحق للشركة فصل الموظف بسبب الغياب بدون مكافأة؟", expected: "labor-80" },
  { q: "كم يوم رصيد الإجازة السنوية بعد خمس سنوات خدمة؟", expected: "labor-109" },
  { q: "خصمي وقع لي سند لأمر في نافذ ورفض السداد", expected: "comm-paper-87" },
  { q: "اشتريت عقار واكتشفت فيه عيب خفي ينقص قيمته", expected: "civil-338" },
];

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function main() {
  const argModels = process.argv.find((a) => a.startsWith("--models="));
  const modelIds = argModels
    ? argModels.slice("--models=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : ["gemini-embedding-2-768"];

  for (const modelId of modelIds) {
    const profile = resolveEmbeddingModelProfile(modelId);
    if (!hasEmbeddingCredentials(profile)) {
      console.log(`[benchmark] Skipping ${modelId}: missing credentials for provider '${profile.provider}'.`);
      continue;
    }

    const t0 = Date.now();
    const docVecs = await embedTexts(
      CORPUS.map((c) => c.text),
      { profile, mode: "document" },
    );

    let hits = 0;
    let totalMargin = 0;

    for (const item of QUERIES) {
      const qRes = await embedQueryText(item.q, { profile });
      const scored = CORPUS.map((doc, idx) => ({
        id: doc.id,
        sim: dot(qRes.vector, docVecs[idx]),
      })).sort((a, b) => b.sim - a.sim);

      const top1 = scored[0];
      const top2 = scored[1];
      if (top1.id === item.expected) hits++;
      totalMargin += top1.sim - top2.sim;
    }

    const elapsedMs = Date.now() - t0;
    console.log(
      JSON.stringify({
        model_id: profile.modelId,
        dimensions: profile.dimensions,
        top1_accuracy: `${hits}/${QUERIES.length}`,
        avg_separation_margin: Number((totalMargin / QUERIES.length).toFixed(4)),
        elapsed_ms: elapsedMs,
      }),
    );
  }
}

main().catch((err) => {
  console.error("[benchmark] Failed:", err);
  process.exit(1);
});
