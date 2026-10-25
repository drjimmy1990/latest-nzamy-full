/**
 * priceBook.test.ts — the one server price book (pricing doc §2 rules 1/4/5,
 * answer ٢٥٨) and its retire-never-delete lookups.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  BILLING_LABEL_AR,
  BILLINGS,
  CYCLE_MONTHS,
  CYCLES,
  INDIVIDUAL_CYCLES,
  PRICE_BOOK,
  PROFESSIONAL_CYCLES,
  bookEntry,
  bookPriceText,
  bookSar,
  formatSarAmount,
  isBilling,
  isOnSale,
  offeredBillings,
  offeredSar,
  renewalPrice,
  type BookEntry,
} from "./priceBook.ts";

test("the cycles are 1 / 3 / 6 / 12 months, with Arabic labels", () => {
  assert.deepEqual([...CYCLES], ["monthly", "quarterly", "semiannual", "yearly"]);
  assert.deepEqual([...BILLINGS], ["monthly", "quarterly", "semiannual", "yearly", "once"]);
  assert.deepEqual({ ...CYCLE_MONTHS }, { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 });
  assert.equal(BILLING_LABEL_AR.quarterly, "ربع سنوي");
  assert.equal(BILLING_LABEL_AR.semiannual, "نصف سنوي");
  assert.equal(BILLING_LABEL_AR.monthly, "شهري");
  assert.equal(BILLING_LABEL_AR.yearly, "سنوي");
  assert.equal(BILLING_LABEL_AR.once, "دفعة واحدة");
  for (const b of BILLINGS) assert.ok(isBilling(b), b);
  for (const bad of ["", "Monthly", "custom", "biannual", "half", null, 3, "constructor"]) assert.equal(isBilling(bad), false, String(bad));
});

test("§2 rule 1: professionals are offered quarterly / half / yearly; individuals also monthly", () => {
  assert.deepEqual([...PROFESSIONAL_CYCLES], ["quarterly", "semiannual", "yearly"]);
  assert.deepEqual([...INDIVIDUAL_CYCLES], ["monthly", "quarterly", "semiannual", "yearly"]);
});

test("P1 changes no price: the book holds today's prices, in whole SAR", () => {
  const want: Record<string, Partial<Record<string, number>>> = {
    "lawyer-pro": { monthly: 399, yearly: 3990 },
    "consultant-independent": { monthly: 399, yearly: 3990 },
    "firm-basic": { monthly: 990, yearly: 9900 },
    "firm-enterprise": { monthly: 1490, yearly: 14900 },
    "ind-ai": { monthly: 39, yearly: 390 },
    "ind-preventive": { monthly: 149, yearly: 1490 },
    "ind-litigation": { monthly: 399, yearly: 3990 },
    "lib-q1": { once: 1500 },
    "lib-q2": { once: 2750 },
    "lib-annual": { once: 5000 },
    "topup-100": { once: 100 },
    "topup-250": { once: 250 },
    "topup-500": { once: 500 },
    "topup-1000": { once: 1000 },
  };
  assert.deepEqual(Object.keys(PRICE_BOOK).sort(), Object.keys(want).sort());
  for (const [id, prices] of Object.entries(want)) {
    const entry = PRICE_BOOK[id];
    assert.equal(entry.id, id);
    const got = Object.fromEntries(Object.entries(entry.prices).map(([b, p]) => [b, p!.sar]));
    assert.deepEqual(got, prices, id);
    for (const p of Object.values(entry.prices)) assert.ok(Number.isSafeInteger(p!.sar) && p!.sar > 0, id);
  }
});

const PROFESSIONAL_MONTHLY_RETIRED = ["lawyer-pro", "consultant-independent", "firm-basic", "firm-enterprise"];

test("no entry is retired, coming soon or launch-priced yet; only the professionals' monthly cycle is retired", () => {
  for (const entry of Object.values(PRICE_BOOK)) {
    assert.equal(entry.retired, undefined, entry.id);
    assert.equal(entry.comingSoon, undefined, entry.id);
    assert.equal(entry.launchPrices, undefined, entry.id);
    assert.ok(isOnSale(entry), entry.id);
    for (const [billing, p] of Object.entries(entry.prices)) {
      const retired = billing === "monthly" && PROFESSIONAL_MONTHLY_RETIRED.includes(entry.id);
      assert.equal(p!.retired, retired ? true : undefined, `${entry.id} ${billing}`);
    }
  }
});

test("the professionals' monthly cycle (owner, 26 Oct: 399/month cancelled) is not sold, but renews as 'retired' with its old price", () => {
  for (const [id, sar] of [["lawyer-pro", 399], ["consultant-independent", 399], ["firm-basic", 990], ["firm-enterprise", 1490]] as const) {
    const entry = PRICE_BOOK[id];
    assert.deepEqual(offeredBillings(entry), ["yearly"], id);
    assert.equal(offeredSar(entry, "monthly"), null, id);
    assert.deepEqual(renewalPrice(id, "monthly"), { status: "retired", sar }, `${id}: B2 must notify, never renew it silently`);
    assert.throws(() => bookSar(id, "monthly"), id);
  }
  for (const id of ["ind-ai", "ind-preventive", "ind-litigation"]) {
    assert.deepEqual(offeredBillings(PRICE_BOOK[id]), ["monthly", "yearly"], `${id}: individuals keep monthly`);
  }
});

test("no item has a quarterly or half-yearly price yet — the deploy-order guarantee of 20261026_10", () => {
  for (const entry of Object.values(PRICE_BOOK)) {
    assert.equal(Object.hasOwn(entry.prices, "quarterly"), false, entry.id);
    assert.equal(Object.hasOwn(entry.prices, "semiannual"), false, entry.id);
  }
});

test("the book is frozen", () => {
  assert.ok(Object.isFrozen(PRICE_BOOK));
  for (const entry of Object.values(PRICE_BOOK)) {
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.prices), entry.id);
    for (const p of Object.values(entry.prices)) assert.ok(Object.isFrozen(p), entry.id);
  }
  assert.throws(() => {
    (PRICE_BOOK["lawyer-pro"].prices.yearly as { sar: number }).sar = 1;
  }, TypeError);
});

test("bookEntry never resolves an inherited key", () => {
  for (const id of ["constructor", "__proto__", "toString", "", "nope"]) assert.equal(bookEntry(id), undefined, id);
  assert.equal(bookEntry("lib-q1")?.id, "lib-q1");
});

// ── retire, never delete ────────────────────────────────────────────────────

const FIXTURE: Readonly<Record<string, BookEntry>> = Object.freeze({
  "old-plan": { id: "old-plan", kind: "plan", labelAr: "باقة قديمة", buyers: ["lawyer"], tier: "pro", retired: true, prices: { monthly: { sar: 399 }, yearly: { sar: 3990 } } },
  "firm-x": { id: "firm-x", kind: "plan", labelAr: "مكتب", buyers: ["firm"], tier: "corp", prices: { monthly: { sar: 990, retired: true }, quarterly: { sar: 2990 }, yearly: { sar: 9900 } } },
  "soon": { id: "soon", kind: "topup", labelAr: "قريباً", buyers: "any", comingSoon: true, points: 5, pointsValidityMonths: 12, prices: { once: { sar: 5 } } },
});

test("a retired entry is not on sale and offers no billing, but is still found by id", () => {
  const old = bookEntry("old-plan", FIXTURE)!;
  assert.equal(old.labelAr, "باقة قديمة");
  assert.equal(isOnSale(old), false);
  assert.deepEqual(offeredBillings(old), []);
  assert.equal(offeredSar(old, "monthly"), null);
});

test("a retired cycle is refused while the entry's other cycles stay on sale", () => {
  const firm = bookEntry("firm-x", FIXTURE)!;
  assert.ok(isOnSale(firm));
  assert.deepEqual(offeredBillings(firm), ["quarterly", "yearly"]);
  assert.equal(offeredSar(firm, "monthly"), null);
  assert.equal(offeredSar(firm, "quarterly"), 2990);
});

test("coming soon: the price is stored, never offered", () => {
  const soon = bookEntry("soon", FIXTURE)!;
  assert.equal(soon.prices.once?.sar, 5);
  assert.equal(isOnSale(soon), false);
  assert.deepEqual(offeredBillings(soon), []);
});

test("renewalPrice: sold, retired (with the last price), or null", () => {
  assert.deepEqual(renewalPrice("lawyer-pro", "yearly"), { status: "sold", sar: 3990 });
  assert.deepEqual(renewalPrice("old-plan", "monthly", FIXTURE), { status: "retired", sar: 399 });
  assert.deepEqual(renewalPrice("firm-x", "monthly", FIXTURE), { status: "retired", sar: 990 });
  assert.deepEqual(renewalPrice("firm-x", "quarterly", FIXTURE), { status: "sold", sar: 2990 });
  assert.equal(renewalPrice("firm-x", "semiannual", FIXTURE), null);
  assert.equal(renewalPrice("nope", "yearly"), null);
  assert.equal(renewalPrice("lawyer-pro", "custom"), null);
});

// ── display ─────────────────────────────────────────────────────────────────

test("formatSarAmount: Arabic digits with «٬», English with commas", () => {
  assert.equal(formatSarAmount(3990, "ar"), "٣٬٩٩٠");
  assert.equal(formatSarAmount(3990, "en"), "3,990");
  assert.equal(formatSarAmount(39, "ar"), "٣٩");
  assert.equal(formatSarAmount(14900, "ar"), "١٤٬٩٠٠");
  assert.equal(formatSarAmount(1000, "en"), "1,000");
  for (const bad of [-1, 0.5, Number.NaN]) assert.throws(() => formatSarAmount(bad, "ar"), RangeError);
});

test("bookPriceText / bookSar read a sold price and throw for anything else", () => {
  assert.equal(bookPriceText("lawyer-pro", "yearly", "ar"), "٣٬٩٩٠");
  assert.equal(bookPriceText("lib-q2", "once", "en"), "2,750");
  assert.equal(bookSar("ind-ai", "monthly"), 39);
  assert.throws(() => bookPriceText("lawyer-pro", "quarterly", "ar"));
  assert.throws(() => bookPriceText("lawyer-pro", "monthly", "ar"), "a retired cycle is not sold");
  assert.throws(() => bookPriceText("lib-q1", "monthly", "ar"));
  assert.throws(() => bookSar("nope", "yearly"));
});
