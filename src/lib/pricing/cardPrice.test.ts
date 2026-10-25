/**
 * cardPrice.test.ts — /pricing cards read the price book; the cycle toggle
 * offers only cycles the audience may buy and a card on screen prices.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { audienceCycles, cardPrice, displayCycle, isBookCard, offeredCycles, type CardPriceFields } from "./cardPrice.ts";
import { PRICE_BOOK, formatSarAmount, offeredSar, type Cycle } from "./priceBook.ts";

const card = (id: string, extra: Partial<CardPriceFields> = {}): CardPriceFields => ({
  id,
  periodMonthly: "ر.س / شهر",
  periodYearly: "ر.س / سنة",
  ...extra,
});

test("a book card's price is the book's, in each cycle it is sold", () => {
  assert.deepEqual(cardPrice(card("lawyer-pro"), "yearly", "ar"), { price: "٣٬٩٩٠", period: "ر.س / سنة" });
  assert.equal(cardPrice(card("lawyer-pro"), "monthly", "ar"), null, "the professionals' monthly cycle is retired");
  assert.deepEqual(cardPrice(card("ind-ai"), "monthly", "ar"), { price: "٣٩", period: "ر.س / شهر" });
  assert.deepEqual(cardPrice(card("ind-ai", { periodYearly: "SAR / year" }), "yearly", "en"), { price: "390", period: "SAR / year" });
  assert.equal(cardPrice(card("lawyer-pro"), "quarterly", "ar"), null, "no quarterly price yet: the card is not shown in that cycle");
});

test("a one-payment card (top-up, library pass) shows its price in every cycle", () => {
  for (const cycle of ["monthly", "quarterly", "semiannual", "yearly"] as Cycle[]) {
    assert.deepEqual(cardPrice(card("topup-250", { periodMonthly: "ر.س / الشحنة" }), cycle, "ar"), { price: "٢٥٠", period: "ر.س / الشحنة" });
    assert.deepEqual(cardPrice(card("lib-q2", { periodMonthly: "SAR / 6 months" }), cycle, "en"), { price: "2,750", period: "SAR / 6 months" });
  }
});

test("a card outside the book keeps its own strings (yearly → priceYearly, otherwise priceMonthly)", () => {
  const biz = card("biz-sm-basic", { priceMonthly: "٩,٩٨٨", priceYearly: "٩,٩٨٨", periodMonthly: "ر.س / سنة" });
  assert.deepEqual(cardPrice(biz, "yearly", "ar"), { price: "٩,٩٨٨", period: "ر.س / سنة" });
  assert.deepEqual(cardPrice(biz, "quarterly", "ar"), { price: "٩,٩٨٨", period: "ر.س / سنة" });
  const piece = card("pay-per-piece", { priceMonthly: "حسب الخدمة", priceYearly: "بدون اشتراك" });
  assert.equal(cardPrice(piece, "monthly", "ar")?.price, "حسب الخدمة");
  assert.equal(cardPrice(piece, "yearly", "ar")?.price, "بدون اشتراك");
  assert.equal(cardPrice(card("no-price"), "yearly", "ar"), null);
});

test("every book card price equals the book, in both languages", () => {
  for (const [id, entry] of Object.entries(PRICE_BOOK)) {
    assert.ok(isBookCard({ id }), id);
    for (const cycle of ["monthly", "quarterly", "semiannual", "yearly"] as Cycle[]) {
      const sar = offeredSar(entry, "once") ?? offeredSar(entry, cycle);
      for (const lang of ["ar", "en"] as const) {
        const shown = cardPrice(card(id), cycle, lang);
        assert.equal(shown?.price ?? null, sar === null ? null : formatSarAmount(sar, lang), `${id} ${cycle} ${lang}`);
      }
    }
  }
});

test("§2 rule 1: the toggle offers professionals quarterly / half / yearly only, individuals monthly too", () => {
  assert.deepEqual([...audienceCycles("individuals")], ["monthly", "quarterly", "semiannual", "yearly"]);
  for (const a of ["lawyers", "firms", "companies", "micro", "ngo", "government", "providers"] as const) {
    assert.deepEqual([...audienceCycles(a)], ["quarterly", "semiannual", "yearly"], a);
  }
});

test("P1 (no new prices): lawyers and firms see yearly only — the monthly 399 / 990 are no longer advertised", () => {
  const lawyers = ["lawyer-pro", "topup-100", "topup-250", "topup-500", "topup-1000"].map((id) => ({ id }));
  assert.deepEqual(offeredCycles("lawyers", lawyers), ["yearly"]);
  assert.deepEqual(offeredCycles("firms", [{ id: "firm-basic" }, { id: "firm-enterprise" }]), ["yearly"]);
  // individuals keep monthly and yearly
  assert.deepEqual(offeredCycles("individuals", [{ id: "pay-per-piece" }, { id: "ind-ai" }, { id: "ind-preventive" }, { id: "ind-litigation" }]), ["monthly", "yearly"]);
  // only one-payment or non-book cards: no cycle toggle at all
  assert.deepEqual(offeredCycles("lawyers", [{ id: "lib-q1" }, { id: "lib-q2" }, { id: "lib-annual" }]), []);
  assert.deepEqual(offeredCycles("companies", [{ id: "biz-sm-basic" }]), []);
});

test("displayCycle keeps the pick while offered, else the first offered, else yearly", () => {
  assert.equal(displayCycle(["monthly", "yearly"], "yearly"), "yearly");
  assert.equal(displayCycle(["yearly"], "monthly"), "yearly", "an individual's monthly pick, then the lawyers tab");
  assert.equal(displayCycle(["quarterly", "semiannual", "yearly"], "monthly"), "quarterly");
  assert.equal(displayCycle([], "monthly"), "yearly");
});

// ── the constants carry no price for a book card ────────────────────────────

function code(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

const CONSTANTS = [
  "constants/pricing/pricing.lawyers.ts",
  "constants/pricing/pricing.firms.ts",
  "constants/pricing/pricing.individuals.ts",
  "constants/pricing/pricing.library.ts",
  "constants/pricing/pricing.providers.ts",
];

test("derivation: no card of a price-book id carries a price string in src/constants/pricing", () => {
  let cards = 0;
  for (const path of CONSTANTS) {
    const text = code(path);
    for (const id of Object.keys(PRICE_BOOK)) {
      const marker = `id: "${id}"`;
      let at = text.indexOf(marker);
      while (at !== -1) {
        cards++;
        const next = text.indexOf(`id: "`, at + marker.length);
        const block = text.slice(at, next === -1 ? undefined : next);
        assert.doesNotMatch(block, /price(Monthly|Yearly)\s*:/, `${path} ${id}: the price comes from the book`);
        at = text.indexOf(marker, at + marker.length);
      }
    }
  }
  assert.equal(cards, 28, "14 book items, once in Arabic and once in English");
});

test("derivation: the price tables read the book too (firms, individuals comparison rows)", () => {
  for (const path of ["constants/pricing/pricing.firms.ts", "constants/pricing/pricing.individuals.ts"]) {
    const text = code(path);
    assert.match(text, /bookPriceText\(/, path);
    for (const literal of ["٩٩٠ ر.س", "٩٬٩٠٠ ر.س", "١٤٬٩٠٠ ر.س", "٣٩٠ ر.س", "١٬٤٩٠ ر.س", "٣٬٩٩٠ ر.س", "SAR 9,900", "3,990 SAR", "390 SAR"]) {
      assert.ok(!text.includes(literal), `${path}: «${literal}» is a second copy of a book price`);
    }
  }
});

test("١٧٩: no price card reads a launch price — launch prices live in the dated campaign banner only", () => {
  const surfaces = [
    "lib/pricing/cardPrice.ts",
    "components/pricing/PricingCards.tsx",
    "components/pricing/PricingHero.tsx",
    "app/pricing/page.tsx",
    "app/pro/page.tsx",
    "app/laws/subscribe/page.tsx",
    "app/laws/components/PaywallModal.tsx",
    ...CONSTANTS,
    "constants/pricing/pricing.common.ts",
  ];
  for (const path of surfaces) assert.doesNotMatch(code(path), /launchPrices?/, path);
  // and the book has none yet, so nothing could leak
  for (const entry of Object.values(PRICE_BOOK)) assert.equal(entry.launchPrices, undefined, entry.id);
});
