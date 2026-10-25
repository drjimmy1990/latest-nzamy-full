/**
 * N1.4 — the legal-opinion result screens carried invented scores and model
 * labels: «جودة AI ٩٤٪», a relevance bar per article (98٪/94٪/87٪), a quality
 * score per study section (96٪ … 99٪, +2 on every "refine"), «قوة الموقف
 * القانوني: ممتاز (٩٤٪)», «نسبة التطابق (> ٩٠٪)», and agent badges naming
 * Claude 3.5 Sonnet / GPT-4o / Gemini 1.5 Pro. Owner ١٩٣: no invented
 * percentages; the platform does not name a model it does not run. Same
 * treatment as the «قوة الموقف» removal in /ai/analyze-strength (0c8ba0b8).
 *
 * Source-read (.tsx cannot load under node --test); comments are stripped,
 * because the ones explaining a removal quote what was removed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const FILES = [
  "./_constants.ts",
  "./page.tsx",
  "./_components/ResultView.tsx",
  "./_components/StudyDocumentEditor.tsx",
  "./_components/SharedViews.tsx",
  "./_components/CrossExamResultView.tsx",
];

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

const code = Object.fromEntries(FILES.map((f) => [f, strip(readFileSync(new URL(f, import.meta.url), "utf8"))]));

test("no Arabic percentage anywhere in the legal-opinion tool", () => {
  for (const [file, src] of Object.entries(code)) assert.doesNotMatch(src, /٪/, file);
});

test("no score field and no score display", () => {
  assert.doesNotMatch(code["./_constants.ts"], /relevance\s*:/);
  assert.doesNotMatch(code["./_components/ResultView.tsx"], /relevance|جودة AI/);
  assert.doesNotMatch(code["./_components/StudyDocumentEditor.tsx"], /quality/);
  assert.doesNotMatch(code["./_constants.ts"], /قوة الموقف|نسبة التطابق/);
});

test("no model name or model badge", () => {
  for (const [file, src] of Object.entries(code)) {
    assert.doesNotMatch(src, /Claude|Sonnet|Haiku|Opus|GPT|Gemini|gemini/, file);
  }
  assert.doesNotMatch(code["./_constants.ts"], /\bmodel\s*:/);
  assert.doesNotMatch(code["./_components/ResultView.tsx"], /\.model\b/);
});
