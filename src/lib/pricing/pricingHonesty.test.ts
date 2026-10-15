/**
 * pricingHonesty.test.ts — copy guards for the pricing and checkout surfaces.
 *
 * Owner decisions this file holds the code to:
 *   - Q164 (2026-10-03): no popularity or superlative badges — no data backs
 *     «الأكثر طلباً», «الأكثر اعتماداً», «الأكثر قيمة», "Best Value" …
 *   - no discount the prices do not produce (struck-through "was" prices that
 *     were never charged, «خصم ٥٠٪», «-15%», «وفر ٥٥٪», «وفّر ١٦٪»).
 *
 * Source text is read with readFileSync (the pattern pricingApprovals.test.ts
 * uses): the pricing constants import phosphor icons and React at runtime, and
 * the pages are .tsx, so neither can be loaded by `node --test`. Comments are
 * stripped first, because the comments that explain each removal quote the
 * removed wording.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function src(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

/** Source with block comments, JSX comments and line comments removed. */
function code(path: string): string {
  return src(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // A line comment, but not the `//` inside "https://…".
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

const PRICING_SURFACES = [
  "constants/pricing/pricing.common.ts",
  "constants/pricing/pricing.companies.comparison.ts",
  "constants/pricing/pricing.companies.legaldept.ts",
  "constants/pricing/pricing.companies.ts",
  "constants/pricing/pricing.firms.ts",
  "constants/pricing/pricing.government.ts",
  "constants/pricing/pricing.individuals.ts",
  "constants/pricing/pricing.lawyers.ts",
  "constants/pricing/pricing.library.ts",
  "constants/pricing/pricing.micro.ts",
  "constants/pricing/pricing.ngo.ts",
  "constants/pricing/pricing.providers.ts",
  "lib/pricing/plans.ts",
  "components/pricing/PricingCards.tsx",
  "components/pricing/PricingHero.tsx",
  "app/laws/components/PaywallModal.tsx",
  "app/laws/subscribe/page.tsx",
  "app/pro/page.tsx",
  "app/services/consultations/page.tsx",
  "app/services/contracts/page.tsx",
  "app/services/arbitration/page.tsx",
];

const SUPERLATIVE_BADGES: RegExp[] = [
  /الأكثر\s*(طلب|اعتماد|قيمة|مبيع|شعبية|استخدام|شيوع|إنجاز)/,
  /الأوفر/,
  /الأفضل/,
  /most popular/i,
  /best value/i,
  /best choice/i,
];

test("Q164: no popularity or superlative badge is rendered on a pricing surface", () => {
  for (const path of PRICING_SURFACES) {
    const text = code(path);
    for (const pattern of SUPERLATIVE_BADGES) {
      assert.doesNotMatch(text, pattern, `${path} still carries ${pattern}`);
    }
  }
});

test("no invented discount: the 50% launch claim and the made-up «was» prices are gone", () => {
  for (const path of PRICING_SURFACES) {
    const text = code(path);
    assert.doesNotMatch(text, /خصم\s*٥٠٪|50%\s*launch/i, `${path}: «خصم ٥٠٪» launch claim`);
  }
  // The library and firm-library plans had struck-through prices nobody charged.
  assert.doesNotMatch(code("constants/pricing/pricing.library.ts"), /priceOriginal/);
  // /laws/subscribe struck through ٦٠٠ / ٢,٤٠٠ ﷼ above the real price.
  const subscribe = code("app/laws/subscribe/page.tsx");
  assert.doesNotMatch(subscribe, /line-through/);
  assert.doesNotMatch(subscribe, /٦٠٠ ﷼|٢,٤٠٠ ﷼|SAR 600|SAR 2,400/);
  // …and a «وفّر ١٦٪» toggle over plans whose price never changes with it.
  assert.doesNotMatch(subscribe, /وفّر|وفر|Save \d/);
});

test("no percentage saving that the prices do not produce", () => {
  // Annual = 10 × monthly on every toggled plan: two months (≈17%), not 15%.
  assert.doesNotMatch(code("components/pricing/PricingHero.tsx"), /-15%|١٥٪-/);
  // «وفر ٥٥٪»: no combination of the listed plans gives 55%.
  const individuals = code("constants/pricing/pricing.individuals.ts");
  assert.doesNotMatch(individuals, /٥٥٪|55%/);
});

test("no insurance boilerplate and no instant-activation promise on individuals plans", () => {
  const individuals = code("constants/pricing/pricing.individuals.ts");
  assert.doesNotMatch(individuals, /فحص طبي|medical/i);
  // Every subscription request is reviewed before activation.
  assert.doesNotMatch(individuals, /قبول فوري|Instant activation/);
});

test("no amount mixes Arabic-Indic and Latin digits (the «٥,٩٨8» typo)", () => {
  for (const path of PRICING_SURFACES) {
    assert.doesNotMatch(code(path), /[٠-٩][,٬]?[0-9]|[0-9][,٬]?[٠-٩]/, `${path}: mixed-digit amount`);
  }
});

test("the comment stripper keeps string content that merely contains '//'", () => {
  // Guard for the helper above: the URL must survive, the trailing comment
  // must not, so a badge hidden after a URL on one line would still be seen.
  const sample = 'const a = "https://x.test/p"; // «الأكثر طلباً»\nconst b = "الأوفر";';
  const stripped = sample
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
  assert.match(stripped, /https:\/\/x\.test\/p/);
  assert.doesNotMatch(stripped, /الأكثر طلباً/);
  assert.match(stripped, /الأوفر/);
});
