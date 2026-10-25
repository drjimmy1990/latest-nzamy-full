/**
 * catalog.test.ts — the halala catalogue checkout charges, derived from the
 * price book (src/lib/pricing/priceBook.ts), and its VAT quote: always
 * VAT-exclusive (pricing doc §2 rule 5, answer ٢٥٨).
 *
 * The consistency test holds PAYABLE_ITEMS to src/lib/pricing/plans.ts (which
 * itself reads the book); the /pricing cards' derivation is in cardPrice.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { ServerTier } from "../access-control.ts";
import {
  buildCatalog,
  buyerAllowed,
  PAYABLE_ITEMS,
  formatHalalas,
  quote,
  resolveItem,
  sellableItem,
  type Billing,
  type ServerTierLiteral,
} from "./catalog.ts";
import { PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";
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

test("lawyer-pro monthly: VAT added on top (exclusive)", () => {
  const q = quote("lawyer-pro", "monthly");
  assert.ok(q.ok);
  assert.equal(q.vatMode, "exclusive");
  assert.equal(q.netHalalas, 39900);
  assert.equal(q.vatHalalas, 5985);
  assert.equal(q.totalHalalas, 45885);
  assert.equal(q.item.id, "lawyer-pro");
});

test("٢٥٨: the individuals' plans are VAT-exclusive now — 39 is the net, 44.85 is charged", () => {
  const q = quote("ind-ai", "monthly");
  assert.ok(q.ok);
  assert.equal(q.vatMode, "exclusive");
  assert.equal(q.netHalalas, 3900);
  assert.equal(q.vatHalalas, 585);
  assert.equal(q.totalHalalas, 4485);
});

test("٢٥٨: the library is VAT-exclusive for every buyer (no more buyer-dependent mode)", () => {
  const q = quote("lib-q1", "once");
  assert.ok(q.ok);
  assert.equal(q.vatMode, "exclusive");
  assert.equal(q.netHalalas, 150000);
  assert.equal(q.vatHalalas, 22500);
  assert.equal(q.totalHalalas, 172500);
});

test("٢٥٨: nothing sold today is quoted inclusive; the listed price is always the net", () => {
  for (const item of Object.values(PAYABLE_ITEMS)) {
    for (const billing of Object.keys(item.prices) as Billing[]) {
      const q = quote(item.id, billing);
      assert.ok(q.ok, `${item.id} ${billing}`);
      assert.equal(q.vatMode, "exclusive", `${item.id} ${billing}`);
      assert.equal(q.netHalalas, item.prices[billing], `${item.id} ${billing}`);
    }
  }
});

test("unknown ids, inherited object keys and unoffered billing are refused", () => {
  assert.deepEqual(quote("nope", "monthly"), { ok: false, error: "unknown_item" });
  assert.deepEqual(quote("constructor", "monthly"), { ok: false, error: "unknown_item" });
  assert.deepEqual(quote("__proto__", "monthly"), { ok: false, error: "unknown_item" });
  assert.deepEqual(quote("lib-q1", "monthly"), { ok: false, error: "billing_not_offered" });
  assert.deepEqual(quote("topup-100", "yearly"), { ok: false, error: "billing_not_offered" });
  assert.deepEqual(quote("lawyer-pro", "once"), { ok: false, error: "billing_not_offered" });
  // no item offers the new cycles yet (P2+ adds them once 20261026_10 has run)
  assert.deepEqual(quote("lawyer-pro", "quarterly"), { ok: false, error: "billing_not_offered" });
  assert.deepEqual(quote("ind-ai", "semiannual"), { ok: false, error: "billing_not_offered" });
});

test("every offered price quotes to net + vat = total, in whole halalas", () => {
  for (const item of Object.values(PAYABLE_ITEMS)) {
    for (const billing of Object.keys(item.prices) as Billing[]) {
      const q = quote(item.id, billing);
      assert.ok(q.ok, `${item.id} ${billing}`);
      assert.ok(Number.isInteger(q.netHalalas) && Number.isInteger(q.vatHalalas));
      assert.equal(q.netHalalas + q.vatHalalas, q.totalHalalas, `${item.id} ${billing}`);
    }
  }
});

// ─── catalog shape ───────────────────────────────────────────────────────────

test("PAYABLE_ITEMS holds exactly the sold ids, each keyed by its own id", () => {
  assert.deepEqual(Object.keys(PAYABLE_ITEMS).sort(), [...EXPECTED_IDS].sort());
  for (const [key, item] of Object.entries(PAYABLE_ITEMS)) assert.equal(item.id, key);
});

test("prices and grants as the owner set them (net halalas)", () => {
  const expected: Record<string, { prices: Partial<Record<Billing, number>>; tier?: ServerTierLiteral }> = {
    "lawyer-pro":             { prices: { monthly: 39900, yearly: 399000 },   tier: "pro" },
    "consultant-independent": { prices: { monthly: 39900, yearly: 399000 },   tier: "pro" },
    "firm-basic":             { prices: { monthly: 99000, yearly: 990000 },   tier: "corp" },
    "firm-enterprise":        { prices: { monthly: 149000, yearly: 1490000 }, tier: "enterprise" },
    "ind-ai":                 { prices: { monthly: 3900, yearly: 39000 },     tier: "ai" },
    "ind-preventive":         { prices: { monthly: 14900, yearly: 149000 },   tier: "pro" },
    "ind-litigation":         { prices: { monthly: 39900, yearly: 399000 },   tier: "max" },
    "lib-q1":                 { prices: { once: 150000 } },
    "lib-q2":                 { prices: { once: 275000 } },
    "lib-annual":             { prices: { once: 500000 } },
    "topup-100":              { prices: { once: 10000 } },
    "topup-250":              { prices: { once: 25000 } },
    "topup-500":              { prices: { once: 50000 } },
    "topup-1000":             { prices: { once: 100000 } },
  };
  for (const [id, want] of Object.entries(expected)) {
    const item = PAYABLE_ITEMS[id];
    assert.deepEqual(item.prices, want.prices, id);
    assert.deepEqual(item.listedPrices, want.prices, `${id}: nothing retired yet`);
    assert.equal(item.tier, want.tier, id);
    assert.equal(item.onSale, true, id);
    assert.ok(item.labelAr.trim().length > 0, `${id} has an Arabic label`);
  }
});

test("derivation: every catalog item IS its price-book entry, in halalas — no second copy of a number", () => {
  assert.deepEqual(Object.keys(PAYABLE_ITEMS).sort(), Object.keys(PRICE_BOOK).sort());
  for (const [id, entry] of Object.entries(PRICE_BOOK)) {
    const item = PAYABLE_ITEMS[id];
    assert.equal(item.labelAr, entry.labelAr, id);
    assert.equal(item.kind, entry.kind, id);
    assert.equal(item.tier, entry.tier, id);
    assert.deepEqual(item.buyers, entry.buyers, id);
    assert.equal(item.points, entry.points, id);
    assert.equal(item.pointsValidityMonths, entry.pointsValidityMonths, id);
    assert.equal(item.libraryDays, entry.libraryDays, id);
    assert.equal(item.libraryPlanRef, entry.libraryPlanRef, id);
    for (const [billing, p] of Object.entries(entry.prices)) {
      assert.equal(item.listedPrices[billing as Billing], p!.sar * 100, `${id} ${billing}`);
    }
  }
  // catalog.ts itself carries no price literal any more
  const src = readFileSync(new URL("./catalog.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\b(399|3990|990|9900|1490|14900|1500|2750|5000)\b/, "a price literal in catalog.ts");
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

test("the catalog is frozen: no code can patch a price at runtime", () => {
  assert.ok(Object.isFrozen(PAYABLE_ITEMS));
  for (const item of Object.values(PAYABLE_ITEMS)) {
    assert.ok(Object.isFrozen(item), item.id);
    assert.ok(Object.isFrozen(item.prices), `${item.id}.prices`);
    assert.ok(Object.isFrozen(item.listedPrices), `${item.id}.listedPrices`);
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

// ─── retire, never delete ────────────────────────────────────────────────────

const RETIRED_BOOK: Readonly<Record<string, BookEntry>> = {
  ...PRICE_BOOK,
  "old-pro": { id: "old-pro", kind: "plan", labelAr: "باقة متقاعدة", buyers: ["lawyer"], tier: "pro", retired: true, prices: { monthly: { sar: 399 }, yearly: { sar: 3990 } } },
  "firm-cyc": { id: "firm-cyc", kind: "plan", labelAr: "مكتب بلا شهري", buyers: ["firm"], tier: "corp", prices: { monthly: { sar: 990, retired: true }, yearly: { sar: 9900 } } },
};
const RETIRED_CATALOG = buildCatalog(RETIRED_BOOK);

test("a retired item still resolves (fulfilment, receipts, admin) but is never sold", () => {
  const old = resolveItem("old-pro", RETIRED_CATALOG)!;
  assert.equal(old.labelAr, "باقة متقاعدة");
  assert.equal(old.onSale, false);
  assert.deepEqual(old.prices, {}, "no billing is sold");
  assert.deepEqual(old.listedPrices, { monthly: 39900, yearly: 399000 }, "the last prices stay listed");
  assert.equal(sellableItem("old-pro", RETIRED_CATALOG), undefined);
  assert.deepEqual(quote("old-pro", "yearly", RETIRED_CATALOG), { ok: false, error: "not_for_sale" });
  assert.equal(old.saveCard, true, "still a plan");
});

test("a retired cycle is refused; the item's other cycles still sell", () => {
  const firm = sellableItem("firm-cyc", RETIRED_CATALOG)!;
  assert.deepEqual(firm.prices, { yearly: 990000 });
  assert.deepEqual(firm.listedPrices, { monthly: 99000, yearly: 990000 });
  assert.deepEqual(quote("firm-cyc", "monthly", RETIRED_CATALOG), { ok: false, error: "billing_not_offered" });
  assert.ok(quote("firm-cyc", "yearly", RETIRED_CATALOG).ok);
});

test("resolveItem / sellableItem never resolve an inherited key", () => {
  for (const id of ["constructor", "__proto__", "toString", ""]) {
    assert.equal(resolveItem(id), undefined, id);
    assert.equal(sellableItem(id), undefined, id);
  }
});

// ─── consistency with the prices the site shows ──────────────────────────────

// The /pricing cards read their prices from the price book by id; that
// derivation is held in src/lib/pricing/cardPrice.test.ts (no card of a book
// id carries a price string in src/constants/pricing).

const NUMERIC_PLAN: Record<string, PricingPlan> = {
  ...STANDALONE_LIBRARY_PLANS,
  ...INDIVIDUALS_PYRAMID_PLANS,
  [INDEPENDENT_CONSULTANT_PLAN.id]: INDEPENDENT_CONSULTANT_PLAN,
};

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
