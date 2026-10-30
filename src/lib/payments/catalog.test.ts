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
  "topup-2500",
  "topup-5000",
  "topup-10000",
];

// ─── quote ───────────────────────────────────────────────────────────────────

test("lawyer-pro yearly: VAT added on top (exclusive)", () => {
  const q = quote("lawyer-pro", "yearly");
  assert.ok(q.ok);
  assert.equal(q.vatMode, "exclusive");
  assert.equal(q.netHalalas, 399000);
  assert.equal(q.vatHalalas, 59850);
  assert.equal(q.totalHalalas, 458850);
  assert.equal(q.item.id, "lawyer-pro");
});

test("the professionals' monthly cycle is retired (owner, 26 Oct): not sold, still listed for old orders", () => {
  for (const [id, monthly] of [
    ["lawyer-pro", 39900],
    ["consultant-independent", 39900],
    ["firm-basic", 99000],
    ["firm-enterprise", 149000],
  ] as const) {
    assert.deepEqual(quote(id, "monthly"), { ok: false, error: "not_for_sale" }, `${id}: checkout answers 410`);
    assert.equal(resolveItem(id)!.listedPrices.monthly, monthly, `${id}: receipts, refunds and admin still read it`);
    assert.equal(resolveItem(id)!.onSale, true, `${id}: the yearly cycle still sells`);
    assert.ok(quote(id, "yearly").ok, id);
  }
  // individuals keep monthly (§2 rule 1)
  for (const id of ["ind-ai", "ind-preventive", "ind-litigation"]) assert.ok(quote(id, "monthly").ok, id);
});

test("٢٥٨ / ٣٠١: the individuals' plans are VAT-exclusive — 29 is the net, 33.35 is charged", () => {
  const q = quote("ind-ai", "monthly");
  assert.ok(q.ok);
  assert.equal(q.vatMode, "exclusive");
  assert.equal(q.netHalalas, 2900);
  assert.equal(q.vatHalalas, 435);
  assert.equal(q.totalHalalas, 3335);
});

test("٢٥٨: the library is VAT-exclusive for every buyer (no more buyer-dependent mode)", () => {
  const q = quote("lib-q1", "once");
  assert.ok(q.ok);
  assert.equal(q.vatMode, "exclusive");
  assert.equal(q.netHalalas, 105000);
  assert.equal(q.vatHalalas, 15750);
  assert.equal(q.totalHalalas, 120750);
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
  // the new cycles only where the revised doc prices them (ind-ai, the two firm plans)
  assert.deepEqual(quote("lawyer-pro", "quarterly"), { ok: false, error: "billing_not_offered" });
  assert.deepEqual(quote("ind-preventive", "semiannual"), { ok: false, error: "billing_not_offered" });
  assert.ok(quote("ind-ai", "semiannual").ok);
  assert.ok(quote("firm-basic", "quarterly").ok);
});

// ─── ٣٠٣: the launch price is charged by the request's clock ─────────────────

test("٣٠٣: inside the campaign checkout charges the launch price, VAT on top, and names the listed one", () => {
  const q = quote("ind-ai", "yearly", undefined, new Date("2026-12-01T09:00:00Z"));
  assert.ok(q.ok);
  assert.equal(q.netHalalas, 19900);
  assert.equal(q.vatHalalas, 2985);
  assert.equal(q.totalHalalas, 22885);
  assert.deepEqual(q.launch, { campaignId: "launch-2026", listNetHalalas: 24900, endsOn: "2027-01-25" });
  const firm = quote("firm-enterprise", "yearly", undefined, new Date("2026-12-01T09:00:00Z"));
  assert.ok(firm.ok);
  assert.equal(firm.netHalalas, 1266500);
  assert.equal(firm.launch?.listNetHalalas, 1490000);
});

test("٣٠٣: outside the campaign, without a clock, or in another cycle, the listed price and no launch", () => {
  for (const now of [new Date("2026-10-24T20:59:00Z"), new Date("2027-01-25T21:00:00Z"), undefined]) {
    const q = quote("ind-ai", "yearly", undefined, now);
    assert.ok(q.ok);
    assert.equal(q.netHalalas, 24900, String(now));
    assert.equal(q.launch, null, String(now));
  }
  const monthly = quote("ind-ai", "monthly", undefined, new Date("2026-12-01T09:00:00Z"));
  assert.ok(monthly.ok);
  assert.equal(monthly.netHalalas, 2900);
  assert.equal(monthly.launch, null);
});

test("٣٠٣: every place that quotes a price to charge or show passes the request's clock", () => {
  const sites: Array<[string, RegExp]> = [
    ["./checkoutCore.ts", /quote\(input\.itemId, input\.billing, catalog, now\)/],
    ["./couponServer.ts", /quote\(input\.itemId, input\.billing, catalog, now\)/],
    ["../../app/checkout/page.tsx", /quote\(item\.id, parsed\.billing, undefined, new Date\(\)\)/],
  ];
  for (const [path, call] of sites) {
    const src = readFileSync(new URL(path, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
    assert.match(src, call, path);
    assert.equal(src.match(/\bquote\(/g)?.length, 1, `${path}: one quote call`);
  }
  assert.match(readFileSync(new URL("../../app/checkout/page.tsx", import.meta.url), "utf8"), /dynamic = "force-dynamic"/, "the checkout page is never cached");
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
  // `retiredMonthly`: the monthly price stays listed (old orders), not sold.
  const expected: Record<string, { prices: Partial<Record<Billing, number>>; tier?: ServerTierLiteral; retiredMonthly?: number }> = {
    "lawyer-pro":             { prices: { yearly: 399000 },   tier: "pro", retiredMonthly: 39900 },
    "consultant-independent": { prices: { yearly: 399000 },   tier: "pro", retiredMonthly: 39900 },
    "firm-basic":             { prices: { quarterly: 299000, semiannual: 549000, yearly: 990000 },    tier: "corp", retiredMonthly: 99000 },
    "firm-enterprise":        { prices: { quarterly: 449000, semiannual: 819000, yearly: 1490000 },   tier: "enterprise", retiredMonthly: 149000 },
    "ind-ai":                 { prices: { monthly: 2900, quarterly: 7900, semiannual: 14900, yearly: 24900 }, tier: "ai" },
    "ind-preventive":         { prices: { monthly: 14900, yearly: 149000 },   tier: "pro" },
    "ind-litigation":         { prices: { monthly: 39900, yearly: 399000 },   tier: "max" },
    "lib-q1":                 { prices: { once: 105000 } },
    "lib-q2":                 { prices: { once: 192000 } },
    "lib-annual":             { prices: { once: 349000 } },
    "topup-100":              { prices: { once: 10000 } },
    "topup-250":              { prices: { once: 25000 } },
    "topup-500":              { prices: { once: 50000 } },
    "topup-1000":             { prices: { once: 100000 } },
    "topup-2500":             { prices: { once: 250000 } },
    "topup-5000":             { prices: { once: 500000 } },
    "topup-10000":            { prices: { once: 1000000 } },
  };
  for (const [id, want] of Object.entries(expected)) {
    const item = PAYABLE_ITEMS[id];
    assert.deepEqual(item.prices, want.prices, id);
    const listed = want.retiredMonthly ? { monthly: want.retiredMonthly, ...want.prices } : want.prices;
    assert.deepEqual(item.listedPrices, listed, `${id}: the listed prices (retired cycles included)`);
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
  // revised doc §4هـ / conflict ١١ (owner ٣٠٢): the standard balances; the
  // undated «فترة العروض» balances are not granted
  const want: Record<string, [number, number]> = {
    "topup-100": [100, 3],
    "topup-250": [250, 3],
    "topup-500": [500, 3],
    "topup-1000": [1250, 6],
    "topup-2500": [3500, 12],
    "topup-5000": [8500, 12],
    "topup-10000": [25000, 12],
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

test("each item's buyers: plans to their own audience, the library to professionals (LIVE-F05), top-ups by audience (٣٠٢)", () => {
  const PRO = ["lawyer", "firm", "corporate", "micro", "government", "ngo", "provider"];
  const LIB = ["lawyer", "firm", "corporate", "government"];
  const want: Record<string, readonly string[] | "any"> = {
    "lawyer-pro": ["lawyer"],
    "consultant-independent": ["lawyer", "provider"],
    "firm-basic": ["firm"],
    "firm-enterprise": ["firm"],
    "ind-ai": ["individual"],
    "ind-preventive": ["individual"],
    "ind-litigation": ["individual"],
    "lib-q1": LIB,
    "lib-q2": LIB,
    "lib-annual": LIB,
    "topup-100": ["individual"],
    "topup-250": ["individual"],
    "topup-500": PRO,
    "topup-1000": PRO,
    "topup-2500": PRO,
    "topup-5000": PRO,
    "topup-10000": PRO,
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
  // a missing or unknown type buys nothing: no item is sold to "any" (LIVE-F05)
  for (const t of [null, undefined, "", "admin", "Lawyer"]) {
    assert.equal(buyerAllowed(P["lawyer-pro"], t), false, String(t));
    assert.equal(buyerAllowed(P["ind-ai"], t), false, String(t));
    assert.equal(buyerAllowed(P["lib-q1"], t), false, String(t));
    assert.equal(buyerAllowed(P["topup-100"], t), false, String(t));
    assert.equal(buyerAllowed(P["topup-500"], t), false, String(t));
  }
  // LIVE-F05: the library to legal professionals; an individual is refused
  for (const t of ["lawyer", "firm", "corporate", "government"]) {
    assert.equal(buyerAllowed(P["lib-annual"], t), true, t);
  }
  for (const t of ["individual", "micro", "ngo", "provider"]) {
    assert.equal(buyerAllowed(P["lib-annual"], t), false, t);
  }
  // ٣٠٢: 100 / 250 for individuals only; 500 and up for professionals only
  for (const id of ["topup-100", "topup-250"]) {
    assert.equal(buyerAllowed(P[id], "individual"), true, id);
    for (const t of ["lawyer", "firm", "corporate", "provider"]) assert.equal(buyerAllowed(P[id], t), false, `${id} ${t}`);
  }
  for (const id of ["topup-500", "topup-1000", "topup-2500", "topup-5000", "topup-10000"]) {
    assert.equal(buyerAllowed(P[id], "individual"), false, id);
    for (const t of ["lawyer", "firm", "corporate", "micro", "government", "ngo", "provider"]) assert.equal(buyerAllowed(P[id], t), true, `${id} ${t}`);
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
    (PAYABLE_ITEMS["lawyer-pro"].prices as { yearly?: number }).yearly = 1;
  }, TypeError);
  assert.throws(() => {
    (PAYABLE_ITEMS as Record<string, unknown>)["free-stuff"] = {};
  }, TypeError);
  assert.equal(PAYABLE_ITEMS["lawyer-pro"].prices.yearly, 399000);
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
  assert.deepEqual(quote("firm-cyc", "monthly", RETIRED_CATALOG), { ok: false, error: "not_for_sale" }, "a retired cycle is 410, not 400");
  assert.deepEqual(quote("firm-cyc", "quarterly", RETIRED_CATALOG), { ok: false, error: "billing_not_offered" }, "a never-listed cycle stays 400");
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

// ─── subscription_plans (20261022_10 §6, repriced by 20261030_16) mirrors the book ───

test("20261030_16 sets every plan's subscription_plans prices to the book's listed price per cycle", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261030_16_pricing_owner_package.sql", import.meta.url), "utf8");
  const at = sql.search(/^update public\.subscription_plans p\s*$/m);
  assert.ok(at > -1);
  const block = sql.slice(at, sql.indexOf(";", at));
  const num = "(null|\\d+)(?:::numeric)?";
  const rows = [...block.matchAll(new RegExp(`\\('([a-z-]+)',\\s*${num},\\s*${num},\\s*${num},\\s*${num}\\)`, "g"))];
  const plans = Object.values(PAYABLE_ITEMS).filter((i) => i.kind === "plan");
  assert.equal(rows.length, plans.length, "one row per plan in the book");
  const col = (v: string) => (v === "null" ? undefined : Number(v) * 100);
  for (const [, id, m, q, h, y] of rows) {
    const item = PAYABLE_ITEMS[id];
    assert.ok(item && item.kind === "plan", `${id} is a book plan`);
    assert.equal(col(m), item.listedPrices.monthly, `${id} monthly`);
    assert.equal(col(q), item.listedPrices.quarterly, `${id} quarterly`);
    assert.equal(col(h), item.listedPrices.semiannual, `${id} semiannual`);
    assert.equal(col(y), item.listedPrices.yearly, `${id} yearly`);
  }
});
