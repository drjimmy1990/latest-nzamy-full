import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const lawyers = readFileSync(new URL("../../constants/pricing/pricing.lawyers.ts", import.meta.url), "utf8");
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
