/**
 * N05-L10 (batch l11): /laws/subscribe says only what the library does.
 *   - no «شهري / سنوي» toggle: every plan is one payment for its own period;
 *   - the free card describes what a visitor is served (catalogue and
 *     summaries, the 3–5 article preview of owner ١٨٤, 2 full rulings per
 *     collection), not a «5 عمليات/يوم» search quota that does not exist;
 *   - no «(diff)» / PDF / rulings feature sold on one plan only: the three
 *     plans open the same library and differ in length and points;
 *   - the 50-point line of register 14 item 48 on every paid card;
 *   - the prices come from the price book (1,990 / 3,790 / 6,990).
 *
 *   node --test src/app/laws/subscribe/subscribe-honesty.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const raw = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("no monthly/yearly toggle and no dead per-period price fields", () => {
  assert.doesNotMatch(code, /setYearly|priceYearly|perMonth|perYear/);
  assert.doesNotMatch(code, /"شهري"|"Monthly"|"Yearly"/);
  assert.match(code, /\{plan\.price\}/);
});

test("the free card and FAQ promise no search quota and describe the real free reading", () => {
  assert.doesNotMatch(code, /5 عمليات|5\/day|5 daily|عناوين الأنظمة فقط|titles only/);
  for (const line of [
    "معاينة مجانية لأول ٣ إلى ٥ مواد من كل نظام أو لائحة",
    "حكمان كاملان من كل مجموعة أحكام، والباقي عناوين",
    "Two full rulings in every collection; the rest by title",
  ]) assert.ok(code.includes(line), line);
  assert.match(code, /features: \[\.\.\.FREE_PLAN_FEATURES\.ar\]/);
  assert.match(code, /features: \[\.\.\.FREE_PLAN_FEATURES\.en\]/);
});

test("no plan-only feature: every paid card lists the same features, no «(diff)» and no PDF export", () => {
  assert.doesNotMatch(code, /\(diff\)|Amendment diff|PDF|كل مزايا|All (?:Quarterly|Semi-Annual) features|واتساب|WhatsApp support/);
  const shared = code.match(/\.\.\.PAID_PLAN_FEATURES\.(ar|en)/g) ?? [];
  assert.equal(shared.length, 6, "three paid cards in each language");
  assert.ok(code.includes("مفتوحة طوال مدة الاشتراك بشرط ألا ينزل رصيدك عن ${LIBRARY_MIN_POINTS_DEFAULT} نقطة"), "register 14 item 48, its number from pointsGate.ts");
});

test("the paid prices come from the price book, which holds 1,990 / 3,790 / 6,990", async () => {
  for (const id of ["lib-q1", "lib-q2", "lib-annual"]) {
    assert.ok(code.includes(`bookPriceText("${id}", "once", "ar")`), id);
    assert.ok(code.includes(`bookPriceText("${id}", "once", "en")`), id);
  }
  const book = readFileSync(new URL("../../../lib/pricing/priceBook.ts", import.meta.url), "utf8");
  assert.match(book, /"lib-q1": library\("lib-q1", "[^"]+", 1990,/);
  assert.match(book, /"lib-q2": library\("lib-q2", "[^"]+", 3790,/);
  assert.match(book, /"lib-annual": library\("lib-annual", "[^"]+", 6990,/);
});
