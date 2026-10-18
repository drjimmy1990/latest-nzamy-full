import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
// A namespace import, so a missing export fails its own test, not the file.
import * as catalog from "../../constants/lawyerAiCatalog.ts";

const lawyers = readFileSync(new URL("../../constants/pricing/pricing.lawyers.ts", import.meta.url), "utf8");
const pricingCards = readFileSync(new URL("../../components/pricing/PricingCards.tsx", import.meta.url), "utf8");
const library = readFileSync(new URL("../../constants/pricing/pricing.library.ts", import.meta.url), "utf8");
const individuals = readFileSync(new URL("../../constants/pricing/pricing.individuals.ts", import.meta.url), "utf8");
const providerRegistration = readFileSync(
  new URL("../../app/register/provider/data.ts", import.meta.url),
  "utf8",
);

// Owner answers ١٧٤ / ١٧٨ / ١٧٩ (2026-10-16): one subscription and four top-ups.
// The library is no longer bundled into the packs (whether lawyers get it is
// owner question ٢٠٨), and the free-memo offers are gone.
test("the lawyer tab is the 399 subscription with 1,500 points plus four top-ups", () => {
  assert.match(lawyers, /id: "lawyer-pro"[\s\S]*?priceMonthly: "٣٩٩", priceYearly: "٣٬٩٩٠"/);
  assert.match(lawyers, /LAWYER_PRO_MONTHLY_POINTS = 1500/);
  const topups: Array<[string, string, string]> = [
    ["topup-100", "١٠٠", "١٠٠ نقطة"],
    ["topup-250", "٢٥٠", "٣٠٠ نقطة"],
    ["topup-500", "٥٠٠", "٧٠٠ نقطة"],
    ["topup-1000", "١٬٠٠٠", "١٬٥٠٠ نقطة"],
  ];
  for (const [id, price, points] of topups) {
    assert.match(lawyers, new RegExp(`id: "${id}"[\\s\\S]*?priceMonthly: "${price}"[\\s\\S]*?desc: "${points}"`), id);
  }
  assert.doesNotMatch(lawyers, /lawyer-(basic|advanced|elite|royal)|مشمولة مجاناً|مذكرة مجانية|مذكرة ثانية|أول ٥٠٠/);
  assert.doesNotMatch(lawyers, /محفظة|رصيد نقدي/);
});

// ── Owner answer ٢١٦ (2026-10-18): the point ranges for the remaining tools ──

interface PriceRow { name: string; points: number; pointsLabel?: string; tools: string[] }

/** The rows of `lawyerServicesTable` (the price list under the lawyer cards). */
function serviceRows(): PriceRow[] {
  const start = lawyers.indexOf("export const lawyerServicesTable");
  const end = lawyers.indexOf("export const comparisonLawyers");
  assert.ok(start >= 0 && end > start, "lawyerServicesTable is in pricing.lawyers.ts");
  const table = lawyers.slice(start, end);
  return [
    ...table.matchAll(
      /\{ name: "([^"]+)", points: (\d+)(?:, pointsLabel: "([^"]+)")?(?:, tools: \[([^\]]*)\])?(?:, note: "[^"]*")? \}/g,
    ),
  ].map((m) => ({
    name: m[1],
    points: Number(m[2]),
    pointsLabel: m[3],
    tools: [...(m[4] ?? "").matchAll(/"([^"]+)"/g)].map((t) => t[1]),
  }));
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** What the table prints in the cost column: the label, else the number. */
function rowLabel(row: PriceRow): string {
  return row.pointsLabel ?? String(row.points).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

test("٢١٦: the six newly priced tools are listed with the owner's ranges", () => {
  const rows = serviceRows();
  const expected: Array<[string, number, string]> = [
    ["الصياغة من نموذج", 5, "٥–٨"],
    ["مولّد أسئلة الاستجواب", 5, "٥–٨"],
    ["منقح ناجز", 5, "٥–٨"],
    ["المحاكي القضائي", 15, "١٥–٢٠"],
    ["تقرير العناية الواجبة", 15, "١٥–٢٠"],
    ["الرأي الفصل", 15, "١٥–٢٠"],
  ];
  for (const [name, points, label] of expected) {
    const row = rows.find((r) => r.name === name);
    assert.ok(row, `no row «${name}» in lawyerServicesTable`);
    assert.equal(row.points, points, name);
    assert.equal(row.pointsLabel, label, name);
  }
  // The archive is not a 0-point («مجاني دائماً») row: it is a note.
  assert.ok(!rows.some((r) => r.name.includes("الأرشيف")), "the archive must not be a free row");
  assert.match(lawyers, /"الأرشيف السحابي: ضمن سعة الباقة"/);
  assert.match(pricingCards, /LAWYER_ARCHIVE_NOTE/);
});

test("٢١٦: the comparator and the translator are not priced (both still return canned output)", () => {
  for (const row of serviceRows()) {
    assert.doesNotMatch(row.name, /المقارن الذكي|المترجم القانوني/, `«${row.name}» prices a canned tool`);
    assert.ok(!row.tools.includes("ai:compare") && !row.tools.includes("ai:legal-translate"), row.name);
  }
  const byPermission = new Map(catalog.LAWYER_AI_TOOLS.map((t) => [t.permission, t]));
  for (const id of ["ai:compare", "ai:legal-translate"] as const) {
    const tool = byPermission.get(id);
    assert.ok(tool, id);
    // No badge today; «قريباً» once W7 T7.6 marks the page coming-soon.
    const badge = catalog.getLawyerAiBadge(tool, "ar");
    assert.ok(badge === null || badge === "قريباً", `${id} still shows a price on the hub: «${badge}»`);
  }
});

test("٢١٦: every hub badge is the price-list label or absent (one source for tool costs)", () => {
  const exported = (catalog as { TOOL_POINT_LABELS?: Record<string, string> }).TOOL_POINT_LABELS;
  assert.ok(exported, "lawyerAiCatalog.ts exports TOOL_POINT_LABELS");
  const labels: Record<string, string> = exported;
  const rows = serviceRows();

  // The map and the table say the same thing, both ways round.
  const fromTable = new Map<string, string>();
  for (const row of rows) for (const id of row.tools) {
    assert.ok(!fromTable.has(id), `${id} is priced by two rows`);
    fromTable.set(id, rowLabel(row));
  }
  // Five since owner answer ١١٥: analyze (٨), transcriber and secretary (٥,
  // one shared row) were unpriced until they work — their pages say «قريباً».
  // The owner's figures are kept in the TOOL_POINT_LABELS comment for when
  // they come back. Not a regression: a tool that cannot answer is not sold.
  assert.ok(fromTable.size >= 5, "the catalog tools the table prices carry their ids");
  assert.deepEqual(Object.fromEntries(fromTable), labels);

  const nonPrice = new Set(["قريباً", "بيتا مجاني", "مجاني"]);
  for (const tool of catalog.LAWYER_AI_TOOLS) {
    const ar: string | null = catalog.getLawyerAiBadge(tool, "ar");
    const en: string | null = catalog.getLawyerAiBadge(tool, "en");
    if (ar !== null && nonPrice.has(ar)) continue;
    const label: string | undefined = labels[tool.permission];
    if (label === undefined) {
      assert.equal(ar, null, `${tool.permission}: «${ar}» has no row in the price list`);
      assert.equal(en, null, tool.permission);
      continue;
    }
    assert.ok(ar !== null && ar.startsWith(`${label} `), `${tool.permission}: «${ar}» is not the table's «${label}»`);
    assert.match(ar ?? "", /^\S+ (نقطة|نقاط)$/, tool.permission);
    const latin: string = label.replace(/[٠-٩]/g, (d: string) => String(AR_DIGITS.indexOf(d)));
    assert.equal(en, `${latin} pts`, tool.permission);
  }
  // The old catalog figures (500 / 300 / 100 … points) are gone as a source.
  assert.ok(!catalog.LAWYER_AI_TOOLS.some((t) => "pointCost" in t), "LawyerAiTool.pointCost is a second price source");
});

test("٢١٦: the price list does not say points are deducted on every use (enforcement is off)", () => {
  assert.doesNotMatch(pricingCards, /تُخصم[^\n]*كل استخدام|لكل استخدام|per use/i);
  assert.match(pricingCards, /قائمة أسعار الأدوات بالنقاط/);
  assert.match(pricingCards, /الخصم الآلي[^\n"]*الدفع الإلكتروني/);
  assert.match(pricingCards, /automatic deduction[^\n"]*electronic payment/i);
  // The lawyer card at provider registration made the same claim (fix round 1).
  assert.doesNotMatch(providerRegistration, /خصم النقاط|تُخصم|[Pp]oints deducted|deducted per/);
  assert.ok(providerRegistration.includes('"أسعار الأدوات بالنقاط حسب قائمة الأسعار"'), "provider registration (ar)");
  assert.ok(providerRegistration.includes('"Tool prices in points per the price list"'), "provider registration (en)");
});

test("library subscription buttons point to live routes", () => {
  assert.doesNotMatch(library, /ctaHref: "\/subscribe\?plan=lib-/);
  assert.equal((library.match(/\/laws\/subscribe\?plan=lib-/g) ?? []).length, 6);
  assert.equal((library.match(/\/contact\?type=firm-library/g) ?? []).length, 6);
});

test("individual pricing pyramid includes approved plans and per-service pricing", () => {
  // Four plans × two languages (the 699 family plan merged, owner ٢١٣/١٧٦).
  assert.equal((individuals.match(/isBetaHidden: false/g) ?? []).length, 8);
  assert.match(individuals, /id: "pay-per-piece"/);
  assert.match(individuals, /id: "ind-ai"/);
  assert.match(individuals, /id: "ind-preventive"/);
  assert.match(individuals, /id: "ind-litigation"/);
  assert.doesNotMatch(individuals, /ind-family/);
  assert.match(individuals, /priceMonthly: "حسب الخدمة"/);
  assert.match(individuals, /priceYearly: "بدون اشتراك"/);
});

// ── Owner answers ٢١٣ + ١٧٦ (2026-10-18): «التأمين القانوني» with family cover ─

const plansTs = readFileSync(new URL("../../lib/pricing/plans.ts", import.meta.url), "utf8");

/** One plan object, from its id to the line that closes it. */
function planBlock(text: string, from: number, id: string): string {
  const start = text.indexOf(`id: "${id}"`, from);
  assert.ok(start >= 0, `plan ${id} not found`);
  return text.slice(start, text.indexOf("\n    },", start));
}

test("٢١٣/١٧٦: the 699 family plan is gone from the individuals plans and their comparison", () => {
  assert.doesNotMatch(individuals, /ind-family|٦٩٩|٦٬٩٩٠|\b699\b|6,990/);
  assert.doesNotMatch(plansTs, /ind-family|\b699\b|\b6990\b/);
});

test("٢١٣/١٧٦: ind-litigation is «التأمين القانوني» at 399 / 3,990 with the family option", () => {
  const enAt = individuals.indexOf("\n  en: [");
  const ar = planBlock(individuals, 0, "ind-litigation");
  const en = planBlock(individuals, enAt, "ind-litigation");
  assert.match(ar, /name: "التأمين القانوني"/);
  assert.match(ar, /priceMonthly: "٣٩٩",\s*priceYearly: "٣٬٩٩٠"/);
  // Dependants at 20 / 30 / 40% off: ٣١٩, ٢٧٩, then ٢٣٩ from the third on.
  assert.match(ar, /٣١٩ ر\.س[^"]*٢٧٩ ر\.س[^"]*٢٣٩ ر\.س/);
  for (const line of ["٣٥٬٠٠٠–٥٠٬٠٠٠ ر.س سنوياً", "٣٬٠٠٠–٥٬٠٠٠ نقطة شهرياً", "تُضاف التغطية العائلية بطلب يراجعه الفريق"]) {
    assert.ok(ar.includes(line), `ar: «${line}»`);
  }
  assert.match(ar, /footnote: "\* تطبق الشروط والأحكام"/);

  assert.match(en, /name: "Legal Insurance"/);
  assert.match(en, /priceMonthly: "399",\s*priceYearly: "3,990"/);
  assert.match(en, /SAR 319[^"]*SAR 279[^"]*SAR 239/);
  assert.match(en, /footnote: "\* Terms and conditions apply"/);

  const canonical = planBlock(plansTs, 0, "ind-litigation");
  assert.match(canonical, /nameAr: "التأمين القانوني"/);
  assert.match(canonical, /priceMonthly: 399,\s*priceYearly: 3990/);
  assert.match(canonical, /٣١٩ ر\.س[^"]*٢٧٩ ر\.س[^"]*٢٣٩ ر\.س/);
  assert.ok(canonical.includes("تُضاف التغطية العائلية بطلب يراجعه الفريق"));
  assert.match(canonical, /footnoteAr: "\* تطبق الشروط والأحكام"/);
  assert.match(canonical, /footnoteEn: "\* Terms and conditions apply"/);
});

test("٢١٣: the footnote renders, small and grey, under the card on both pages", () => {
  const services = readFileSync(new URL("../../app/services/individuals/page.tsx", import.meta.url), "utf8");
  assert.match(services, /\{\(isAr \? plan\.footnoteAr : plan\.footnoteEn\) && \(/);
  assert.match(services, /text-\[11px\] text-ink-faint[^"]*">\s*\{isAr \? plan\.footnoteAr : plan\.footnoteEn\}/);
  // Three plans now, so three columns.
  assert.doesNotMatch(services, /lg:grid-cols-4/);
  assert.match(pricingCards, /\{plan\.footnote && \(/);
  assert.match(pricingCards, /text-\[11px\][\s\S]{0,120}\{plan\.footnote\}/);
});

test("retired shield and group plans are removed", () => {
  assert.doesNotMatch(individuals, /id: "shield"/);
  assert.doesNotMatch(individuals, /id: "group"/);
});

test("provider registration no longer sells the retired monthly AI plans", () => {
  assert.doesNotMatch(providerRegistration, /AI قانوني غير محدود|Unlimited legal AI/);
  assert.doesNotMatch(providerRegistration, /price: "١٩٩"|price: "٤٩٩"|price: "199"|price: "499"/);
  // Owner answer ١٧٥: the firm ERP is 990/month for 3 seats, not 17,988/year.
  assert.doesNotMatch(providerRegistration, /١٧٬٩٨٨|17,988/);
  assert.match(providerRegistration, /price: "٩٩٠"/);
  assert.match(providerRegistration, /ERP مجاني للمحامي الفرد/);
  assert.doesNotMatch(providerRegistration, /محفظة/);
});

// ── Owner answer ٢١٧ (2026-10-18): extra seats are sold through sales ─────────
// The 200–250 SAR/month range is the sales team's internal guide; no public
// page shows it (pricingHonesty.test.ts) and no page quotes a seat price.

const SALES_LINE_AR = "مقاعد إضافية: تواصل مع المبيعات";
const SALES_LINE_EN = "Extra seats: contact sales";
const SALES_HREF = "/contact?type=firm-seats";

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

test("٢١٧: every firm plan sends extra seats to sales, with a link", () => {
  const firms = readFileSync(new URL("../../constants/pricing/pricing.firms.ts", import.meta.url), "utf8");
  const [firmsAr, firmsEn = ""] = firms.split("\n  en: [");
  assert.equal(count(firmsAr, `salesLine: { label: "${SALES_LINE_AR}", href: "${SALES_HREF}" }`), 2, "both Arabic firm plans");
  assert.equal(count(firmsEn, `salesLine: { label: "${SALES_LINE_EN}", href: "${SALES_HREF}" }`), 2, "both English firm plans");
  assert.doesNotMatch(firms, /مقاعد إضافية عند الطلب|Extra seats on request/);
  // The card renders the line as a link.
  assert.match(pricingCards, /plan\.salesLine && \(/);
  assert.match(pricingCards, /href=\{plan\.salesLine\.href\}/);

  const pro = readFileSync(new URL("../../app/pro/page.tsx", import.meta.url), "utf8");
  assert.equal(count(pro, `salesLine: { ar: "${SALES_LINE_AR}", en: "${SALES_LINE_EN}", href: "${SALES_HREF}" }`), 2, "/pro: both firm plans");
  assert.match(pro, /href=\{plan\.salesLine\.href\}/);
  // The office plan bundles no points, so it does not include the lawyer plan.
  assert.doesNotMatch(pro, /ما في باقة المحامي المحترف|Everything in Professional Lawyer/);

  // Registration: a plan card is a <button>, so the line is text there.
  assert.ok(providerRegistration.includes(`"${SALES_LINE_AR}"`), "provider registration (ar)");
  assert.ok(providerRegistration.includes(`"${SALES_LINE_EN}"`), "provider registration (en)");
});

test("٢١٧: no stale firm price or seat price is left on the firm surfaces", () => {
  // The four yearly tiers (17,988 / 47,988 / 95,988 / 179,988) and their seat
  // prices (2,388 / 2,988 / 3,588). The same digits are also the live NGO,
  // provider and legal-department prices, so the scan is the firm files.
  const stale = /(?<![\d٠-٩,٬])(?:17,?988|47,?988|95,?988|179,?988|2,?388|2,?988|3,?588|١٧[,٬]?٩٨٨|٢[,٬]?٣٨٨|٢[,٬]?٩٨٨|٣[,٬]?٥٨٨)(?![\d٠-٩])/;
  for (const path of [
    "constants/pricing/pricing.firms.ts",
    "app/pro/page.tsx",
    "app/register/provider/data.ts",
    "app/dashboard/admin/pricing/page.tsx",
    "constants/firmProfileReadiness.ts",
  ]) {
    const text = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, stale, `${path} still carries a stale firm price`);
  }
  const admin = readFileSync(new URL("../../app/dashboard/admin/pricing/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(admin, /"firm-growth"|"firm-scale"/, "admin pricing: plans that no longer exist");
  const readiness = readFileSync(new URL("../../constants/firmProfileReadiness.ts", import.meta.url), "utf8");
  const contracts = readiness.slice(readiness.indexOf("export const FIRM_PLAN_CONTRACTS"), readiness.indexOf("export const FIRM_ROLE_CONTRACTS"));
  assert.match(contracts, /plan: "firm-basic",\s*annualPrice: 9900,\s*includedSeats: 3,\s*extraSeatAnnualPrice: null,\s*includedAnnualPoints: 0,/);
  assert.match(contracts, /plan: "firm-enterprise",\s*annualPrice: 14900,\s*includedSeats: 5,\s*extraSeatAnnualPrice: null,\s*includedAnnualPoints: 0,/);
  assert.doesNotMatch(contracts, /firm-growth|firm-scale/);
});
