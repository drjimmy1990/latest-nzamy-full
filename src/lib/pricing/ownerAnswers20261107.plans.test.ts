/**
 * Owner answers of 3 Nov 2026 (٤١٩–٤٢٣, ٤٣٠–٤٣٨) — the plan / price / copy
 * pieces that are not held by a pure-function test elsewhere. The pricing
 * constants import the `@/` alias and React icons, which node:test cannot
 * load, so most checks read the source.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bookSar } from "./priceBook.ts";
import { resolveRequestedPlan } from "./planRequest.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("٤١٩: the smart plan badge is the yearly 249 over 12 months, on /pricing and /services/individuals", () => {
  assert.equal(bookSar("ind-ai", "yearly") / 12, 20.75);
  for (const rel of ["constants/pricing/pricing.individuals.ts", "lib/pricing/plans.ts"]) {
    const text = src(rel);
    assert.ok(text.includes("ما يعادل ٢٠٫٧٥ ر.س شهرياً تُدفع سنوياً"), `${rel}: Arabic badge`);
    assert.ok(text.includes("≈ SAR 20.75/month, billed yearly"), `${rel}: English badge`);
    assert.doesNotMatch(text, /٠٫٦٨|0\.68/, `${rel}: the old per-day figure`);
  }
});

test("٤٢٠: «عضوية الحماية القانونية» is a «قريباً» card — no price, no signup link, never requestable", () => {
  const text = src("constants/pricing/pricing.individuals.ts");
  for (const [lang, name] of [["ar", "عضوية الحماية القانونية"], ["en", "Legal Protection Membership"]] as const) {
    const at = text.indexOf(`id: "ind-protection", name: "${name}"`);
    assert.ok(at > 0, `${lang}: card missing`);
    const card = text.slice(at, text.indexOf("features:", at));
    assert.match(card, /comingSoon: true/, lang);
    assert.doesNotMatch(card, /priceMonthly|priceYearly|\/register\//, `${lang}: no price, no signup link (question ٤٥٣)`);
  }
  assert.ok(text.includes("حماية قانونية سنوية للأفراد — تُفتح قريباً"));
  // a crafted ?plan= never resolves to it, even with a signup-looking href
  const plans = [{ id: "ind-protection", name: "x", ctaHref: "/register/client?type=individual&plan=ind-protection", comingSoon: true }];
  assert.equal(resolveRequestedPlan("ind-protection", plans), null);
  // the card renders a disabled «قريباً» button, not the subscribe link
  const cards = src("components/pricing/PricingCards.tsx");
  assert.match(cards, /comingSoon \? \(\s*<button\s+type="button"\s+disabled/);
  assert.match(cards, /const badgeText = comingSoon \? soonText : plan\.badge;/);
  assert.match(cards, /\{comingSoon \? soonText : price\}/);
});

test("٤٣٧: every corporate card carries «بعض المزايا قريباً» and no unbuilt feature line is ticked ✅", () => {
  const unbuilt = /سوق|عقود الموظفين|HR|حوكمة|تقارير|انتداب|إدارات|إشراف مجتمع|Kanban|SSO|API|Marketplace|Employee contracts|[Gg]overnance|[Rr]eports|[Ss]econdment|[Cc]ommunity|Departments/;
  for (const rel of ["constants/pricing/pricing.companies.ts", "constants/pricing/pricing.companies.legaldept.ts"]) {
    const text = src(rel);
    const cards = text.match(/\{ id: "(biz|dept)-[a-z]+-[a-z]+"/g) ?? [];
    assert.equal(cards.length, 18, `${rel}: 9 cards × 2 languages`);
    assert.equal((text.match(/someFeaturesSoon: true/g) ?? []).length, cards.length, `${rel}: a badge on every card`);
    // feature strings only (the ai / platform / support arrays)
    const features = [...text.matchAll(/(?:ai|platform|support): \[([\s\S]*?)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]));
    assert.ok(features.length > 100, `${rel}: features not found`);
    for (const f of features) {
      if (unbuilt.test(f)) assert.match(f, /قريباً|coming soon/, `${rel}: «${f}» is not built yet`);
    }
  }
  assert.match(src("components/pricing/PricingCards.tsx"), /plan\.someFeaturesSoon &&/);
});

test("٤٣٠: the fee statement says «بيان أتعاب — ليست فاتورة ضريبية إلكترونية» on the issue modal and above the list", () => {
  const page = src("app/dashboard/lawyer/finance/page.tsx");
  assert.match(page, /const FEE_STATEMENT_LABEL = "بيان أتعاب — ليست فاتورة ضريبية إلكترونية";/);
  assert.ok((page.match(/\{FEE_STATEMENT_LABEL\}/g) ?? []).length >= 3, "header, list and modal");
  for (const old of ["إصدار فاتورة جديدة", "حفظ الفاتورة وإصدارها"]) assert.ok(!page.includes(old), old);
  assert.ok(page.includes("إصدار بيان أتعاب جديد") && page.includes("حفظ بيان الأتعاب وإصداره"));
  assert.ok(!src("app/dashboard/firm/finance/page.tsx").includes(">فاتورة جديدة<") && !src("app/dashboard/firm/finance/page.tsx").includes("<span>فاتورة جديدة</span>"));
  assert.ok(!src("app/dashboard/firm/fees/page.tsx").includes("إنشاء فاتورة"));
});

test("٤٣١: the about page's line, and no page claims a model trained on Saudi law", () => {
  const about = src("app/about/page.tsx");
  assert.ok(about.includes('descAr: "بناء أدوات ذكية تعتمد الأنظمة السعودية مصدراً."'));
  assert.ok(about.includes('descEn: "Building smart tools that take Saudi law as their source."'));
  for (const rel of [
    "app/about/page.tsx", "app/ai/page.tsx", "app/ai/contract-drafter/layout.tsx", "app/ai/analyze/layout.tsx",
    "components/ServicesBento.tsx", "app/services/individuals/page.tsx", "app/services/lawyers/page.tsx",
    "components/consultation/constants.ts", "components/AIShowcase.tsx", "app/pro/page.tsx",
    "app/ai/disclaimer/page.tsx", "app/ai-disclaimer/page.tsx", "constants/servicesData.ts", "app/laws/components/AiTabContent.tsx",
  ]) {
    assert.doesNotMatch(src(rel), /مدر[ً-ْ]*ب|تدريب النماذج|[Tt]rained (on|exclusively)|exclusively trained|specifically trained/, rel);
  }
});
