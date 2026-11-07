import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { COMMISSION_PCT, commissionPctFor, commissionPctText, commissionRatesLine } from "./commission.ts";
import { PRICE_BOOK } from "./priceBook.ts";
import { FOUNDER_PLAN_ID } from "../membership/founderPlan.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("owner ٤٢١: 5% founders and firm-enterprise (R4), 7% other subscribers, 15% free", () => {
  assert.deepEqual({ ...COMMISSION_PCT }, { founderOrEnterprise: 5, subscriber: 7, free: 15 });
  assert.equal(commissionPctFor({ plan: FOUNDER_PLAN_ID }), 5);
  assert.equal(commissionPctFor({ plan: "firm-enterprise" }), 5);
  assert.equal(commissionPctFor({ plan: "lawyer-pro", founder: true }), 5, "a founder on any plan");
  for (const plan of ["lawyer-pro", "consultant-independent", "firm-basic", "ind-ai", "provider-pro", "provider-elite"]) {
    assert.equal(commissionPctFor({ plan }), 7, plan);
  }
  for (const plan of [null, undefined, "", "free", "provider-free"]) assert.equal(commissionPctFor({ plan }), 15, String(plan));
  // the two lowest-rate ids are real book entries
  assert.equal(PRICE_BOOK[FOUNDER_PLAN_ID]?.kind, "membership");
  assert.equal(PRICE_BOOK["firm-enterprise"]?.kind, "plan");
});

test("rate text in both languages", () => {
  assert.equal(commissionPctText(7, "ar"), "٧٪");
  assert.equal(commissionPctText(15, "en"), "15%");
  assert.equal(commissionRatesLine("ar"), "٥٪ للمؤسسين وشركات المحاماة المتكاملة · ٧٪ للمشتركين · ١٥٪ للحسابات المجانية");
});

test("the providers tab and the parked marketplace pages read the module, and no old rate is left", () => {
  const providers = src("constants/pricing/pricing.providers.ts");
  assert.match(providers, /from "@\/lib\/pricing\/commission"/);
  assert.doesNotMatch(providers, /commissionPct: \d|٢٠٪|١٠٪|"20%"|"10%"|\(٥٪\)|عمولة شبه معدومة/);
  for (const page of [
    "app/marketplace/page.tsx",
    "app/marketplace/[id]/page.tsx",
    "app/marketplace/post/page.tsx",
    "app/dashboard/provider/earnings/page.tsx",
  ]) {
    const text = src(page);
    assert.match(text, /@\/lib\/pricing\/commission/, `${page} reads commission.ts`);
    assert.doesNotMatch(text, /عمولة المنصة:? ?(15%|١٥٪)|عمولة المنصة 15%/, `${page} hard-codes the old 15%`);
  }
  // unchanged by design: the Terms keep their «٥٪–١٥٪» range; the refund page
  // and the price list still name no rate (pricingHonesty.test.ts)
});
