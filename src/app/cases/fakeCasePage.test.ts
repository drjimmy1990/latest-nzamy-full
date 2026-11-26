/**
 * N1.3 — /cases/[id] was one invented case for every id: an «حالة الضمان»
 * escrow box (4,500 reserved / 1,200 released), a lawyer «أحمد الغامدي» rated
 * 4.8 from 127 reviews, a fixed timeline and fixed documents. Nothing links to
 * it. It is a plain 404 now, until P4's client tracking link replaces it.
 * Source-read: a .tsx page cannot load under node --test.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("the page is a server-side not-found, not a client page with data", () => {
  assert.doesNotMatch(code, /["']use client["']/);
  assert.match(code, /import \{ notFound \} from "next\/navigation";/);
  assert.match(code, /notFound\(\)/);
});

test("no escrow, no rating, no invented case", () => {
  assert.doesNotMatch(raw, /الضمان|escrow|Escrow/);
  assert.doesNotMatch(raw, /rating|reviews|تقييم|4\.8|127/);
  assert.doesNotMatch(raw, /MOCK_|NZ-2026|أحمد الغامدي|TIMELINE/);
});

// D-30 (owner package 25-Nov): /cases/new was a visitor intake whose «إرسال»
// reached no server, showed a browser-made NZ-2026-… number and promised 24h.
const rawNew = readFileSync(new URL("./new/page.tsx", import.meta.url), "utf8");
const codeNew = rawNew.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("/cases/new is a server-side not-found too: no form, no made-up number, no promise", () => {
  assert.doesNotMatch(codeNew, /["']use client["']/);
  assert.match(codeNew, /import \{ notFound \} from "next\/navigation";/);
  assert.match(codeNew, /notFound\(\)/);
  assert.doesNotMatch(codeNew, /NZ-2026|setSubmitted|Step1|SmartSchedulingPicker|٢٤ ساعة|24/);
});
