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
