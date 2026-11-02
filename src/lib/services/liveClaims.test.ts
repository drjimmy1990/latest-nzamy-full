/**
 * liveClaims.test.ts — Wave 1 task 6 (owner package of 1 Nov 2026, slice D
 * "honesty defects"): claims on live pages that nothing behind them backs.
 *
 * Source-level: each test reads the file the visitor's screen is built from
 * and fails if the false sentence comes back.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/liveClaims.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// ── §3.3b-8a: the template library has no AI behind it ───────────────────────

test("templates: no «AI-powered» / «AI مُحسَّن» claim and no isAi flag", () => {
  const page = src("app/ai/templates/page.tsx");
  const data = src("app/ai/templates/_data.tsx");
  assert.doesNotMatch(page, /AI-powered|AI مُحسَّن|AI محسن/);
  assert.doesNotMatch(page, /\.isAi\b/);
  assert.doesNotMatch(data, /isAi\s*:/, "a template still carries an «AI» flag");
  // The templates themselves stay.
  assert.ok((data.match(/\bid: "t\d+"/g) ?? []).length >= 40, "the template list was emptied");
});

// ── §3.3b-8c: the debt-collection notice composer ────────────────────────────

test("debt collection: the friendly notice asks for what is owed TO us, not by us", () => {
  const page = src("app/ai/debt-collection/page.tsx");
  assert.doesNotMatch(page, /المستحق علينا/);
  assert.match(page, /المبلغ المستحق لنا/);
});

test("debt collection: no notice calls itself an accredited legal instrument", () => {
  const page = src("app/ai/debt-collection/page.tsx");
  assert.doesNotMatch(page, /سنداً قانونياً معتمداً|سند قانوني معتمد/);
  assert.doesNotMatch(page, /جهة قانونية معتمدة|مكتب محاماة معتمد|مكتب قانوني معتمد/);
  assert.doesNotMatch(page, /نموذج جاهز للتقديم/);
  // It says what it is: a draft to review.
  assert.match(page, /مسودة إشعار؛ راجعها قبل إرسالها/);
  assert.match(page, /مسودة إنذار؛ راجعها قبل إرسالها/);
});

// ── /pricing: the lawyer price list's disclaimer (Wave 1 task 6, item A) ─────

test("/pricing disclaimer: no «unlisted tools have no price» and no deduction-start claim", () => {
  const cards = src("components/pricing/PricingCards.tsx");
  // Six charged tools are not rows of the table (quick-answer, case-brief,
  // analyze-strength, contract-drafter, communicate, canvas-card).
  assert.doesNotMatch(cards, /غير المذكورة|لم تُحدَّد تكلفتها|not listed|no price yet/i);
  // Deduction follows platform_settings.points_enforcement (ai_start_run),
  // not the e-payment launch, and the page cannot see that switch.
  assert.doesNotMatch(cards, /يبدأ الخصم|الخصم الآلي|مع إطلاق الدفع الإلكتروني|deduction from your balance starts|starts with electronic payment/i);
  assert.match(cards, /هذا الجدول قائمة أسعار أدوات المحامي بالنقاط: تكلفة كل تشغيل للأداة\./);
});

test("/pricing disclaimer: the six unlisted tools really are charged and really are not rows", async () => {
  const { PRICED_AI_TOOL_IDS } = await import("../ai/toolPointsDisplay.ts");
  // The table's source, not the module (it imports icons and "@/" paths).
  const table = src("constants/pricing/pricing.lawyers.ts").split("export const lawyerServicesTable")[1];
  const listed = new Set(
    [...table.matchAll(/aiTool: (\[[^\]]*\]|"[^"]+")/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])),
  );
  assert.ok(listed.size >= 8, `parsed only ${listed.size} priced rows`);
  const unlisted = PRICED_AI_TOOL_IDS.filter((id) => !listed.has(id));
  assert.deepEqual([...unlisted].sort(), ["analyze-strength", "canvas-card", "case-brief", "communicate", "contract-drafter", "quick-answer"]);
});

// ── item B: no comparative-law tool exists ───────────────────────────────────

test("the assistant row is «المساعد القانوني», not «… والتشريع المقارن»", () => {
  for (const path of ["constants/pricing/pricing.lawyers.ts", "constants/pricing/pricing.providers.ts"]) {
    const code = src(path).replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /التشريع المقارن|comparative law/i, path);
  }
  assert.match(src("constants/pricing/pricing.lawyers.ts"), /\{ name: "المساعد القانوني", price: \{ aiTool: "assistant" \}/);
});

// ── item C: /ai/consult starts no AI run ─────────────────────────────────────

test("ai:consult is «قريباً» on the hub, not «بيتا مجاني»", async () => {
  const { LAWYER_AI_TOOLS } = await import("../../constants/lawyerAiCatalog.ts");
  const { getLawyerAiBadge } = await import("../../constants/lawyerAiBadges.ts");
  const consult = LAWYER_AI_TOOLS.find((t) => t.permission === "ai:consult")!;
  assert.equal(consult.comingSoon, true);
  assert.equal(getLawyerAiBadge(consult, "ar"), "قريباً");
  assert.equal(getLawyerAiBadge(consult, "en"), "Coming soon");
  assert.doesNotMatch(src("app/ai/consult/page.tsx"), /useAiRun|\/api\/v1\/ai\//, "consult now runs AI — revisit its «قريباً»");
});

// ── item E: /services/individuals cards price from the catalogue ─────────────

test("services cards: no typed price; contracts and case study read the catalogue, the rest name no number", async () => {
  const { CLIENT_SERVICE_CATALOG } = await import("../../constants/clientServiceCatalog.ts");
  const { catalogPriceLabel } = await import("../pricing/catalogPriceLabel.ts");
  const code = src("constants/servicesData.ts").replace(/^\s*\/\/.*$/gm, "");
  // Charged by nothing: the retired card prices.
  assert.doesNotMatch(code, /٢٤٩|١٩٩|١٤٩|٤٩٩|\b249\b|\b199\b|\b149\b|\b499\b/);
  assert.doesNotMatch(code, /price: "[^"]*[0-9٠-٩]/, "a typed price is back in servicesData");
  assert.equal((code.match(/price: catalogPrice\("contract-review", "(ar|en)"\)/g) ?? []).length, 2);
  assert.equal((code.match(/price: catalogPrice\("case-study", "(ar|en)"\)/g) ?? []).length, 2);
  assert.equal((code.match(/price: AFTER_ASSESSMENT\.(ar|en)/g) ?? []).length, 4, "notary + tracking, both languages");
  // What those calls render is the catalogue row the request form charges from.
  assert.equal(catalogPriceLabel("contract-review", CLIENT_SERVICE_CATALOG, "ar"), "يبدأ من ٦٠٠ ر.س");
  assert.equal(catalogPriceLabel("contract-review", CLIENT_SERVICE_CATALOG, "en"), "From 600 SAR");
  assert.equal(catalogPriceLabel("case-study", CLIENT_SERVICE_CATALOG, "ar"), "يبدأ من ١٬٦٠٠ ر.س");
  assert.equal(catalogPriceLabel("case-study", CLIENT_SERVICE_CATALOG, "en"), "From 1,600 SAR");
  // No catalogue row → null (the card's own "after assessment"), never «طلب عام»'s price.
  assert.equal(catalogPriceLabel("notary", CLIENT_SERVICE_CATALOG, "ar"), null);
  // The human services claim no AI behind them.
  assert.doesNotMatch(code, /AI يكشف|بـ AI|AI flagging|AI auto-detects|AI-powered case|Success probability/);
  // The heading above the price no longer doubles «يبدأ من».
  assert.match(src("app/services/individuals/page.tsx"), /\{isAr \? "السعر" : "Price"\}/);
});

// ── item F: the 99 SAR provider plan and the marketplace prices ──────────────

test("provider dashboard: no «مزوّد خدمة مميز — ٩٩ ر.س» plan, no allowances, no upgrade button", () => {
  const page = src("app/dashboard/provider/page.tsx");
  const code = page.replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(code, /٩٩ ر\.س|99 SAR/);
  assert.doesNotMatch(code, /١٠ استخدامات\/يوم|٣\/شهر|١\/يوم مجاناً/, "an allowance of a plan nothing sells");
  assert.doesNotMatch(code, /مقفل — المميز|ترقية الآن/);
  assert.match(code, /باقة مزوّد الخدمة المميز/);
  // The consult tile opens a gated tool: «قريباً».
  assert.match(code, /\{ label: "المستشار الذكي", desc: "قريباً", +icon: Robot, +locked: false, href: "\/ai\/consult" \}/);
});

test("pro marketplace: every product says «قريباً», no typed price", () => {
  const page = src("app/pro/marketplace/page.tsx");
  const code = page.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /ر\.س|SAR \d/);
  assert.equal((code.match(/price: +SOON,/g) ?? []).length, 6);
  assert.match(code, /const SOON = \{ ar: "قريباً", en: "Coming soon" \};/);
  // Still parked behind BETA_MONOPOLY_MODE.
  assert.match(src("app/pro/marketplace/layout.tsx"), /if \(BETA_MONOPOLY_MODE\) redirect\("\/services"\);/);
});

// ── item H: a lock never names «التأمين القانوني», a plan nothing sells ──────

test("shield is unsold: no on-sale price-book plan grants it, and a lock names no plan for it", async () => {
  const fa = await import("../../hooks/featureAccess.ts");
  const { PRICE_BOOK, isOnSale } = await import("../pricing/priceBook.ts");
  const soldTiers = new Set(
    Object.values(PRICE_BOOK).filter((e) => isOnSale(e) && e.tier).map((e) => e.tier as string),
  );
  assert.ok(soldTiers.size > 0, "no on-sale tier found — the book's shape changed");
  for (const t of fa.UNSOLD_TIERS) assert.ok(!soldTiers.has(t), `${t} is on sale again — drop it from UNSOLD_TIERS`);
  assert.ok(fa.UNSOLD_TIERS.has("shield"));
  assert.equal(fa.lockTierLabelAr("shield"), null);
  assert.equal(fa.lockTierLabelAr("ai"), fa.TIER_LABELS_AR.ai);
  assert.equal(fa.lockTierLabelAr("not-a-tier"), null);
  // The gating and the holder's label are unchanged.
  assert.equal(fa.TIER_RANK.shield, 1);
  assert.equal(fa.FEATURE_GATES.marketplace, "shield");
  assert.equal(fa.FEATURE_GATES.reports, "shield");
  assert.equal(fa.FEATURE_GATES["ai-contracts"], "shield");
  assert.equal(fa.TIER_LABELS_AR.shield, "التأمين القانوني");
});

test("shield lock copy: SubscriptionGuard and the sidebar badge name no unsold plan", () => {
  const guard = src("components/dashboard/SubscriptionGuard.tsx").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(guard, /التأمين القانوني/);
  assert.match(guard, /const tierName = UNSOLD_TIERS\.has\(minTier as UserTier\) (\|\| minTier === "free" )?\? null :/);
  assert.match(guard, /featureBlocked=\{tierName \?\? undefined\}/);
  assert.match(guard, /\{LOCKED_NOT_IN_PLAN_AR\}/);
  assert.match(guard, /href="\/pricing"/);
  // UpgradeBadge prints tierLabelAr(tier); tierLabelAr goes through the lock helper.
  assert.match(src("components/dashboard/SidebarComponents.tsx"), /\{tierLabelAr\(tier\)\}/);
  assert.match(src("hooks/useSubscription.ts"), /return lockTierLabelAr\(tier\) \?\? "ترقية";/);
});

// ── fix round 1 ──────────────────────────────────────────────────────────────

test("I1: /services/contracts and /services/tracking name no price nothing charges, and agree with their cards", async () => {
  const { CLIENT_SERVICE_CATALOG } = await import("../../constants/clientServiceCatalog.ts");
  const { catalogPriceLabel } = await import("../pricing/catalogPriceLabel.ts");
  const contracts = src("app/services/contracts/page.tsx").replace(/^\s*\/\/.*$/gm, "");
  const tiers = contracts.split("const pricingTiers")[1].split("const faqs")[0];
  assert.doesNotMatch(tiers, /٢٤٩|٤٩٩|"249"|"499"/);
  assert.doesNotMatch(tiers, /بالذكاء الاصطناعي|AI-powered/);
  assert.equal((tiers.match(/price: reviewPrice\("(ar|en)"\)/g) ?? []).length, 2);
  assert.match(contracts, /catalogPriceLabel\("contract-review", CLIENT_SERVICE_CATALOG, lang\)/);
  // The card on /services/individuals reads the same row.
  assert.equal(catalogPriceLabel("contract-review", CLIENT_SERVICE_CATALOG, "ar"), "يبدأ من ٦٠٠ ر.س");

  const tracking = src("components/tracking/constants.ts").replace(/^\s*\/\/.*$/gm, "");
  const trackTiers = tracking.split("export const pricingTiers")[1];
  assert.doesNotMatch(trackTiers, /price(_num)?: "[^"]*[0-9٠-٩]/, "a tracking tier names a number again");
  assert.equal((trackTiers.match(/price: AFTER_ASSESSMENT_AR,/g) ?? []).length, 3);
  assert.equal((trackTiers.match(/price_num: AFTER_ASSESSMENT_EN,/g) ?? []).length, 3);
});

test("I2: /services/consultations shows the booking page's prices and «قريباً» for the AI tier", () => {
  const page = src("app/services/consultations/page.tsx").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(page, /price: "|currency: "/, "a typed price or currency is back");
  assert.doesNotMatch(page, /٩٩ ر|٢٩٩|"99"|"299"/);
  assert.match(page, /const \{ catalog \} = useClientPricingCatalog\(\);/);
  assert.match(page, /kind === "ai" \? COMING_SOON\[L\] : consultationTypePrice\(kind, catalog, L\)/);
  assert.equal((page.match(/\{priceOf\(item\.kind\)\}/g) ?? []).length, 2, "both card grids");
  assert.doesNotMatch(page, /إجابة فورية من الذكاء الاصطناعي|Instant AI-powered/);
});

test("I3: no «مشمول في الباقة» / 49 / 79 for ai-letter, the wizard's AI path or the chat's AI choices", async () => {
  const { CLIENT_SERVICE_CATALOG } = await import("../../constants/clientServiceCatalog.ts");
  const { formatClientServicePrice } = await import("../pricingRepository.ts");
  const letter = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === "ai-letter")!;
  assert.equal(letter.priceMode, "free");
  assert.equal(letter.basePrice, 0);
  assert.equal(letter.priceNote, undefined);
  assert.equal(letter.includedByPlan, undefined);
  assert.equal(formatClientServicePrice(letter), "مجانا");

  const wizard = src("app/dashboard/client/consultation/new/page.tsx");
  assert.match(wizard, /const aiConsultSoon = isTerminalToolHref\(aiConsultService\.route\);/);
  assert.match(wizard, /\{aiConsultSoon \? COMING_SOON_BADGE_AR : `استشارة فورية · \$\{servicePriceLabel\(aiConsultService\)\}`\}/);
  assert.match(wizard, /\{!aiConsultSoon && aiConsultService\.priceNote && \(/);
  assert.match(wizard, /\{aiPathSoon \? COMING_SOON_BADGE_AR : servicePriceLabel\(service\)\}/);
  assert.match(wizard, /\{!aiPathSoon && service\.priceNote && priceNoteDescribesSelection && \(/);

  assert.match(src("components/floating/waChatPrices.ts"), /if \(isTerminalToolHref\(service\.route\)\) \{/);
  const contract = src("components/floating/wa-steps/StepContract.tsx");
  assert.match(contract, /label: "مراجعة AI", desc: "قيد الإعداد", price: COMING_SOON_BADGE_AR, val: "ai-review"/);
});

test("I6: the companies, legal-department and government plans sell no gated AI tool", () => {
  for (const path of [
    "constants/pricing/pricing.companies.ts",
    "constants/pricing/pricing.companies.legaldept.ts",
    "constants/pricing/pricing.government.ts",
  ]) {
    const code = src(path).replace(/^\s*\/\/.*$/gm, "");
    const features = [...code.matchAll(/ai: \[([^\]]*)\]/g)].map((m) => m[1]).join("\n");
    assert.ok(features.length > 0, path);
    assert.doesNotMatch(
      features,
      /CorpMind|Deal Intel|LegalMail|Doc Analyzer|تحليل مستندات|تقييم مخاطر|Risk Assessment|رادار امتثال|Compliance radar|حزمة AI|AI suite|جميع أدوات|All AI tools|صائغ|Drafter|مراجع العقود|Contract Reviewer|\dAI|AI Contract Review|مراجعة عقود AI|فحص صحة|Health Check|استخدامات|uses \//,
      `${path} still sells a gated tool`,
    );
    assert.match(features, /أدوات الذكاء الاصطناعي: قريباً/);
    assert.match(features, /AI tools: coming soon/);
  }
  const gov = src("constants/pricing/pricing.government.ts").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(gov, /feature: "(صائغ|Judgment|Indictment|عدد الاستخدامات|Usage Limit)/);
});

test("M2, M5, M10: small honesty fixes", () => {
  const guard = src("components/dashboard/SubscriptionGuard.tsx");
  assert.match(guard, /UNSOLD_TIERS\.has\(minTier as UserTier\) \|\| minTier === "free" \? null :/);
  const gated = src("components/GatedToolScreen.tsx");
  assert.doesNotMatch(gated, /^import .*betaConfig/m, "a static betaConfig import breaks its deletion path");
  assert.match(gated, /const cfg = require\("@\/lib\/betaConfig"\);/);
  assert.doesNotMatch(src("components/consultation/constants.ts").replace(/^\s*\/\/.*$/gm, ""), /استجابة فورية|Instant response/);
  assert.doesNotMatch(src("app/ai/templates/page.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, ""), /مُرجَّعة قانونياً/);
});

test("M3: formatClientServicePrice never renders blank for an unknown mode", async () => {
  const { formatClientServicePrice } = await import("../pricingRepository.ts");
  assert.equal(formatClientServicePrice({ basePrice: 10, priceMode: "made-up" as never }), "يُحدَّد بعد المراجعة");
});
