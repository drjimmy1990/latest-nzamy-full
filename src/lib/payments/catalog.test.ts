/**
 * catalog.test.ts — the server price catalog and its VAT quote
 * (owner answers ٢٣٩ / ٢٤٨ / ٢٤٩).
 *
 * The consistency tests hold PAYABLE_ITEMS to the prices the site shows:
 *   - src/lib/pricing/plans.ts is pure, so it is imported;
 *   - src/constants/pricing/*.ts import phosphor icons and React, so they are
 *     read as text (the pattern pricingHonesty.test.ts uses), comments
 *     stripped, and each display string parsed with parseDisplayedAmount.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { ServerTier } from "../access-control.ts";
import {
  BUSINESS_USER_TYPES,
  buyerAllowed,
  PAYABLE_ITEMS,
  formatHalalas,
  quote,
  type Billing,
  type ServerTierLiteral,
} from "./catalog.ts";
import { parseDisplayedAmount } from "../pricing/priceDisplay.ts";
import {
  INDEPENDENT_CONSULTANT_PLAN,
  INDIVIDUALS_PYRAMID_PLANS,
  STANDALONE_LIBRARY_PLANS,
  type PricingPlan,
} from "../pricing/plans.ts";

// Type-level guard: every tier the catalog grants is a real server tier.
const _tierIsServerTier: ServerTier = "pro" as ServerTierLiteral;
void _tierIsServerTier;

const EXPECTED_IDS = [
  "lawyer-pro",
  "consultant-independent",
  "firm-basic",
  "firm-enterprise",
  "ind-ai",
  "ind-preventive",
  "ind-litigation",
  "lib-q1",
  "lib-q2",
  "lib-annual",
  "topup-100",
  "topup-250",
  "topup-500",
  "topup-1000",
];

// ─── quote ───────────────────────────────────────────────────────────────────

test("lawyer-pro monthly for a lawyer: VAT added on top (exclusive)", () => {
  const q = quote("lawyer-pro", "monthly", "lawyer");
  assert.ok(q.ok);
  assert.equal(q.vatMode, "exclusive");
  assert.equal(q.netHalalas, 39900);
  assert.equal(q.vatHalalas, 5985);
  assert.equal(q.totalHalalas, 45885);
  assert.equal(q.item.id, "lawyer-pro");
});

test("ind-ai monthly for a client: VAT inside the shown price (inclusive)", () => {
  const q = quote("ind-ai", "monthly", "client");
  assert.ok(q.ok);
  assert.equal(q.vatMode, "inclusive");
  assert.equal(q.totalHalalas, 3900);
  assert.equal(q.netHalalas, 3391); // round(3900 · 100 / 115)
  assert.equal(q.vatHalalas, 509);
});

test("lib-q1: a business buyer pays VAT on top, anyone else pays the shown price", () => {
  const lawyer = quote("lib-q1", "once", "lawyer");
  assert.ok(lawyer.ok);
  assert.equal(lawyer.vatMode, "exclusive");
  assert.equal(lawyer.netHalalas, 150000);
  assert.equal(lawyer.vatHalalas, 22500);
  assert.equal(lawyer.totalHalalas, 172500);

  for (const buyer of ["client", null]) {
    const q = quote("lib-q1", "once", buyer);
    assert.ok(q.ok, `buyer ${buyer}`);
    assert.equal(q.vatMode, "inclusive", `buyer ${buyer}`);
    assert.equal(q.totalHalalas, 150000, `buyer ${buyer}`);
    assert.equal(q.netHalalas + q.vatHalalas, 150000, `buyer ${buyer}`);
  }
});

test("lib-q1 for a micro establishment: VAT on top (controller ruling on ٢٤٨)", () => {
  const q = quote("lib-q1", "once", "micro");
  assert.ok(q.ok);
  assert.equal(q.vatMode, "exclusive");
  assert.equal(q.totalHalalas, 172500);
});

test("every business user type gets the exclusive library price", () => {
  for (const buyer of BUSINESS_USER_TYPES) {
    const q = quote("lib-annual", "once", buyer);
    assert.ok(q.ok);
    assert.equal(q.vatMode, "exclusive", buyer);
    assert.equal(q.totalHalalas, 575000, buyer);
  }
});

test("a fixed VAT mode ignores the buyer", () => {
  const indForLawyer = quote("ind-ai", "monthly", "lawyer");
  assert.ok(indForLawyer.ok);
  assert.equal(indForLawyer.vatMode, "inclusive");
  assert.equal(indForLawyer.totalHalalas, 3900);

  const proForNobody = quote("lawyer-pro", "monthly", null);
  assert.ok(proForNobody.ok);
  assert.equal(proForNobody.vatMode, "exclusive");
  assert.equal(proForNobody.totalHalalas, 45885);
});

test("unknown ids, inherited object keys and unoffered billing are refused", () => {
  assert.deepEqual(quote("nope", "monthly", "lawyer"), { ok: false, error: "unknown_item" });
  assert.deepEqual(quote("constructor", "monthly", "lawyer"), { ok: false, error: "unknown_item" });
  assert.deepEqual(quote("__proto__", "monthly", "lawyer"), { ok: false, error: "unknown_item" });
  assert.deepEqual(quote("lib-q1", "monthly", "lawyer"), { ok: false, error: "billing_not_offered" });
  assert.deepEqual(quote("topup-100", "yearly", "lawyer"), { ok: false, error: "billing_not_offered" });
  assert.deepEqual(quote("lawyer-pro", "once", "lawyer"), { ok: false, error: "billing_not_offered" });
});

test("every offered price quotes to net + vat = total, in whole halalas", () => {
  for (const item of Object.values(PAYABLE_ITEMS)) {
    for (const billing of Object.keys(item.prices) as Billing[]) {
      for (const buyer of ["lawyer", "individual", null]) {
        const q = quote(item.id, billing, buyer);
        assert.ok(q.ok, `${item.id} ${billing}`);
        assert.ok(Number.isInteger(q.netHalalas) && Number.isInteger(q.vatHalalas));
        assert.equal(q.netHalalas + q.vatHalalas, q.totalHalalas, `${item.id} ${billing}`);
      }
    }
  }
});

// ─── catalog shape ───────────────────────────────────────────────────────────

test("PAYABLE_ITEMS holds exactly the sold ids, each keyed by its own id", () => {
  assert.deepEqual(Object.keys(PAYABLE_ITEMS).sort(), [...EXPECTED_IDS].sort());
  for (const [key, item] of Object.entries(PAYABLE_ITEMS)) assert.equal(item.id, key);
});

test("prices, grants and VAT mode as the owner set them", () => {
  const expected: Record<string, { prices: Partial<Record<Billing, number>>; tier?: ServerTierLiteral; vat: string }> = {
    "lawyer-pro":             { prices: { monthly: 39900, yearly: 399000 },   tier: "pro",        vat: "exclusive" },
    "consultant-independent": { prices: { monthly: 39900, yearly: 399000 },   tier: "pro",        vat: "exclusive" },
    "firm-basic":             { prices: { monthly: 99000, yearly: 990000 },   tier: "corp",       vat: "exclusive" },
    "firm-enterprise":        { prices: { monthly: 149000, yearly: 1490000 }, tier: "enterprise", vat: "exclusive" },
    "ind-ai":                 { prices: { monthly: 3900, yearly: 39000 },     tier: "ai",         vat: "inclusive" },
    "ind-preventive":         { prices: { monthly: 14900, yearly: 149000 },   tier: "pro",        vat: "inclusive" },
    "ind-litigation":         { prices: { monthly: 39900, yearly: 399000 },   tier: "max",        vat: "inclusive" },
    "lib-q1":                 { prices: { once: 150000 }, vat: "buyer" },
    "lib-q2":                 { prices: { once: 275000 }, vat: "buyer" },
    "lib-annual":             { prices: { once: 500000 }, vat: "buyer" },
    "topup-100":              { prices: { once: 10000 },  vat: "exclusive" },
    "topup-250":              { prices: { once: 25000 },  vat: "exclusive" },
    "topup-500":              { prices: { once: 50000 },  vat: "exclusive" },
    "topup-1000":             { prices: { once: 100000 }, vat: "exclusive" },
  };
  for (const [id, want] of Object.entries(expected)) {
    const item = PAYABLE_ITEMS[id];
    assert.deepEqual(item.prices, want.prices, id);
    assert.equal(item.tier, want.tier, id);
    assert.equal(item.vat, want.vat, id);
    assert.ok(item.labelAr.trim().length > 0, `${id} has an Arabic label`);
  }
});

test("library items grant days of access and point to their library plan", () => {
  const days: Record<string, number> = { "lib-q1": 90, "lib-q2": 180, "lib-annual": 365 };
  for (const [id, n] of Object.entries(days)) {
    const item = PAYABLE_ITEMS[id];
    assert.equal(item.kind, "library");
    assert.equal(item.libraryDays, n, id);
    assert.equal(item.libraryPlanRef, id, id);
  }
});

test("every top-up carries its points and their validity", () => {
  const want: Record<string, [number, number]> = {
    "topup-100": [100, 3],
    "topup-250": [300, 3],
    "topup-500": [700, 6],
    "topup-1000": [1500, 12],
  };
  for (const [id, [points, months]] of Object.entries(want)) {
    const item = PAYABLE_ITEMS[id];
    assert.equal(item.kind, "topup", id);
    assert.equal(item.points, points, id);
    assert.equal(item.pointsValidityMonths, months, id);
  }
});

test("only plans save the card (auto-renew)", () => {
  for (const item of Object.values(PAYABLE_ITEMS)) {
    assert.equal(item.saveCard, item.kind === "plan", item.id);
  }
});

test("each item's buyers: plans to their own audience, library and top-ups to anyone", () => {
  const want: Record<string, readonly string[] | "any"> = {
    "lawyer-pro": ["lawyer"],
    "consultant-independent": ["lawyer", "provider"],
    "firm-basic": ["firm"],
    "firm-enterprise": ["firm"],
    "ind-ai": ["individual"],
    "ind-preventive": ["individual"],
    "ind-litigation": ["individual"],
    "lib-q1": "any",
    "lib-q2": "any",
    "lib-annual": "any",
    "topup-100": "any",
    "topup-250": "any",
    "topup-500": "any",
    "topup-1000": "any",
  };
  assert.deepEqual(Object.keys(want).sort(), [...EXPECTED_IDS].sort());
  for (const [id, buyers] of Object.entries(want)) assert.deepEqual(PAYABLE_ITEMS[id].buyers, buyers, id);
  for (const item of Object.values(PAYABLE_ITEMS)) {
    if (item.kind === "plan") assert.notEqual(item.buyers, "any", `${item.id}: a plan is never sold to anyone`);
  }
});

test("buyerAllowed: the audience check checkout runs before quoting", () => {
  const P = PAYABLE_ITEMS;
  // the swap the review found: a lawyer buying the individuals' pro / max tiers
  assert.equal(buyerAllowed(P["ind-preventive"], "lawyer"), false);
  assert.equal(buyerAllowed(P["ind-litigation"], "lawyer"), false);
  assert.equal(buyerAllowed(P["ind-ai"], "firm"), false);
  // and the reverse
  assert.equal(buyerAllowed(P["lawyer-pro"], "individual"), false);
  assert.equal(buyerAllowed(P["firm-basic"], "lawyer"), false);
  assert.equal(buyerAllowed(P["consultant-independent"], "individual"), false);
  // the audiences themselves
  assert.equal(buyerAllowed(P["lawyer-pro"], "lawyer"), true);
  assert.equal(buyerAllowed(P["consultant-independent"], "lawyer"), true);
  assert.equal(buyerAllowed(P["consultant-independent"], "provider"), true);
  assert.equal(buyerAllowed(P["firm-enterprise"], "firm"), true);
  assert.equal(buyerAllowed(P["ind-litigation"], "individual"), true);
  // a missing or unknown type buys only "any" items
  for (const t of [null, undefined, "", "admin", "Lawyer"]) {
    assert.equal(buyerAllowed(P["lawyer-pro"], t), false, String(t));
    assert.equal(buyerAllowed(P["ind-ai"], t), false, String(t));
    assert.equal(buyerAllowed(P["lib-q1"], t), true, String(t));
    assert.equal(buyerAllowed(P["topup-100"], t), true, String(t));
  }
  for (const t of ["individual", "lawyer", "firm", "corporate", "micro", "provider"]) {
    assert.equal(buyerAllowed(P["lib-annual"], t), true, t);
    assert.equal(buyerAllowed(P["topup-1000"], t), true, t);
  }
});

test("BUSINESS_USER_TYPES is the owner's list plus micro establishments", () => {
  assert.deepEqual(
    [...BUSINESS_USER_TYPES],
    ["lawyer", "provider", "firm", "corporate", "business", "government", "ngo", "micro"],
  );
});

test("the catalog is frozen: no code can patch a price at runtime", () => {
  assert.ok(Object.isFrozen(PAYABLE_ITEMS));
  for (const item of Object.values(PAYABLE_ITEMS)) {
    assert.ok(Object.isFrozen(item), item.id);
    assert.ok(Object.isFrozen(item.prices), `${item.id}.prices`);
    if (Array.isArray(item.buyers)) assert.ok(Object.isFrozen(item.buyers), `${item.id}.buyers`);
  }
  // Test files are ES modules, so this runs in strict mode and must throw.
  assert.throws(() => {
    (PAYABLE_ITEMS["lawyer-pro"].prices as { monthly?: number }).monthly = 1;
  }, TypeError);
  assert.throws(() => {
    (PAYABLE_ITEMS as Record<string, unknown>)["free-stuff"] = {};
  }, TypeError);
  assert.equal(PAYABLE_ITEMS["lawyer-pro"].prices.monthly, 39900);
  assert.equal(Object.hasOwn(PAYABLE_ITEMS, "free-stuff"), false);
});

// ─── consistency with the prices the site shows ──────────────────────────────

function code(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

/** The [priceMonthly, priceYearly] display strings of every `id: "<id>"` entry. */
function displayedPrices(path: string, id: string): Array<[string, string]> {
  const text = code(path);
  const marker = `id: "${id}"`;
  const out: Array<[string, string]> = [];
  let at = text.indexOf(marker);
  while (at !== -1) {
    const next = text.indexOf(`id: "`, at + marker.length);
    const block = text.slice(at, next === -1 ? undefined : next);
    const m = block.match(/priceMonthly:\s*"([^"]*)"/);
    const y = block.match(/priceYearly:\s*"([^"]*)"/);
    assert.ok(m && y, `${path} ${id}: price fields not found`);
    out.push([m[1], y[1]]);
    at = text.indexOf(marker, at + marker.length);
  }
  return out;
}

const CONSTANTS_FILE: Record<string, string> = {
  "lawyer-pro": "constants/pricing/pricing.lawyers.ts",
  "topup-100": "constants/pricing/pricing.lawyers.ts",
  "topup-250": "constants/pricing/pricing.lawyers.ts",
  "topup-500": "constants/pricing/pricing.lawyers.ts",
  "topup-1000": "constants/pricing/pricing.lawyers.ts",
  "firm-basic": "constants/pricing/pricing.firms.ts",
  "firm-enterprise": "constants/pricing/pricing.firms.ts",
  "ind-ai": "constants/pricing/pricing.individuals.ts",
  "ind-preventive": "constants/pricing/pricing.individuals.ts",
  "ind-litigation": "constants/pricing/pricing.individuals.ts",
  "lib-q1": "constants/pricing/pricing.library.ts",
  "lib-q2": "constants/pricing/pricing.library.ts",
  "lib-annual": "constants/pricing/pricing.library.ts",
  "consultant-independent": "constants/pricing/pricing.providers.ts",
};

const NUMERIC_PLAN: Record<string, PricingPlan> = {
  ...STANDALONE_LIBRARY_PLANS,
  ...INDIVIDUALS_PYRAMID_PLANS,
  [INDEPENDENT_CONSULTANT_PLAN.id]: INDEPENDENT_CONSULTANT_PLAN,
};

test("every catalog price equals the Arabic and English display price in src/constants/pricing", () => {
  for (const item of Object.values(PAYABLE_ITEMS)) {
    const path = CONSTANTS_FILE[item.id];
    assert.ok(path, `${item.id} has no constants file mapped`);
    const entries = displayedPrices(path, item.id);
    assert.equal(entries.length, 2, `${path}: ${item.id} should appear once in Arabic and once in English`);
    for (const [monthlyText, yearlyText] of entries) {
      const monthly = parseDisplayedAmount(monthlyText);
      const yearly = parseDisplayedAmount(yearlyText);
      assert.notEqual(monthly, null, `${path} ${item.id}: priceMonthly «${monthlyText}» is unparseable`);
      assert.notEqual(yearly, null, `${path} ${item.id}: priceYearly «${yearlyText}» is unparseable`);
      if (monthly === null || yearly === null) continue;
      if (item.prices.once !== undefined) {
        assert.equal(monthly * 100, item.prices.once, `${item.id} once vs priceMonthly «${monthlyText}»`);
        assert.equal(yearly * 100, item.prices.once, `${item.id} once vs priceYearly «${yearlyText}»`);
      }
      if (item.prices.monthly !== undefined) {
        assert.equal(monthly * 100, item.prices.monthly, `${item.id} monthly vs «${monthlyText}»`);
      }
      if (item.prices.yearly !== undefined) {
        assert.equal(yearly * 100, item.prices.yearly, `${item.id} yearly vs «${yearlyText}»`);
      }
    }
  }
});

test("every catalog price equals the numeric price in src/lib/pricing/plans.ts where the plan exists there", () => {
  let checked = 0;
  for (const item of Object.values(PAYABLE_ITEMS)) {
    const plan = NUMERIC_PLAN[item.id];
    if (!plan) continue;
    checked++;
    if (item.prices.once !== undefined) {
      assert.equal(plan.priceMonthly * 100, item.prices.once, item.id);
      assert.equal(plan.priceYearly * 100, item.prices.once, item.id);
    }
    if (item.prices.monthly !== undefined) assert.equal(plan.priceMonthly * 100, item.prices.monthly, item.id);
    if (item.prices.yearly !== undefined) assert.equal(plan.priceYearly * 100, item.prices.yearly, item.id);
  }
  assert.equal(checked, 7, "lib-q1/q2/annual, ind-ai/preventive/litigation and consultant-independent");
});

// ─── formatHalalas ───────────────────────────────────────────────────────────

test("formatHalalas: Arabic digits, «٬» thousands, «٫» decimals only when non-zero", () => {
  assert.equal(formatHalalas(45885), "٤٥٨٫٨٥ ر.س");
  assert.equal(formatHalalas(39900), "٣٩٩ ر.س");
  assert.equal(formatHalalas(399000), "٣٬٩٩٠ ر.س");
  assert.equal(formatHalalas(509), "٥٫٠٩ ر.س");
  assert.equal(formatHalalas(1490000), "١٤٬٩٠٠ ر.س");
  assert.equal(formatHalalas(172500), "١٬٧٢٥ ر.س");
  assert.equal(formatHalalas(0), "٠ ر.س");
  assert.equal(formatHalalas(123456789), "١٬٢٣٤٬٥٦٧٫٨٩ ر.س");
});

test("formatHalalas refuses anything that is not a non-negative integer of halalas", () => {
  for (const bad of [-1, -39900, 0.5, 399.99, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
    assert.throws(() => formatHalalas(bad), RangeError, String(bad));
  }
});
