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

test("/pricing disclaimer: the unlisted tools really are charged and really are not rows", async () => {
  const { PRICED_AI_TOOL_IDS } = await import("../ai/toolPointsDisplay.ts");
  // The table's source, not the module (it imports icons and "@/" paths).
  const table = src("constants/pricing/pricing.lawyers.ts").split("export const lawyerServicesTable")[1];
  const listed = new Set(
    [...table.matchAll(/aiTool: (\[[^\]]*\]|"[^"]+")/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])),
  );
  assert.ok(listed.size >= 8, `parsed only ${listed.size} priced rows`);
  const unlisted = PRICED_AI_TOOL_IDS.filter((id) => !listed.has(id));
  assert.deepEqual([...unlisted].sort(), ["analyze-strength", "canvas-card", "case-brief", "communicate", "contract-drafter", "contract-negotiator", "contract-review", "quick-answer"]);
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
  const { catalogPriceLabel, dualAudiencePriceLabel } = await import("../pricing/catalogPriceLabel.ts");
  const code = src("constants/servicesData.ts").replace(/^\s*\/\/.*$/gm, "");
  // Charged by nothing: the retired card prices.
  assert.doesNotMatch(code, /٢٤٩|١٩٩|١٤٩|٤٩٩|\b249\b|\b199\b|\b149\b|\b499\b/);
  assert.doesNotMatch(code, /price: "[^"]*[0-9٠-٩]/, "a typed price is back in servicesData");
  assert.equal((code.match(/price: catalogPrice\("contract-review", "(ar|en)"\)/g) ?? []).length, 2);
  assert.equal((code.match(/price: catalogPrice\("case-study", "(ar|en)"\)/g) ?? []).length, 2);
  assert.equal((code.match(/price: AFTER_ASSESSMENT\.(ar|en)/g) ?? []).length, 4, "notary + tracking, both languages");
  // What those calls render is the catalogue row the request form charges from
  // — for contract review both audiences' (S6, q327: 600 individuals / 800 business).
  assert.match(src("constants/servicesData.ts"), /dualAudiencePriceLabel\(serviceId, CLIENT_SERVICE_CATALOG, lang\)/);
  assert.equal(dualAudiencePriceLabel("contract-review", CLIENT_SERVICE_CATALOG, "ar"), "يبدأ من ٦٠٠ ر.س للأفراد · يبدأ من ٨٠٠ ر.س للأعمال");
  assert.equal(dualAudiencePriceLabel("contract-review", CLIENT_SERVICE_CATALOG, "en"), "From 600 SAR (individuals) · From 800 SAR (business)");
  assert.equal(dualAudiencePriceLabel("case-study", CLIENT_SERVICE_CATALOG, "ar"), "يبدأ من ١٬٦٠٠ ر.س");
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
  const { dualAudiencePriceLabel } = await import("../pricing/catalogPriceLabel.ts");
  const contracts = src("app/services/contracts/page.tsx").replace(/^\s*\/\/.*$/gm, "");
  const tiers = contracts.split("const pricingTiers")[1].split("const faqs")[0];
  assert.doesNotMatch(tiers, /٢٤٩|٤٩٩|"249"|"499"/);
  assert.doesNotMatch(tiers, /بالذكاء الاصطناعي|AI-powered/);
  assert.equal((tiers.match(/price: reviewPrice\("(ar|en)"\)/g) ?? []).length, 2);
  assert.match(contracts, /dualAudiencePriceLabel\("contract-review", CLIENT_SERVICE_CATALOG, lang\)/);
  // The card on /services/individuals reads the same rows (S6: both audiences).
  assert.equal(dualAudiencePriceLabel("contract-review", CLIENT_SERVICE_CATALOG, "ar"), "يبدأ من ٦٠٠ ر.س للأفراد · يبدأ من ٨٠٠ ر.س للأعمال");

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

// Fix round 2 widened this from the `ai: [...]` arrays to every string /pricing
// renders for these audiences: the plan descriptions, the feature lists and
// the comparison tables (pricing.companies.comparison.ts was how the gated
// tools survived round 1).
const I6_GATED = /CorpMind|Deal Intel|LegalMail|Doc Analyzer|تحليل مستندات|تقييم مخاطر|Risk Assessment|رادار (ال)?امتثال|[Cc]ompliance [Rr]adar|حزمة AI|AI suite|جميع أدوات|All AI tools|صائغ|Drafter|مراجع العقود|Contract Reviewer|\dAI|AI Contract Review|مراجعة عقود AI|فحص صحة|فحص ٣٦٠|360°|Health Check|استخدامات|uses \//;
const I6_SOON = /قريباً|coming soon|^Soon$/;
const I6_PLAN_FILES = [
  "constants/pricing/pricing.companies.ts",
  "constants/pricing/pricing.companies.legaldept.ts",
  "constants/pricing/pricing.government.ts",
];
const stripLineComments = (code: string) => code.replace(/^\s*\/\/.*$/gm, "");

test("I6: the companies, legal-department and government plans sell no gated AI tool", () => {
  for (const path of I6_PLAN_FILES) {
    const code = stripLineComments(src(path));
    const ai = [...code.matchAll(/ai: \[([^\]]*)\]/g)].map((m) => m[1]).join("\n");
    assert.ok(ai.length > 0, path);
    assert.match(ai, /أدوات الذكاء الاصطناعي: قريباً/);
    assert.match(ai, /AI tools: coming soon/);
    // Every feature-list item (ai, platform, support) that is not itself a
    // «قريباً» line names no gated tool.
    const items = [...code.matchAll(/(?:ai|platform|support): \[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/"([^"]*)"/g)].map((s) => s[1]));
    assert.ok(items.length > 0, path);
    for (const item of items) {
      if (I6_SOON.test(item)) continue;
      assert.doesNotMatch(item, I6_GATED, `${path}: «${item}» sells a gated tool`);
    }
    // The card descriptions promise no AI and no compliance radar.
    const descs = [...code.matchAll(/desc: "([^"]*)"/g)].map((m) => m[1]);
    assert.ok(descs.length > 0, path);
    for (const desc of descs) {
      assert.doesNotMatch(desc, I6_GATED, `${path}: desc «${desc}»`);
      assert.doesNotMatch(desc, /\bAI\b|الذكاء الاصطناعي|رادار|[Cc]ompliance/, `${path}: desc «${desc}»`);
    }
  }
});

test("I6: the companies and government comparison tables match the trimmed cards", () => {
  for (const path of ["constants/pricing/pricing.companies.comparison.ts", "constants/pricing/pricing.government.ts"]) {
    const code = stripLineComments(src(path));
    const rows = [...code.matchAll(/\{\s*feature: "([^"]*)",([^}]*)\}/g)].map((m) => ({
      feature: m[1],
      values: [...m[2].matchAll(/"([a-z-]+)": (?:"([^"]*)"|(true|false))/g)].map((v) => v[2] ?? v[3]),
    }));
    assert.ok(rows.length >= 6, path);
    for (const { feature, values } of rows) {
      assert.ok(values.length > 0, `${path}: «${feature}» has no plan values`);
      // A row about an AI tool or the compliance radar shows «قريباً» in every
      // plan (or "not included": false / ❌), never a quota or a tier.
      if (/\bAI\b|الذكاء الاصطناعي|رادار|Radar|CorpMind|فحص|Health Check/.test(feature)) {
        for (const v of values) assert.match(v, /قريباً|^Soon$|^false$|^❌$/, `${path}: «${feature}» sells «${v}»`);
      } else {
        // Any other row names no gated tool.
        assert.doesNotMatch(feature, I6_GATED, `${path}: row «${feature}»`);
      }
      for (const v of values) {
        assert.doesNotMatch(v, I6_GATED, `${path}: «${feature}» = «${v}»`);
        assert.doesNotMatch(v, /\bAI\b|خصم من النقاط|Uses points/, `${path}: «${feature}» = «${v}»`);
      }
    }
  }

  // The lawyer contract-review counts in the table are the plan cards' counts.
  const cards = stripLineComments(src("constants/pricing/pricing.companies.ts"));
  const arCards = cards.slice(0, cards.indexOf("  en: ["));
  const table = stripLineComments(src("constants/pricing/pricing.companies.comparison.ts"));
  const arTable = table.slice(0, table.indexOf("  en: ["));
  const reviewRow = arTable.split('feature: "مراجعة عقود محامٍ",')[1].split("}")[0];
  const ids = [...arCards.matchAll(/\{ id: "(biz-[a-z-]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 9);
  for (const id of ids) {
    const block = arCards.split(`{ id: "${id}"`)[1].split("{ id: ")[0];
    const card = block.match(/"مراجعة عقود محامٍ: ([^"]+)"/)?.[1]
      ?? (block.includes("مراجعة عقود + صياغة: حسب العقد") ? "حسب العقد" : "❌");
    assert.match(reviewRow, new RegExp(`"${id}": "${card}"`), `${id}: the table disagrees with the card («${card}»)`);
  }
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

// ── fix round 1b ─────────────────────────────────────────────────────────────

test("1b: /services/contracts claims no AI analysis — the lawyer's service, and no fake AI demo", () => {
  const page = src("app/services/contracts/page.tsx").replace(/^\s*\/\/.*$/gm, "");
  // The AI contract reviewer is beta-gated; nothing on the page may say AI does the work.
  assert.doesNotMatch(page, /\bAI\b|الذكاء الاصطناعي|ذكاء نظامي/);
  assert.doesNotMatch(page, /مسح AI|تحليل AI|AI Analysis|AI Scan|بمساعدة الذكاء/);
  // The demo and its mock output are gone.
  assert.doesNotMatch(page, /mockClauses|riskColors|اكتمل التحليل|Analysis complete|تم اكتشاف ٣ بنود/);
  // What replaced them describes the lawyer's review.
  assert.match(page, /صياغة ومراجعة العقود على يد محامٍ متخصص/);
  assert.match(page, /label: "إسناد المحامي"/);
  assert.match(page, /q: "كيف تتم مراجعة العقد؟"/);
  assert.match(page, /title: "تقرير مخاطر مكتوب"/);
});

test("1b: the ai-letter card says what /dashboard/client/letters does — a template, no AI", () => {
  // The page runs no model: no useAiRun, no AI route, no gate.
  const workflow = src("app/dashboard/client/_components/ClientLetterWorkflow.tsx");
  assert.doesNotMatch(workflow, /useAiRun|\/api\/v1\/ai\//);
  assert.doesNotMatch(src("app/dashboard/client/letters/page.tsx"), /useAiRun|\/api\/v1\/ai\//);
  const catalog = src("constants/clientServiceCatalog.ts");
  const row = catalog.split('serviceId: "ai-letter"')[1].split("serviceId:")[0].replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(row, /\bAI\b|الذكاء الاصطناعي/);
  assert.doesNotMatch(row, /aiPowered: true/, "the card's «AI» chip");
  assert.match(row, /label: "خطاب رسمي من قالب استرشادي"/);
});

// ── fix round 2 ──────────────────────────────────────────────────────────────

test("2: /services/consultations invites nobody to the gated AI it marks «غير متاحة حالياً»", () => {
  const page = src("app/services/consultations/page.tsx").replace(/^\s*\/\/.*$/gm, "");
  // The AI card still says it is unavailable.
  assert.match(page, /غير متاحة حالياً/);
  assert.match(page, /not available yet/);
  // The hero and the FAQ no longer send the visitor to it.
  assert.doesNotMatch(page, /استعن بذكاء نظامي|use Nezamy AI/);
  assert.doesNotMatch(page, /أداة مساعدة ممتازة|excellent aid/);
  assert.match(page, /q: "هل ذكاء نظامي متاح الآن؟", a: "ليس بعد؛ ذكاء نظامي غير متاح حالياً\./);
  assert.match(page, /q: "Is Nezamy AI available now\?", a: "Not yet; Nezamy AI is not available at the moment\./);
});

test("provider dashboard: no invented KPI figures or banner counts", () => {
  const page = src("app/dashboard/provider/page.tsx");
  assert.doesNotMatch(page, /٤,٧٥٠|\+١٢٪|أرباح الشهر|بعد عمولة المنصة/);
  assert.doesNotMatch(page, /طلبات جديدة تنتظرك/);
  assert.match(page, /إحصاءات أعمالك/);
  assert.match(page, /قريباً/);
});

test("/pro/marketplace: no hero stats", () => {
  const page = src("app/pro/marketplace/page.tsx");
  assert.doesNotMatch(page, /value: "٥٠\+"|value: "١٠٠٪"|موثّقة ومعتمدة/);
});

test("consultations: no wait time is promised anywhere on the page", () => {
  assert.doesNotMatch(src("app/services/consultations/page.tsx"), /في دقائق|خلال دقائق|in minutes/i);
});
