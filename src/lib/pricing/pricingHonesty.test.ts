/**
 * pricingHonesty.test.ts — copy guards for the pricing and checkout surfaces.
 *
 * Owner decisions this file holds the code to:
 *   - Q164 (2026-10-03): no popularity or superlative badges — no data backs
 *     «الأكثر طلباً», «الأكثر اعتماداً», «الأكثر قيمة», "Best Value" …
 *   - no discount the prices do not produce (struck-through "was" prices that
 *     were never charged, «خصم ٥٠٪», «-15%», «وفر ٥٥٪», «وفّر ١٦٪»).
 *   - Q3/Q28 and ١٨٠ (2026-10-16): payments happen outside the platform, there
 *     is no Escrow and no 8% / 15% commission, and a digital subscription is
 *     refundable within 14 days while no more than 5% of its points are used
 *     and no paid memo was exported.
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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { LAWYER_AI_TOOLS, TOOL_POINT_LABELS, getLawyerAiBadge } from "../../constants/lawyerAiCatalog.ts";
import type { AudienceTab } from "../../constants/pricing/pricing.types.ts";
import { BUSINESS_USER_TYPES, PAYABLE_ITEMS } from "../payments/catalog.ts";
import { VAT_NOTICE, vatNoticeFor } from "./vatNotice.ts";
import { USER_TYPE_TO_AUDIENCE } from "./audienceForUserType.ts";

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
  "lib/pricing/vatNotice.ts",
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
    // Its cards and FAQ render on /services/individuals (N7, 2026-10-16).
    "constants/servicesData.ts",
    "app/services/business/page.tsx",
    "app/services/legal-representation/page.tsx",
    "app/pro/page.tsx",
    // Owner answer ١٨٠: sections ٢ and ٤ used to collect, hold and pay out fees.
    "app/refund-policy/page.tsx",
  ]) {
    assert.doesNotMatch(code(path), holding, `${path} still describes the platform holding fees`);
  }
});

test("١٨٠: the refund policy carries the owner's two clauses verbatim", () => {
  const refund = code("app/refund-policy/page.tsx");
  assert.ok(
    refund.includes(
      "يحق للمشترك ممارسة حق العدول واسترداد كامل قيمة الاشتراك الرقمي خلال (١٤) يوماً من تاريخ السداد وفق نظام التجارة الإلكترونية ولائحته، بشرط عدم استهلاك أكثر من ٥٪ من رصيد وحدات الاستخدام (النقاط) أو تصدير مذكرات مدفوعة.",
    ),
    "the owner's subscription clause is missing from /refund-policy",
  );
  assert.ok(
    refund.includes(
      "تمثل علاقة تعاقدية مباشرة بين العميل ومكتب المحاماة المستقل المرخص عبر بوابة دفع معتمدة ومرخصة من البنك المركزي (SAMA)، ولا تحتفظ المنصة بأي أموال في حساب وسيط، وتخضع لسياسة الإلغاء الكامل قبل ٢٤ ساعة من موعد الجلسة الاستشارية.",
    ),
    "the owner's professional-fees clause is missing from /refund-policy",
  );
  assert.ok(refund.includes("no more than 5% of the usage units (points) has been consumed"), "the English subscription clause is missing");
});

test("١٨٠: no platform commission on the refund page or the pricing price list", () => {
  const commission = /عمولة المنصة|٥٪–١٥٪|٨٪ عمولة|رسوم منصة|عمولة منصة|platform fee|platform's commission|8% commission|15% fee/i;
  for (const path of ["app/refund-policy/page.tsx", "constants/pricing/pricing.common.ts"]) {
    assert.doesNotMatch(code(path), commission, `${path} still states a platform commission`);
  }
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
  // The request card is shared with the onboarding wizard (P1 item 4).
  assert.match(steps, /import PlanRequestCard from "@\/components\/pricing\/PlanRequestCard";/);
  assert.match(steps, /<PlanRequestCard plan=\{requestedPlan\} canRequestNow=\{canRequestNow\} \/>/);
  const card = code("components/pricing/PlanRequestCard.tsx");
  assert.match(card, /requestEntitlement\(planEntitlementRequest\(plan\)\)/);
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
  const soonIds = new Set<string>(soon.map((t) => t.permission));
  const lawyerTables = code("constants/pricing/pricing.lawyers.ts");

  // By id, not by name (owner ١١٥ fix round): a row is tied to its tools by
  // `tools: [...]`, and a row's wording need not start with a tool's title —
  // «التفريغ الصوتي الذكي وأوامر السكرتير» sold two «قريباً» tools and passed
  // the old title-prefix check. Every `tools` list anywhere in the file counts.
  const lists = [...lawyerTables.matchAll(/tools: \[([^\]]*)\]/g)];
  assert.ok(lists.length >= 5, `found only ${lists.length} tools lists — the parser broke`);
  for (const [, list] of lists) {
    for (const [, id] of list.matchAll(/"([^"]+)"/g)) {
      assert.ok(!soonIds.has(id), `${id} is «قريباً» but a pricing.lawyers.ts row still prices it`);
    }
  }

  for (const tool of soon) {
    assert.equal(getLawyerAiBadge(tool, "ar"), "قريباً");
    assert.equal(getLawyerAiBadge(tool, "en"), "Coming soon");
    // No second price source on the hub side either.
    assert.ok(!(tool.permission in TOOL_POINT_LABELS), `${tool.permission} still has a hub point label`);
  }

  // And no row, plan-card line or feature bullet that opens with its name, in
  // ANY pricing file (fix round 2): the lawyer card listed «عصارة المرفقات
  // وتلخيص ملف القضية: ٨ نقاط» with no tools id, and the provider-elite card
  // in pricing.providers.ts sold «السكرتير الذكي + تنبيهات».
  const pricingDir = new URL("../../constants/pricing/", import.meta.url);
  const pricingFiles = readdirSync(pricingDir).filter((f) => f.endsWith(".ts"));
  assert.ok(pricingFiles.length >= 10, `found only ${pricingFiles.length} pricing files — the listing broke`);
  for (const file of pricingFiles) {
    const body = code(`constants/pricing/${file}`);
    for (const tool of soon) {
      for (const title of [tool.titleAr, tool.titleEn]) {
        assert.ok(!body.includes(`"${title}`), `«${title}» is «قريباً» but constants/pricing/${file} still sells it`);
      }
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

// ── N7 (fix plan 2026-10-16): claims nothing on the platform backs ───────────

test("N7: no library size literal — the subscribe page shows the live count", () => {
  const size = /5,000\+|\+٥٬٠٠٠|٥٬٠٠٠\+/;
  for (const path of PRICING_SURFACES) assert.doesNotMatch(code(path), size, `${path}: library size literal`);
  const subscribe = code("app/laws/subscribe/page.tsx");
  assert.match(subscribe, /useLibraryStats\(\)/);
  assert.match(subscribe, /formatLibraryCount\(library\.stats\[key\],/);
  assert.match(subscribe, /LIBRARY_STAT_KEYS\.map\(/);
  assert.match(subscribe, /statTiles\.map\(/);
});

test("N7: /services/individuals promises no ministry accreditation and no response time", () => {
  for (const path of ["app/services/individuals/page.tsx", "constants/servicesData.ts"]) {
    const c = code(path);
    assert.doesNotMatch(c, /معتمدون من وزارة العدل|Ministry of Justice certified/, `${path}: MoJ accreditation`);
    assert.doesNotMatch(c, /١٥ دقيقة|15 minutes|بدون انتظار|no wait/i, `${path}: response-time promise`);
  }
});

test("N7: the government dashboard shows no invented KPIs or activity", () => {
  const gov = code("app/dashboard/government/page.tsx");
  assert.doesNotMatch(gov, /KPI_BY_ROLE|RECENT_ACTIONS|آخر النشاطات|بياناتك التشغيلية/);
  assert.doesNotMatch(gov, /معدل الإنجاز|أعلى من المعدل الوطني/);
});

test("N7: the admin overview reads nothing it invents, and every shortcut opens a real page", () => {
  const admin = code("app/dashboard/admin/page.tsx");
  assert.doesNotMatch(admin, /MRR_DATA|USERS_TABLE|PLAN_DIST|AI_TOOLS|ALERTS|MRRChart|981000/);
  assert.doesNotMatch(admin, /تصدير|<Download/, "no export button wired to nothing");
  const hrefs = [...admin.matchAll(/href: "(\/dashboard\/admin[^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 6, "the shortcuts are listed");
  for (const href of hrefs) {
    assert.ok(existsSync(new URL(`../../app${href}/page.tsx`, import.meta.url)), `${href} has no page`);
  }
});

test("N7: the firm wallet is an honest coming-soon page, not mock transactions", () => {
  const wallet = code("app/dashboard/firm/wallet/page.tsx");
  assert.match(wallet, /<DashboardComingSoon title="محفظة المكتب"/);
  assert.doesNotMatch(wallet, /MOCK_TRANSACTIONS|TRX-\d+/);
});

// ── P1 item 2 (fix plan 2026-10-16): the claims seen next to N7's ────────────

/** Every surface the P1 claims pass touched, plus the pricing surfaces above. */
const CLAIM_SURFACES = [
  ...PRICING_SURFACES,
  "app/login/page.tsx",
  "constants/servicesData.ts",
  "constants/clientServiceCatalog.ts",
  "components/pricing/PricingCTA.tsx",
  "app/services/individuals/page.tsx",
  "app/services/business/page.tsx",
  "app/services/notary/page.tsx",
  "app/services/tracking/page.tsx",
  "app/services/lawyers/page.tsx",
  "app/services/corporate/seconded-counsel/page.tsx",
  "app/settings/components/tabs/HelpTab.tsx",
  "components/floating/wa-steps/StepSuccessAndService.tsx",
  "app/dashboard/client/consultation/new/page.tsx",
  "app/invite/[code]/page.tsx",
  "app/join/page.tsx",
  "app/faq/page.tsx",
  "components/legal-opinion/ContextConsult.tsx",
  "components/legal-opinion/ContextStudy.tsx",
];

const UNSUPPORTED_CLAIMS: [RegExp, string][] = [
  // Support keeps the hours on /contact; no AI tool has an uptime commitment.
  [/٢٤\/٧|24\/7|على مدار الساعة|around the clock/i, "round-the-clock availability"],
  // Nothing watches for new legislation: the library is loaded by hand.
  [/تحديثات (يومية|فورية)|تحديثات تشريعية لحظية|لحظة الصدور|فور (صدور|الصدور)|تتبع التحديثات فوراً|daily updates|updated in real-time|instant (legislative|amendment) alerts/i, "real-time / daily legislative updates"],
  [/واتساب أولوية|أولوية عبر واتساب|priority whatsapp/i, "priority WhatsApp support"],
  // Points replaced the 2,500 SAR/year AI add-on (gap analysis 2026-10-16 §2).
  [/إضافة باحث|مساعد باحث الذكاء|AI (Legal )?Researcher Add-on|AI Add-on/i, "the withdrawn AI add-on"],
  [/معتمدون رسمياً|معتمدون لدى الجهات الرسمية|officially certified|accredited with official/i, "official accreditation"],
  [/ضمان استرداد|money-back guarantee|refund guarantee/i, "a refund guarantee beyond the 14-day rule"],
  [/متابعة لحظية|تحديث القضية لحظياً|real-time (case|transaction) tracking|إشعارا?ت? فوري|instant (completion )?notification/i, "real-time tracking / instant notification"],
  [/٢٧ قسم|27 قسم/, "a «27 sections» count with no source"],
];

test("P1 item 2: no surface makes a claim the product cannot support", () => {
  for (const path of CLAIM_SURFACES) {
    const c = code(path);
    for (const [re, what] of UNSUPPORTED_CLAIMS) assert.doesNotMatch(c, re, `${path}: ${what}`);
  }
});

test("٢١٧: the sales team's internal seat range (200–250 SAR) is on no public page", () => {
  // Owner answer ٢١٧: extra seats are «تواصل مع المبيعات»; the range is a
  // negotiating guide for the CRM, not a public price.
  const range = /٢٠٠\s*[–-]\s*٢٥٠|200\s*[–-]\s*250/;
  let files = 0;
  for (const dir of ["app", "components", "constants"]) {
    const root = new URL(`../../${dir}/`, import.meta.url);
    for (const entry of readdirSync(root, { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      files++;
      assert.doesNotMatch(src(`${dir}/${entry.replace(/\\/g, "/")}`), range, `${dir}/${entry}`);
    }
  }
  assert.ok(files > 100, `scanned ${files} files`);
});

test("P1 item 2: /login shows live library counts, not «٢٤/٧» or «١٠٠٪ آمن»", () => {
  const login = code("app/login/page.tsx");
  // ("100%" alone is legitimate here: an SVG <rect width="100%">.)
  assert.doesNotMatch(login, /١٠٠٪|stat2Value|stat3Value|"Secure"/);
  assert.match(login, /STAT_KEYS\.map\(/);
  assert.match(login, /formatLibraryCount\(library\.stats\[key\],/);
});

test("P1 item 2: /services/individuals counts its own service cards", () => {
  const page = code("app/services/individuals/page.tsx");
  assert.doesNotMatch(page, /٦ خدمات|6 comprehensive|6 Comprehensive/);
  assert.match(page, /serviceList\.length\.toLocaleString\(/);
});

test("P1 item 2: the CTA's refund line states the refund page's condition", () => {
  const cta = code("components/pricing/PricingCTA.tsx");
  assert.match(cta, /استرداد خلال ١٤ يوماً ما لم يُستهلك أكثر من ٥٪ من النقاط/);
});

// ── Task 1.6 (owner ٢٠١–٢٠٣): an invite code opens the library, nothing else ──
// Since 2026-10-18 a library invitation code grants the legal library for 30
// days (a library grant, no plan tier, no AI search), so its copy may promise
// neither Pro nor «البحث الذكي».

test("T1.6: the invite-code copy promises the library for 30 days, not Pro or smart search", () => {
  const banner = code("components/InvitationBanner.tsx");
  assert.doesNotMatch(banner, /البحث الذكي/, "banner: smart search");
  assert.doesNotMatch(banner, /\bPro\b/, "banner: Pro");
  assert.match(banner, /فعّله لتفتح نصوص المكتبة القانونية كاملة لمدة ٣٠ يوماً\./);

  const subscribe = code("app/laws/subscribe/page.tsx");
  const faqs = subscribe.match(/faqs: \[[\s\S]*?\n {4}\],/g) ?? [];
  assert.equal(faqs.length, 2, "the Arabic FAQ and its English twin");
  for (const faq of faqs) {
    assert.doesNotMatch(faq, /باقة Pro/, "FAQ: «باقة Pro»");
    assert.doesNotMatch(faq, /Pro tier/i, "FAQ: Pro tier");
  }
  assert.match(subscribe, /إن كان لديك كود دعوة، فإنه يفتح المكتبة القانونية كاملة لمدة ٣٠ يوماً فور تفعيله، دون انتظار\./);
  assert.match(subscribe, /If you have an invitation code, it opens the full legal library for 30 days as soon as you redeem it — no waiting\./);
});

test("P1 item 1: the admin AI-usage pages are honest coming-soon pages", () => {
  for (const path of [
    "app/dashboard/admin/ai-usage/page.tsx",
    "app/dashboard/admin/ai-usage/credits/page.tsx",
    "app/dashboard/admin/ai-usage/reports/page.tsx",
  ]) {
    const c = code(path);
    assert.match(c, /<DashboardComingSoon\b/, path);
    assert.doesNotMatch(c, /TOOLS|TOP_CONSUMERS|CREDITS|QUALITY|Telemetry/, `${path}: invented figures`);
  }
});

// ── Task 5.4 (owner ١٩٩ / ٢٠٨, 2026-10-18): the library subscription is texts ──
// A library plan opens the library's texts, not the AI tools (those spend the
// user's points), and no plan says the library is free: it is a subscription.

const ADVANCED_SEARCH_AR = "بحث متقدّم في المكتبة القانونية";
const ADVANCED_SEARCH_EN = "Advanced search in the legal library";

test("١٩٩: no library plan mentions AI or «smart» search; each card says «بحث متقدّم في المكتبة القانونية»", () => {
  const library = code("constants/pricing/pricing.library.ts");
  assert.doesNotMatch(library, /\bAI\b/, "pricing.library.ts: «AI»");
  assert.doesNotMatch(library, /ذكي|الذكاء|[Ss]mart/, "pricing.library.ts: smart / AI search");
  // Three individual plans and four firm plans, in each language.
  assert.equal(library.split(`"${ADVANCED_SEARCH_AR}"`).length - 1, 7);
  assert.equal(library.split(`"${ADVANCED_SEARCH_EN}"`).length - 1, 7);

  // The same plans as plans.ts and the /laws paywall describe them.
  const plans = code("lib/pricing/plans.ts");
  const standalone = plans.slice(plans.indexOf("STANDALONE_LIBRARY_PLANS"), plans.indexOf("INDIVIDUALS_PYRAMID_PLANS"));
  assert.ok(standalone.length > 0, "STANDALONE_LIBRARY_PLANS was not found");
  assert.doesNotMatch(standalone, /ذكي|[Ss]mart|\bAI\b/, "plans.ts library plans: smart / AI search");
  const paywall = code("app/laws/components/PaywallModal.tsx");
  const paywallPlans = paywall.slice(paywall.indexOf("export const PLANS"), paywall.indexOf("export function PaywallModal"));
  assert.doesNotMatch(paywallPlans, /ذكي|[Ss]mart|\bAI\b/, "PaywallModal plans: smart / AI search");
});

test("G5: the firm library plans keep their prices and seats (٢٠٠ — «تبقى كما هي»)", () => {
  const firmLibrary = code("constants/pricing/pricing.library.ts").split("export const plansFirmsLibrary")[1] ?? "";
  for (const [price, seats] of [["٤٬٨٠٠", "١–٥ مقاعد نشطة"], ["١٢٬٠٠٠", "٦–٢٠ مقعداً نشطاً"], ["٢٤٬٠٠٠", "٢١–٥٠ مقعداً نشطاً"]]) {
    assert.match(firmLibrary, new RegExp(`priceMonthly: "${price}",\\s*priceYearly:  "${price}"`), price);
    assert.ok(firmLibrary.includes(`"${seats}"`), seats);
  }
});

test("٢٠٨: no plan says the legal library is free", () => {
  for (const path of PRICING_SURFACES) {
    assert.doesNotMatch(code(path), /المكتبة( القانونية)? مجان|[Ff]ree (legal )?[Ll]ibrary/, `${path}: a free-library claim`);
  }
  const providers = code("constants/pricing/pricing.providers.ts");
  assert.doesNotMatch(providers, /Full Legal Library/);
  assert.ok(providers.includes('"المكتبة القانونية باشتراك"'), "provider-elite (ar)");
  assert.ok(providers.includes('"Legal library by subscription"'), "provider-elite (en)");
  assert.match(providers, /feature: "المكتبة القانونية",[^}]*"provider-elite": "باشتراك"/);
  assert.match(providers, /feature: "Legal Library",[^}]*"provider-elite": "By subscription"/);
  // Fix round 1: nothing pays for the library in points either (١٩٩ / ٢٠٨).
  assert.doesNotMatch(providers, /المكتبة القانونية \(٥٠ نقطة|٥٠ نقطة\/شهر|Legal Library \(50 pts|50 pts\/mo/);
  assert.equal(providers.split('"المكتبة القانونية باشتراك"').length - 1, 2, "provider-pro and provider-elite (ar)");
  assert.equal(providers.split('"Legal library by subscription"').length - 1, 2, "provider-pro and provider-elite (en)");
  assert.match(providers, /feature: "المكتبة القانونية",[^}]*"provider-pro": "باشتراك"/);
  assert.match(providers, /feature: "Legal Library",[^}]*"provider-pro": "By subscription"/);
});

test("fix round 1: the library cards promise no legislative alerts and no invite-trial length", () => {
  const library = code("constants/pricing/pricing.library.ts");
  // No code notifies a library subscriber of new legislation.
  assert.doesNotMatch(library, /إشعارات تشريعية|legislative (alerts|notifications|updates)/i);
  // Nothing grants a 60- or 90-day invite trial: the redeem flow is 30 days
  // and a colleague invite uses the invitation's own trial_days (٢٠٣). So no
  // card — and not the header comment — states a length.
  const raw = src("constants/pricing/pricing.library.ts");
  assert.doesNotMatch(raw, /تجربة [١٢٣] ?(شهر|أشهر)|تجربة ٢ شهر|تجربة ٣ أشهر|\d-month trial|\d+-day invite trial/);
  assert.equal(library.split('"٣ دعوات للزملاء لتجربة المكتبة"').length - 1, 6, "three individual + three firm cards (ar)");
  assert.equal(library.split('"3 invitations for colleagues to try the library"').length - 1, 6, "the English twins");
});

test("P15: the subscribe and /pricing FAQs promise no prorated upgrade or billing cycle (there is no gateway)", () => {
  // /laws/subscribe, and the /pricing FAQ in pricing.common.ts (fix round 1).
  for (const path of ["app/laws/subscribe/page.tsx", "constants/pricing/pricing.common.ts"]) {
    const faq = code(path);
    assert.doesNotMatch(faq, /تناسبياً|دورة الفوترة|الترقية فورية|prorat|billing cycle|instant and free/i, path);
    assert.ok(faq.includes("يمكنك طلب الترقية أو التغيير في أي وقت؛ يراجع الفريق الطلب ويفعّله يدوياً."), `${path}: AR answer`);
    assert.ok(
      faq.includes("You can request an upgrade or a change at any time; the team reviews the request and activates it manually."),
      `${path}: EN answer`,
    );
  }
});

test("Task 7 ruling: /laws/subscribe says «reviewed» only while online payment is off", () => {
  const subscribe = code("app/laws/subscribe/page.tsx");
  // gateway off: today's review copy, unchanged
  assert.ok(subscribe.includes('plansSub: "اختر الخطة المناسبة — يُراجع طلبك ويُفعَّل الاشتراك بعد الموافقة.",'));
  assert.ok(subscribe.includes("عند الضغط على «اشترك الآن» يُرسَل طلبك للمراجعة، ويقوم فريقنا بتفعيل خطتك بعد الموافقة عليه."));
  // gateway on: the payment activates the subscription
  assert.ok(subscribe.includes("يُفعَّل الاشتراك فور إتمام الدفع الإلكتروني"), "intro, gateway on");
  assert.ok(subscribe.includes("بعد الدفع الإلكتروني يُفعَّل الاشتراك تلقائياً؛ وما زال بإمكانك تقديم طلب يراجعه الفريق"), "FAQ, gateway on");
  assert.ok(subscribe.includes("your subscription is activated as soon as the online payment completes"), "English twin");
  // …chosen by the same predicate the buy buttons use
  assert.match(subscribe, /const payOnline = gatewayAllowsCheckout\(payments\);/);
  assert.match(subscribe, /\{payOnline \? t\.plansSubPaid : t\.plansSub\}/);
  assert.match(subscribe, /\{payOnline && faq\.aPaid \? faq\.aPaid : faq\.a\}/);
});

test("٢٠٣: the colleague-invite page names the legal library and the length the server grants", () => {
  const invite = code("app/invite/[code]/page.tsx");
  // The length is the invitation's own (colleagueInviteTrialDays, 30 by
  // default), as the accept route grants it — never a hard-coded figure.
  assert.match(invite, /`وصول مجاني للمكتبة القانونية لمدة \$\{trialLengthLabel\(trialDays, true\)\}`/);
  assert.match(invite, /`Free access to the legal library for \$\{trialLengthLabel\(trialDays, false\)\}`/);
  assert.match(invite, /`سجّل الآن لتفتح المكتبة القانونية لمدة \$\{trialLengthLabel\(trialDays, true\)\}`/);
  assert.match(invite, /`Register now to open the legal library for \$\{trialLengthLabel\(trialDays, false\)\}`/);
  assert.match(invite, /`تجربة المكتبة القانونية مجانية لمدة \$\{trialLengthLabel\(trialDays, true\)\} — لا تتطلب بطاقة ائتمان`/);
  // «شهر كامل كاملة» and a vague "full access" are gone.
  assert.doesNotMatch(invite, /\$\{trialLengthLabel\(trialDays, true\)\} كاملة|of full access/);
});

// ── Owner ٢٣٩ / ٢٤٨ / ٢٤٩ (Moyasar B1, task 10): VAT per audience, top-up validity ──
// The screens say what the server charges (src/lib/payments/catalog.ts):
// lawyers, consultants, firms and every establishment pay VAT on top; the
// individuals' prices include it; the library depends on the buyer. Each
// pricing section states its rule once, under its prices — not per card.

const VAT_EXCLUSIVE_AR = "الأسعار غير شاملة ضريبة القيمة المضافة ١٥٪ وتُضاف عند الدفع ويصدر بها فاتورة ضريبية رسمية";
const VAT_EXCLUSIVE_EN = "Prices exclude 15% VAT, added at checkout with an official tax invoice";
const VAT_INCLUSIVE_AR = "الأسعار شاملة ضريبة القيمة المضافة";
const VAT_INCLUSIVE_EN = "Prices include VAT";
const VAT_LIBRARY_AR = "للأفراد: شامل الضريبة · للمحامين والمنشآت: غير شامل الضريبة";
const VAT_LIBRARY_EN = "For individuals: VAT included · For lawyers and establishments: VAT excluded";

test("٢٤٨: the three VAT sentences are the owner's, verbatim, with their English twins", () => {
  assert.deepEqual(VAT_NOTICE.exclusive, { ar: VAT_EXCLUSIVE_AR, en: VAT_EXCLUSIVE_EN });
  assert.deepEqual(VAT_NOTICE.inclusive, { ar: VAT_INCLUSIVE_AR, en: VAT_INCLUSIVE_EN });
  assert.deepEqual(VAT_NOTICE.library, { ar: VAT_LIBRARY_AR, en: VAT_LIBRARY_EN });
});

test("٢٤٨: each /pricing audience section carries its own VAT sentence", () => {
  const exclusive: AudienceTab[] = ["lawyers", "firms", "providers", "companies", "micro", "ngo", "government"];
  for (const audience of exclusive) {
    assert.deepEqual(vatNoticeFor(audience, false), VAT_NOTICE.exclusive, audience);
  }
  assert.deepEqual(vatNoticeFor("individuals", false), VAT_NOTICE.inclusive);
  // Library mode exists on the lawyers and firms tabs only (getPlanList). The
  // lawyers' library plans are the ones anyone buys, so both rules apply; the
  // firms' library plans (lib-firm-*) are sold to establishments only, so the
  // business sentence (controller ruling, task 10 fix round 1).
  assert.deepEqual(vatNoticeFor("lawyers", true), VAT_NOTICE.library);
  assert.deepEqual(vatNoticeFor("firms", true), VAT_NOTICE.exclusive);
  assert.deepEqual(vatNoticeFor("individuals", true), VAT_NOTICE.inclusive);
  assert.deepEqual(vatNoticeFor("companies", true), VAT_NOTICE.exclusive);

  // The exclusive rule covers exactly the business buyers the server charges
  // VAT on top (BUSINESS_USER_TYPES), mapped to their tabs as /pricing and
  // Settings → «الاشتراك والباقة» do (src/lib/pricing/audienceForUserType.ts).
  const entries = Object.entries(USER_TYPE_TO_AUDIENCE).map(([u, a]) => [`${u}:${a}`, u, a as string] as const);
  assert.ok(entries.length >= 8, `found only ${entries.length} user-type tabs — the parser broke`);
  for (const [, userType, audience] of entries) {
    const expected = (BUSINESS_USER_TYPES as readonly string[]).includes(userType) ? VAT_NOTICE.exclusive : VAT_NOTICE.inclusive;
    assert.deepEqual(vatNoticeFor(audience as AudienceTab, false), expected, `${userType} → ${audience}`);
  }

  // PricingCards renders the sentence once for the whole section, after the
  // cards, and no other VAT wording competes with it.
  const cards = code("components/pricing/PricingCards.tsx");
  assert.equal(cards.split("vatNoticeFor(audience, libraryMode)").length - 1, 1, "one VAT note per section");
  assert.ok(cards.includes("{isAr ? vatNotice.ar : vatNotice.en}"), "the VAT note is rendered");
  assert.doesNotMatch(cards, /SpotlightCard\([\s\S]*vatNoticeFor[\s\S]*function LawyerCreditsLayout/, "not per card");
  assert.doesNotMatch(cards, /لا تشمل ضريبة|Prices exclude VAT\./, "the old paraphrase under the points table");
});

test("٢٤٨: /laws/subscribe shows the library VAT sentence and its English twin", () => {
  const subscribe = code("app/laws/subscribe/page.tsx");
  assert.match(subscribe, /import \{ VAT_NOTICE \} from "@\/lib\/pricing\/vatNotice";/);
  assert.ok(subscribe.includes("vatNote: VAT_NOTICE.library.ar,"), "Arabic library sentence");
  assert.ok(subscribe.includes("vatNote: VAT_NOTICE.library.en,"), "English library sentence");
  assert.ok(!subscribe.includes(VAT_LIBRARY_AR) && !subscribe.includes(VAT_LIBRARY_EN), "no second copy of the sentence");
  assert.equal(subscribe.split("{t.vatNote}").length - 1, 1, "rendered once, under the plans");
});

test("٢٤٨: the /laws paywall shows the library VAT sentence once, under its plans", () => {
  const paywall = code("app/laws/components/PaywallModal.tsx");
  assert.match(paywall, /import \{ VAT_NOTICE \} from "@\/lib\/pricing\/vatNotice";/);
  const render = "{isRTL ? VAT_NOTICE.library.ar : VAT_NOTICE.library.en}";
  assert.equal(paywall.split(render).length - 1, 1, "one library sentence");
  const modal = paywall.slice(paywall.indexOf("export function PaywallModal"));
  assert.ok(modal.indexOf(render) > modal.indexOf("{PLANS.map("), "under the plan grid");
});

test("٢٤٨: /pro shows the business VAT sentence once, under its lawyer and firm prices", () => {
  const pro = code("app/pro/page.tsx");
  assert.match(pro, /import \{ VAT_NOTICE \} from "@\/lib\/pricing\/vatNotice";/);
  const render = "{isRTL ? VAT_NOTICE.exclusive.ar : VAT_NOTICE.exclusive.en}";
  assert.equal(pro.split(render).length - 1, 1, "one business sentence");
  assert.ok(pro.indexOf(render) > pro.indexOf("{plans.map("), "under the price cards");
});

/**
 * «صالحة شهراً واحداً» / «صالحة شهرين» / «صالحة ٣ أشهر» / «صالحة ١٢ شهراً»:
 * Arabic agreement for 1, 2, 3–10 (plural) and 11+ (accusative singular).
 */
function validityAr(months: number): string {
  if (months === 1) return "صالحة شهراً واحداً";
  if (months === 2) return "صالحة شهرين";
  const digits = String(months).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  return months <= 10 ? `صالحة ${digits} أشهر` : `صالحة ${digits} شهراً`;
}

test("٢٤٩: each top-up card states the validity the catalog grants", () => {
  const topups = Object.values(PAYABLE_ITEMS).filter((item) => item.kind === "topup");
  assert.equal(topups.length, 4, "four top-ups in the catalog");
  const lawyers = planLists("constants/pricing/pricing.lawyers.ts").find((l) => l.name === "plansLawyers");
  assert.ok(lawyers, "plansLawyers was not found");
  for (const item of topups) {
    const months = item.pointsValidityMonths;
    assert.ok(months, `${item.id} has no validity in the catalog`);
    for (const [lang, seg, expected] of [
      ["ar", lawyers.ar, validityAr(months)],
      ["en", lawyers.en, `valid for ${months} month${months === 1 ? "" : "s"}`],
    ] as const) {
      const block = seg.slice(seg.indexOf(`id: "${item.id}"`));
      const desc = block.match(/desc: "([^"]*)"/);
      assert.ok(seg.includes(`id: "${item.id}"`) && desc, `${item.id}.${lang}: card not found`);
      assert.ok(desc[1].endsWith(` · ${expected}`), `${item.id}.${lang}: desc «${desc[1]}» should end with «${expected}»`);
    }
  }
  // The three wordings the owner wrote (٢٤٩).
  assert.deepEqual([3, 6, 12].map(validityAr), ["صالحة ٣ أشهر", "صالحة ٦ أشهر", "صالحة ١٢ شهراً"]);
  // …and the helper's own agreement, so a future 1- or 2-month pack is held to correct Arabic.
  assert.deepEqual([1, 2, 10, 11].map(validityAr), ["صالحة شهراً واحداً", "صالحة شهرين", "صالحة ١٠ أشهر", "صالحة ١١ شهراً"]);
});
