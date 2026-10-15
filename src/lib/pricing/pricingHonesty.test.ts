/**
 * pricingHonesty.test.ts — copy guards for the pricing and checkout surfaces.
 *
 * Owner decisions this file holds the code to:
 *   - Q164 (2026-10-03): no popularity or superlative badges — no data backs
 *     «الأكثر طلباً», «الأكثر اعتماداً», «الأكثر قيمة», "Best Value" …
 *   - no discount the prices do not produce (struck-through "was" prices that
 *     were never charged, «خصم ٥٠٪», «-15%», «وفر ٥٥٪», «وفّر ١٦٪»).
 *   - Q3/Q28: payments happen outside the platform, there is no Escrow, and
 *     digital-plan fees are refundable within 14 days unless AI points were
 *     used.
 * Plus: a working checkout path, Arabic plan names on the Arabic page, and
 * no price for an AI tool whose page is «قريباً».
 *
 * Source text is read with readFileSync (the pattern pricingApprovals.test.ts
 * uses): the pricing constants import phosphor icons and React at runtime, and
 * the pages are .tsx, so neither can be loaded by `node --test`. Comments are
 * stripped first, because the comments that explain each removal quote the
 * removed wording.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { LAWYER_AI_TOOLS, getLawyerAiBadge } from "../../constants/lawyerAiCatalog.ts";

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
  assert.doesNotMatch(subscribe, /٦٠٠ (?:﷼|ر\.س)|٢,٤٠٠ (?:﷼|ر\.س)|SAR 600|SAR 2,400/);
  // …and a «وفّر ١٦٪» toggle over plans whose price never changes with it.
  assert.doesNotMatch(subscribe, /وفّر|وفر|Save \d/);
});

test("Q131: prices are written «ر.س» — no «﷼» symbol, no «ريال» unit and no «ر.س.» on a price surface", () => {
  for (const path of PRICING_SURFACES) {
    const text = code(path);
    assert.doesNotMatch(text, /﷼/, `${path}: «﷼» instead of «ر.س»`);
    assert.doesNotMatch(text, /ريال/, `${path}: «ريال» instead of «ر.س»`);
    assert.doesNotMatch(text, /ر\.س\./, `${path}: «ر.س.» instead of «ر.س»`);
  }
  // Price surfaces outside the pricing pages that used to print «﷼».
  for (const path of [
    "components/LegalLibraryBanner.tsx",
    "components/EscalationFlow.tsx",
    "app/services/business/company-formation/page.tsx",
    "app/services/business/trademark/page.tsx",
    "app/dashboard/lawyer/finance/page.tsx",
    "app/dashboard/admin/subscriptions/page.tsx",
  ]) {
    assert.doesNotMatch(code(path), /﷼/, `${path}: «﷼» instead of «ر.س»`);
  }
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

test("Q3/Q28: no Escrow promise on plans, provider pricing or the firm wallet", () => {
  const escrow = /escrow|الضمان المالي|حساب الأمانات|محفظة الضمان/i;
  for (const path of [
    ...PRICING_SURFACES,
    "app/dashboard/provider/profile/page.tsx",
    "app/dashboard/firm/wallet/page.tsx",
    "app/refund-policy/page.tsx",
  ]) {
    assert.doesNotMatch(code(path), escrow, `${path} still promises Escrow`);
  }
});

test("Q3/Q28: no page says the platform holds fees and releases them on delivery", () => {
  // Escrow by function, without the word: «لا تُصرف إلا بعد الإنجاز»,
  // «تُسدَّد عبر المنصة», "released to the lawyer", «ضمان مالي كامل».
  const holding = /تُصرف|صرف الأتعاب عبر المنصة|تُسدَّد الأتعاب عبر|عبر قنوات الدفع المعتمدة|ضمان مالي كامل|released|paid through the platform|financial guarantee/i;
  for (const path of [
    "app/services/individuals/page.tsx",
    "app/services/business/page.tsx",
    "app/services/legal-representation/page.tsx",
    "app/pro/page.tsx",
  ]) {
    assert.doesNotMatch(code(path), holding, `${path} still describes the platform holding fees`);
  }
});

test("Q28: the refund policy states the 14-day digital-plan rule", () => {
  const refund = code("app/refund-policy/page.tsx");
  assert.ok(
    refund.includes(
      "الرسوم المدفوعة للباقات الرقمية تخضع لسياسة استرداد خلال ١٤ يوماً ما لم يتم استهلاك نقاط الذكاء الاصطناعي",
    ),
    "the owner's Q28 sentence is missing from /refund-policy",
  );
  assert.match(refund, /refundable within 14 days, unless AI points have been consumed/);
});

test("checkout: the pay-per-piece CTA points at a client page that exists", () => {
  const individuals = code("constants/pricing/pricing.individuals.ts");
  assert.doesNotMatch(individuals, /\/dashboard\/client\/draft/);
  assert.equal((individuals.match(/ctaHref: "\/dashboard\/client\/services"/g) ?? []).length, 2);
  assert.ok(existsSync(new URL("../../app/dashboard/client/services/page.tsx", import.meta.url)));
});

test("checkout: /pricing asks for a plan by id, not by its display name", () => {
  const cards = code("components/pricing/PricingCards.tsx");
  assert.doesNotMatch(cards, /requested_ref:\s*plan\.name/);
  assert.match(cards, /requestEntitlement\(planEntitlementRequest\(plan, \{ libraryMode \}\)\)/);
});

test("checkout: client signup keeps ?plan= and no longer offers the retired shield/group plans", () => {
  const page = code("app/register/client/page.tsx");
  assert.match(page, /params\.get\("plan"\)/);
  assert.match(page, /requestedPlan=\{/);
  const steps = code("app/register/client/components/Steps.tsx");
  assert.doesNotMatch(steps, /عرض التأسيس|Founder 296|٧٥٠ ر\.س/);
  assert.match(steps, /requestEntitlement\(planEntitlementRequest\(plan\)\)/);
});

/** The `ar` and `en` plan lists of every `export const plans…` object in a file. */
function planLists(path: string): { name: string; ar: string; en: string }[] {
  const text = code(path);
  const out: { name: string; ar: string; en: string }[] = [];
  for (const chunk of text.split(/export const /).slice(1)) {
    const name = chunk.slice(0, chunk.search(/[\s:=]/));
    if (!name.startsWith("plans")) continue;
    const arAt = chunk.indexOf("ar: [");
    const enAt = chunk.indexOf("\n  en: [");
    if (arAt < 0 || enAt < 0) continue;
    out.push({ name, ar: chunk.slice(arAt, enAt), en: chunk.slice(enAt) });
  }
  return out;
}

const PLAN_FILES = PRICING_SURFACES.filter((p) => p.startsWith("constants/pricing/pricing."));

test("Arabic plan lists show Arabic plan names (no «Firm Basic», no «/ Enterprise»)", () => {
  let lists = 0;
  for (const path of PLAN_FILES) {
    for (const list of planLists(path)) {
      lists++;
      for (const m of list.ar.matchAll(/\bname: "([^"]*)"/g)) {
        // "AI" alone is accepted (the owner's «الباقة الذكية (AI الذاتي)»).
        assert.doesNotMatch(m[1], /[A-Za-z]{3,}/, `${path} ${list.name}.ar: «${m[1]}»`);
      }
    }
  }
  assert.ok(lists >= 10, `expected the pricing plan lists, found ${lists}`);
  const firms = code("constants/pricing/pricing.firms.ts").split("\n  en: [")[0];
  assert.doesNotMatch(firms, /Beta-ready|Backend-ready|اختيار (Growth|Scale)|target: "Enterprise"/);
});

test("no plan id repeats inside one list (React key), and each language keeps its own cards", () => {
  for (const path of PLAN_FILES) {
    for (const list of planLists(path)) {
      for (const [lang, seg] of [["ar", list.ar], ["en", list.en]] as const) {
        const ids = [...seg.matchAll(/\bid: "([^"]*)"/g)].map((m) => m[1]);
        assert.equal(new Set(ids).size, ids.length, `${path} ${list.name}.${lang}: duplicate id in ${ids.join(", ")}`);
      }
    }
  }
  const providers = planLists("constants/pricing/pricing.providers.ts")[0];
  assert.doesNotMatch(providers.ar, /Independent Consultant/);
  assert.match(providers.en, /Independent Consultant/);
});

test("a coming-soon AI tool is neither priced on the hub nor sold on /pricing", () => {
  const soon = LAWYER_AI_TOOLS.filter((t) => t.comingSoon);
  assert.ok(soon.some((t) => t.permission === "ai:direction-support"), "direction-support is a «قريباً» page");
  const lawyerTables = code("constants/pricing/pricing.lawyers.ts");
  for (const tool of soon) {
    assert.equal(getLawyerAiBadge(tool, "ar"), "قريباً");
    assert.equal(getLawyerAiBadge(tool, "en"), "Coming soon");
    // No points row for it in the services price list (lawyerServicesTable)
    // or the reference table beside it.
    assert.ok(
      !lawyerTables.includes(`name: "${tool.titleAr}`),
      `${tool.titleAr} is still priced in pricing.lawyers.ts`,
    );
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
