/**
 * pricingHonesty.test.ts — copy guards for the pricing and checkout surfaces.
 *
 * Owner decisions this file holds the code to:
 *   - Q164 (2026-10-03): no popularity or superlative badges — no data backs
 *     «الأكثر طلباً», «الأكثر اعتماداً», «الأكثر قيمة», "Best Value" …
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
