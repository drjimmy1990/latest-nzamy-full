/**
 * l12AccessContent.test.ts — the small public-content fixes of batch
 * l12-access: the invented testimonial (seconded counsel), the unused «٤٩»
 * plans list (N23), the 220 fixture (file 05 #19), the «٢٠٢٥» launch claim on
 * /about (owner ١٠٧ default) and the founder countdown kept while payment is
 * paused (06 أ1). Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/publicSeo/l12AccessContent.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p: string[]) => readFileSync(join(import.meta.dirname, "..", "..", ...p), "utf8");

test("seconded counsel: no invented customer quotes, no stray Cyrillic word", () => {
  const page = read("app", "services", "corporate", "seconded-counsel", "page.tsx");
  assert.doesNotMatch(page, /TESTIMONIALS|<h2[^>]*>ماذا يقول عملاؤنا/);
  assert.doesNotMatch(page, /[Ѐ-ӿ]/, "no Cyrillic");
  assert.doesNotMatch(page, /خالد الدوسري|نورة السبيعي/);
});

test("N23: the unused «٤٩» / «١٤٩» PLANS list is gone from the library data module", () => {
  const data = read("app", "laws", "data.ts");
  assert.doesNotMatch(data, /export const PLANS\b/);
  assert.doesNotMatch(data, /price: "٤٩"|priceEn: "49"/);
});

test("file 05 #19: no 220 daily-limit fixture or comment is left", () => {
  assert.doesNotMatch(read("lib", "library", "readQuota.test.ts"), /day_limit: 220/);
  assert.doesNotMatch(read("lib", "library", "libraryDocQuota.ts"), /220 \/ 400/);
  assert.doesNotMatch(read("lib", "library", "libraryDocQuota.test.ts"), /220 \/ 400/);
});

test("owner ١٠٧: /about claims no 2025 launch (tile, timeline step and sentence removed together)", () => {
  const about = read("app", "about", "page.tsx");
  const code = about.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /٢٠٢٥|2025/);
  assert.doesNotMatch(code, /launchStat/);
});

test("06 أ1: the founder countdown is not hidden while online payment is paused", () => {
  const hero = read("app", "founder", "_components", "HeroMeter.tsx");
  assert.doesNotMatch(hero, /gatewayPaused/);
  assert.match(hero, /const phaseLine = PHASE_LINE\[view\.phase\];/);
});
