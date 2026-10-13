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

test("approved point packages include the legal library at the documented tiers", () => {
  assert.match(lawyers, /lawyer-advanced[\s\S]*مشمولة مجاناً \(٦ أشهر\)/);
  assert.match(lawyers, /lawyer-elite[\s\S]*مشمولة مجاناً \(٦ أشهر\)/);
  assert.match(lawyers, /lawyer-royal[\s\S]*مشمولة مجاناً \(١٢ شهراً\)/);
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
  assert.match(providerRegistration, /١٧٬٩٨٨/);
  assert.match(providerRegistration, /ERP مجاني للمحامي الفرد/);
});
