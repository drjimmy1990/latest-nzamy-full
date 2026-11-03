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
  INDIVIDUAL_BUYERS,
  INDIVIDUAL_CYCLES,
  LAUNCH_CAMPAIGNS,
  PRICE_BOOK,
  PROFESSIONAL_BUYERS,
  PROFESSIONAL_CYCLES,
  activeLaunchPrice,
  activeLaunchPrices,
  bookCardOnSale,
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
  type Cycle,
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

test("owner package 30 Oct 2026 (٢٩٩–٣٠٢): the book holds the revised doc's prices, in whole SAR", () => {
  const want: Record<string, Partial<Record<string, number>>> = {
    "lawyer-pro": { monthly: 399, yearly: 3990 },
    "consultant-independent": { monthly: 399, yearly: 3990 },
    // §6أ: quarterly / half-yearly added; the monthly stays listed (retired)
    "firm-basic": { monthly: 990, quarterly: 2990, semiannual: 5490, yearly: 9900 },
    "firm-enterprise": { monthly: 1490, quarterly: 4490, semiannual: 8190, yearly: 14900 },
    // ٣٠١: 29 / 79 / 149 / 249 (39 is replaced by 29)
    "ind-ai": { monthly: 29, quarterly: 79, semiannual: 149, yearly: 249 },
    "ind-preventive": { monthly: 149, yearly: 1490 },
    "ind-litigation": { monthly: 399, yearly: 3990 },
    // §4ج + conflict ٢ / ٣٠٠: 3,490 a year — never 3,790 or 5,000
    "lib-q1": { once: 1050 },
    "lib-q2": { once: 1920 },
    "lib-annual": { once: 3490 },
    "topup-100": { once: 100 },
    "topup-250": { once: 250 },
    "topup-500": { once: 500 },
    "topup-1000": { once: 1000 },
    "topup-2500": { once: 2500 },
    "topup-5000": { once: 5000 },
    "topup-10000": { once: 10000 },
    // P3: the lawyer founder membership, one payment of 2,996 before VAT
    "lawyer-founder-2026": { once: 2996 },
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

/**
 * Owner package of 1 Nov 2026 §6.2.1 (q329 — Wave 1 task 5): individuals buy
 * yearly only. The cycles retired here, by id; nothing is deleted.
 */
const INDIVIDUAL_RETIRED: Record<string, readonly string[]> = {
  "ind-ai": ["monthly", "quarterly", "semiannual"],
  "ind-preventive": ["monthly", "yearly"],
  "ind-litigation": ["monthly", "yearly"],
};

/** ٣٠٣: only what the revised doc gives a launch price has one (ind-ai's 199 retired by q329). */
const LAUNCH_PRICED: Record<string, Record<string, number>> = {
  "firm-basic": { yearly: 8415 },
  "firm-enterprise": { yearly: 12665 },
};

test("no entry is retired or coming soon; the professionals' monthly cycle and the individuals' cancelled cycles are retired; launch prices only where the doc has one", () => {
  for (const entry of Object.values(PRICE_BOOK)) {
    assert.equal(entry.retired, undefined, entry.id);
    assert.equal(entry.comingSoon, undefined, entry.id);
    const launch = entry.launchPrices?.map((lp) => ({ campaignId: lp.campaignId, prices: { ...lp.prices } }));
    assert.deepEqual(
      launch,
      LAUNCH_PRICED[entry.id] ? [{ campaignId: "launch-2026", prices: LAUNCH_PRICED[entry.id] }] : undefined,
      entry.id,
    );
    // ind-preventive / ind-litigation: every cycle retired, so not on sale
    // (the entry carries no `retired` flag of its own: its prices do).
    const allRetired = entry.id === "ind-preventive" || entry.id === "ind-litigation";
    assert.equal(isOnSale(entry), !allRetired, entry.id);
    for (const [billing, p] of Object.entries(entry.prices)) {
      const retired =
        (billing === "monthly" && PROFESSIONAL_MONTHLY_RETIRED.includes(entry.id)) ||
        (INDIVIDUAL_RETIRED[entry.id] ?? []).includes(billing);
      assert.equal(p!.retired, retired ? true : undefined, `${entry.id} ${billing}`);
    }
  }
});

test("P3: the lawyer founder membership is a one-payment `membership` entry for lawyers only, with no tier, points or launch price", () => {
  const entry = PRICE_BOOK["lawyer-founder-2026"];
  assert.equal(entry.id, "lawyer-founder-2026");
  assert.equal(entry.kind, "membership");
  assert.equal(entry.labelAr, "باقة المحامي المؤسس");
  assert.deepEqual(entry.buyers, ["lawyer"]);
  assert.deepEqual(offeredBillings(entry), ["once"]);
  assert.equal(offeredSar(entry, "once"), 2996);
  assert.equal(entry.tier, undefined);
  assert.equal(entry.points, undefined);
  assert.equal(entry.libraryPlanRef, undefined);
  assert.equal(entry.launchPrices, undefined);
  assert.ok(isOnSale(entry));
  assert.equal(renewalPrice("lawyer-founder-2026", "yearly"), null, "never renews in a cycle");
  // the only membership in the book
  assert.deepEqual(Object.values(PRICE_BOOK).filter((e) => e.kind === "membership").map((e) => e.id), ["lawyer-founder-2026"]);
});

test("the professionals' monthly cycle (owner, 26 Oct: 399/month cancelled) is not sold, but renews as 'retired' with its old price", () => {
  for (const [id, sar] of [["lawyer-pro", 399], ["consultant-independent", 399], ["firm-basic", 990], ["firm-enterprise", 1490]] as const) {
    const entry = PRICE_BOOK[id];
    assert.deepEqual(offeredBillings(entry), id.startsWith("firm-") ? ["quarterly", "semiannual", "yearly"] : ["yearly"], id);
    assert.equal(offeredSar(entry, "monthly"), null, id);
    assert.deepEqual(renewalPrice(id, "monthly"), { status: "retired", sar }, `${id}: B2 must notify, never renew it silently`);
    assert.throws(() => bookSar(id, "monthly"), id);
  }
});

test("q329 (owner package of 1 Nov 2026): ind-ai is sold yearly at 249 only, with no launch price; ind-preventive and ind-litigation are sold in no cycle", () => {
  const ai = PRICE_BOOK["ind-ai"];
  assert.deepEqual(offeredBillings(ai), ["yearly"]);
  assert.equal(offeredSar(ai, "yearly"), 249, "249 before VAT, as before — the VAT question is the owner's");
  assert.equal(ai.launchPrices, undefined, "the 199 launch price is retired");
  assert.equal(activeLaunchPrice(ai, "yearly", new Date("2026-12-01T09:00:00Z")), null);
  for (const id of ["ind-preventive", "ind-litigation"]) {
    assert.equal(isOnSale(PRICE_BOOK[id]), false, id);
    assert.deepEqual(offeredBillings(PRICE_BOOK[id]), [], id);
  }
  // lookups by id still resolve (orders, receipts, admin, refunds)
  for (const id of Object.keys(INDIVIDUAL_RETIRED)) assert.equal(bookEntry(id)?.id, id);
  assert.equal(bookEntry("ind-litigation")?.labelAr, "التأمين القانوني");
  // the founder membership is untouched
  assert.ok(isOnSale(PRICE_BOOK["lawyer-founder-2026"]));
});

test("q329: every retired individual (id, cycle) resolves for the renewal lookup at its listed price, and a page asking for it throws", () => {
  const listed: Record<string, Record<string, number>> = {
    "ind-ai": { monthly: 29, quarterly: 79, semiannual: 149 },
    "ind-preventive": { monthly: 149, yearly: 1490 },
    "ind-litigation": { monthly: 399, yearly: 3990 },
  };
  for (const [id, cycles] of Object.entries(INDIVIDUAL_RETIRED)) {
    for (const cycle of cycles) {
      assert.deepEqual(renewalPrice(id, cycle), { status: "retired", sar: listed[id][cycle] }, `${id} ${cycle}`);
      assert.throws(() => bookSar(id, cycle as Cycle), `${id} ${cycle}`);
    }
  }
  assert.deepEqual(renewalPrice("ind-ai", "yearly"), { status: "sold", sar: 249 });
});

test("quarterly / half-yearly prices only on ind-ai (listed, retired) and the two firm plans (the DB accepts them since 20261026_10)", () => {
  const withNewCycles = Object.values(PRICE_BOOK)
    .filter((e) => Object.hasOwn(e.prices, "quarterly") || Object.hasOwn(e.prices, "semiannual"))
    .map((e) => e.id)
    .sort();
  assert.deepEqual(withNewCycles, ["firm-basic", "firm-enterprise", "ind-ai"]);
});

test("٣٠٢ / conflict ١١: 100 and 250 for individuals only (3 months); 500 and up for professionals only", () => {
  const want: Record<string, [number, number, readonly string[]]> = {
    "topup-100": [100, 3, INDIVIDUAL_BUYERS],
    "topup-250": [250, 3, INDIVIDUAL_BUYERS],
    "topup-500": [500, 3, PROFESSIONAL_BUYERS],
    "topup-1000": [1250, 6, PROFESSIONAL_BUYERS],
    "topup-2500": [3500, 12, PROFESSIONAL_BUYERS],
    "topup-5000": [8500, 12, PROFESSIONAL_BUYERS],
    "topup-10000": [25000, 12, PROFESSIONAL_BUYERS],
  };
  const topups = Object.values(PRICE_BOOK).filter((e) => e.kind === "topup");
  assert.deepEqual(topups.map((e) => e.id).sort(), Object.keys(want).sort());
  for (const e of topups) {
    const [points, months, buyers] = want[e.id];
    assert.equal(e.points, points, e.id);
    assert.equal(e.pointsValidityMonths, months, e.id);
    assert.deepEqual([...e.buyers], [...buyers], e.id);
  }
  assert.deepEqual([...INDIVIDUAL_BUYERS], ["individual"]);
  assert.ok(!(PROFESSIONAL_BUYERS as readonly string[]).includes("individual"));
  for (const t of ["lawyer", "firm", "corporate", "micro", "government", "ngo", "provider"]) {
    assert.ok((PROFESSIONAL_BUYERS as readonly string[]).includes(t), t);
  }
});

// ── ٣٠٣: launch prices run 25 Oct 2026 – 25 Jan 2027, Riyadh days, both ends included ──

test("٣٠٣: the launch campaign's dates are the owner's", () => {
  assert.deepEqual({ ...LAUNCH_CAMPAIGNS["launch-2026"] }, { id: "launch-2026", startsOn: "2026-10-25", endsOn: "2027-01-25" });
});

test("٣٠٣: a launch price runs only inside its Riyadh days, and only for the cycle the doc gives one", () => {
  const firm = PRICE_BOOK["firm-basic"];
  // 24 Oct 20:59 UTC = 24 Oct 23:59 Riyadh — the day before
  assert.equal(activeLaunchPrice(firm, "yearly", new Date("2026-10-24T20:59:00Z")), null);
  // 24 Oct 21:00 UTC = 25 Oct 00:00 Riyadh — the first day
  assert.deepEqual(activeLaunchPrice(firm, "yearly", new Date("2026-10-24T21:00:00Z")), {
    campaignId: "launch-2026", sar: 8415, listSar: 9900, endsOn: "2027-01-25",
  });
  // 25 Jan 2027 23:59 Riyadh — the last day still runs
  assert.equal(activeLaunchPrice(firm, "yearly", new Date("2027-01-25T20:59:00Z"))?.sar, 8415);
  // 26 Jan 2027 00:00 Riyadh — gone by itself
  assert.equal(activeLaunchPrice(firm, "yearly", new Date("2027-01-25T21:00:00Z")), null);
  // the doc gives no launch price for the other cycles
  for (const b of ["quarterly", "semiannual"] as const) {
    assert.equal(activeLaunchPrice(firm, b, new Date("2026-11-01T09:00:00Z")), null, b);
  }
  // a retired cycle never has one
  assert.equal(activeLaunchPrice(PRICE_BOOK["firm-basic"], "monthly", new Date("2026-11-01T09:00:00Z")), null);
});

test("٣٠٣: activeLaunchPrices lists every running launch price by id:billing, and nothing outside the campaign", () => {
  const during = activeLaunchPrices(new Date("2026-12-01T09:00:00Z"));
  assert.deepEqual(Object.keys(during).sort(), ["firm-basic:yearly", "firm-enterprise:yearly"]);
  assert.equal(during["firm-basic:yearly"].sar, 8415);
  assert.equal(during["firm-enterprise:yearly"].sar, 12665);
  assert.deepEqual(activeLaunchPrices(new Date("2027-02-01T09:00:00Z")), {});
  assert.deepEqual(activeLaunchPrices(new Date("2026-10-01T09:00:00Z")), {});
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

test("task 5 review M3: bookCardOnSale hides a card only when its id is a book entry not on sale", () => {
  // the fixture book: retired, a retired cycle only, coming soon, not in the book
  assert.equal(bookCardOnSale("old-plan", FIXTURE), false);
  assert.equal(bookCardOnSale("firm-x", FIXTURE), true);
  assert.equal(bookCardOnSale("soon", FIXTURE), false);
  assert.equal(bookCardOnSale("pay-per-piece", FIXTURE), true);
  assert.equal(bookCardOnSale("constructor", FIXTURE), true, "an inherited key is not an entry");
  // the real book (q329): the retired individual plans, and the one still sold
  assert.equal(bookCardOnSale("ind-preventive"), false);
  assert.equal(bookCardOnSale("ind-litigation"), false);
  assert.equal(bookCardOnSale("ind-ai"), true);
  assert.equal(bookCardOnSale("topup-100"), true);
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
  assert.equal(bookPriceText("lib-q2", "once", "en"), "1,920");
  assert.equal(bookSar("ind-ai", "yearly"), 249);
  assert.throws(() => bookSar("ind-ai", "monthly"), "q329: individuals are not sold monthly");
  assert.throws(() => bookPriceText("lawyer-pro", "quarterly", "ar"));
  assert.throws(() => bookPriceText("lawyer-pro", "monthly", "ar"), "a retired cycle is not sold");
  assert.throws(() => bookPriceText("lib-q1", "monthly", "ar"));
  assert.throws(() => bookSar("nope", "yearly"));
});
