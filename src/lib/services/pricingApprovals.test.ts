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
  assert.ok(fromTable.size >= 8, "the catalog tools the table prices carry their ids");
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
});

test("library subscription buttons point to live routes", () => {
  assert.doesNotMatch(library, /ctaHref: "\/subscribe\?plan=lib-/);
  assert.equal((library.match(/\/laws\/subscribe\?plan=lib-/g) ?? []).length, 6);
  assert.equal((library.match(/\/contact\?type=firm-library/g) ?? []).length, 6);
});

test("individual pricing pyramid includes approved plans and per-service pricing", () => {
  assert.equal((individuals.match(/isBetaHidden: false/g) ?? []).length, 10);
  assert.match(individuals, /id: "pay-per-piece"/);
  assert.match(individuals, /id: "ind-ai"/);
  assert.match(individuals, /id: "ind-preventive"/);
  assert.match(individuals, /id: "ind-litigation"/);
  assert.match(individuals, /id: "ind-family"/);
  assert.match(individuals, /priceMonthly: "حسب الخدمة"/);
  assert.match(individuals, /priceYearly: "بدون اشتراك"/);
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
