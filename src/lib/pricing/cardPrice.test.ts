/**
 * cardPrice.test.ts — /pricing cards read the price book; the cycle toggle
 * offers only cycles the audience may buy and a card on screen prices.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  audienceCycles,
  cardLaunch,
  cardPrice,
  cardTotalWithVat,
  displayCycle,
  isBookCard,
  offeredCycles,
  type CardPriceFields,
  type LaunchPriceMap,
} from "./cardPrice.ts";
import { PRICE_BOOK, activeLaunchPrices, formatSarAmount, offeredSar, type Cycle } from "./priceBook.ts";
import { quote } from "../payments/catalog.ts";

const card = (id: string, extra: Partial<CardPriceFields> = {}): CardPriceFields => ({
  id,
  periodMonthly: "ر.س / شهر",
  periodYearly: "ر.س / سنة",
  ...extra,
});

test("a book card's price is the book's, in each cycle it is sold", () => {
  assert.deepEqual(cardPrice(card("lawyer-pro"), "yearly", "ar"), { price: "٣٬٩٩٠", period: "ر.س / سنة" });
  assert.equal(cardPrice(card("lawyer-pro"), "monthly", "ar"), null, "the professionals' monthly cycle is retired");
  assert.deepEqual(cardPrice(card("ind-ai"), "monthly", "ar"), { price: "٢٩", period: "ر.س / شهر" });
  assert.deepEqual(cardPrice(card("ind-ai", { periodYearly: "SAR / year" }), "yearly", "en"), { price: "249", period: "SAR / year" });
  assert.deepEqual(cardPrice(card("ind-ai"), "quarterly", "ar"), { price: "٧٩", period: "ر.س / ٣ أشهر" });
  assert.deepEqual(cardPrice(card("firm-basic"), "semiannual", "en"), { price: "5,490", period: "SAR / 6 months" });
  assert.equal(cardPrice(card("lawyer-pro"), "quarterly", "ar"), null, "no quarterly price: the card is not shown in that cycle");
});

test("a one-payment card (top-up, library pass) shows its price in every cycle", () => {
  for (const cycle of ["monthly", "quarterly", "semiannual", "yearly"] as Cycle[]) {
    assert.deepEqual(cardPrice(card("topup-250", { periodMonthly: "ر.س / الشحنة" }), cycle, "ar"), { price: "٢٥٠", period: "ر.س / الشحنة" });
    assert.deepEqual(cardPrice(card("lib-q2", { periodMonthly: "SAR / 6 months" }), cycle, "en"), { price: "1,920", period: "SAR / 6 months" });
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

test("lawyers see yearly only; firms quarterly / half / yearly (§6أ); the monthly 399 / 990 are not advertised", () => {
  const lawyers = ["lawyer-pro", "topup-500", "topup-1000", "topup-2500", "topup-5000", "topup-10000"].map((id) => ({ id }));
  assert.deepEqual(offeredCycles("lawyers", lawyers), ["yearly"]);
  assert.deepEqual(offeredCycles("firms", [{ id: "firm-basic" }, { id: "firm-enterprise" }]), ["quarterly", "semiannual", "yearly"]);
  // individuals: ind-ai sells all four cycles (٣٠١), the other two monthly and yearly
  assert.deepEqual(
    offeredCycles("individuals", [{ id: "pay-per-piece" }, { id: "ind-ai" }, { id: "ind-preventive" }, { id: "ind-litigation" }]),
    ["monthly", "quarterly", "semiannual", "yearly"],
  );
  assert.equal(cardPrice(card("ind-preventive"), "quarterly", "ar"), null, "not sold quarterly: hidden in that cycle");
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
  assert.equal(cards, 34, "17 book items, once in Arabic and once in English");
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

// ── ٣٠٣ (replaces ١٧٩): a launch price shows on the card, struck-through original beside it ──

const DURING = activeLaunchPrices(new Date("2026-12-01T09:00:00Z"));

test("٣٠٣: a card shows a launch price only from the server's map, and only for the cycle it runs in", () => {
  assert.deepEqual(cardLaunch({ id: "ind-ai" }, "yearly", DURING, "ar"), { price: "١٩٩", original: "٢٤٩" });
  assert.deepEqual(cardLaunch({ id: "firm-basic" }, "yearly", DURING, "en"), { price: "8,415", original: "9,900" });
  assert.deepEqual(cardLaunch({ id: "firm-enterprise" }, "yearly", DURING, "en"), { price: "12,665", original: "14,900" });
  assert.equal(cardLaunch({ id: "ind-ai" }, "monthly", DURING, "ar"), null, "no launch price for the monthly cycle");
  assert.equal(cardLaunch({ id: "firm-basic" }, "quarterly", DURING, "ar"), null);
  assert.equal(cardLaunch({ id: "lawyer-pro" }, "yearly", DURING, "ar"), null, "the doc gives lawyer-pro none");
  // the first render and after the campaign: nothing
  assert.equal(cardLaunch({ id: "ind-ai" }, "yearly", null, "ar"), null);
  assert.equal(cardLaunch({ id: "ind-ai" }, "yearly", activeLaunchPrices(new Date("2027-02-01T09:00:00Z")), "ar"), null);
});

test("٣٠٣: a stale or malformed map entry shows nothing rather than a wrong pair", () => {
  const stale: LaunchPriceMap = { "ind-ai:yearly": { sar: 199, listSar: 390 } };
  assert.equal(cardLaunch({ id: "ind-ai" }, "yearly", stale, "ar"), null, "its listed price is not the book's");
  for (const sar of [0, -5, 249, 300, 19.5]) {
    assert.equal(cardLaunch({ id: "ind-ai" }, "yearly", { "ind-ai:yearly": { sar, listSar: 249 } }, "ar"), null, String(sar));
  }
  const inherited = Object.create({ "ind-ai:yearly": { sar: 199, listSar: 249 } }) as LaunchPriceMap;
  assert.equal(cardLaunch({ id: "ind-ai" }, "yearly", inherited, "ar"), null, "own keys only");
  assert.equal(cardLaunch({ id: "biz-sm-basic" }, "yearly", DURING, "ar"), null, "not a book card");
});

test("٣٠٣: the card never decides the date — no clock in cardPrice or the cards, the server route does", () => {
  for (const path of ["lib/pricing/cardPrice.ts", "components/pricing/PricingCards.tsx", "hooks/useLaunchPrices.ts"]) {
    assert.doesNotMatch(code(path), /new Date\(|Date\.now\(|activeLaunchPrices?\(/, path);
  }
  const route = code("app/api/v1/pricing/launch/route.ts");
  assert.match(route, /activeLaunchPrices\(new Date\(\)\)/);
  assert.match(route, /dynamic = "force-dynamic"/);
  assert.match(route, /no-store/);
  const hook = code("hooks/useLaunchPrices.ts");
  assert.match(hook, /useState<LaunchPriceMap \| null>\(null\)/, "the first render has no launch price");
  assert.match(hook, /useEffect\(/);
});

// ── UX14: the VAT-inclusive total and the cycle next to the button ─────────────

test("UX14: the total with VAT is checkout's own arithmetic, in the card's billing", () => {
  assert.equal(cardTotalWithVat({ id: "ind-ai" }, "monthly", null, "ar"), "الإجمالي شامل الضريبة ٣٣٫٣٥ ر.س · شهري");
  assert.equal(cardTotalWithVat({ id: "lawyer-pro" }, "yearly", null, "en"), "Total incl. VAT: SAR 4,588.50 · Yearly");
  assert.equal(cardTotalWithVat({ id: "lib-annual" }, "monthly", null, "en"), "Total incl. VAT: SAR 4,013.50 · One payment");
  // a launch price is what the total is computed from
  assert.equal(cardTotalWithVat({ id: "ind-ai" }, "yearly", DURING, "en"), "Total incl. VAT: SAR 228.85 · Yearly");
  // nothing for a card the book does not price, or a cycle it does not sell
  assert.equal(cardTotalWithVat({ id: "biz-sm-basic" }, "yearly", null, "ar"), null);
  assert.equal(cardTotalWithVat({ id: "lawyer-pro" }, "monthly", null, "ar"), null);
});

test("UX14: every book card's total equals catalog.quote's total, with and without the launch price", () => {
  const during = new Date("2026-12-01T09:00:00Z");
  const after = new Date("2027-03-01T09:00:00Z");
  for (const id of Object.keys(PRICE_BOOK)) {
    for (const cycle of ["monthly", "quarterly", "semiannual", "yearly"] as Cycle[]) {
      for (const [now, map] of [[during, DURING], [after, null]] as const) {
        const shown = cardTotalWithVat({ id }, cycle, map, "en");
        if (shown === null) continue;
        const billing = offeredSar(PRICE_BOOK[id], "once") !== null ? "once" : cycle;
        const q = quote(id, billing, undefined, now);
        assert.ok(q.ok, `${id} ${billing}`);
        const total = q.totalHalalas;
        const want = `${Math.floor(total / 100).toLocaleString("en-US")}${total % 100 ? "." + String(total % 100).padStart(2, "0") : ""}`;
        assert.ok(shown.includes(`SAR ${want} ·`), `${id} ${billing}: ${shown} vs ${want}`);
      }
    }
  }
});
