/**
 * priceBook.ts — the one server price book (owner's pricing doc, 25 Oct 2026,
 * §2 rule 4: «وحدة مرجع السعر — Single PriceBook»).
 *
 * Every plan, library pass and top-up sold online lives here, once, in SAR,
 * BEFORE VAT (§2 rule 5, answer ٢٥٨: every price on the platform is
 * VAT-exclusive; 15 % is added at checkout and on the receipt). Everything
 * else derives from it:
 *   - src/lib/payments/catalog.ts — what checkout charges (halalas);
 *   - src/lib/pricing/cardPrice.ts — what a /pricing card shows;
 *   - src/lib/pricing/plans.ts, /laws/subscribe, the /laws paywall, /pro and
 *     the admin pricing screen;
 *   - the subscription_plans seed (catalog.test.ts holds it to the book).
 *
 * B2C per-service estimates (ai-consult, video-full, …) are NOT here: their
 * truth is the admin_pricing_catalog table, read through /api/client-pricing
 * (docs/plans/2026-10-26-P1-price-book-design.md §1).
 *
 * Retire, never delete: an entry (or one cycle of it) that is no longer sold
 * is marked `retired`. Checkout refuses it; fulfilment, receipts, refunds,
 * admin views and the renewal lookup still resolve it, because orders and
 * subscriptions keep pointing at its id.
 *
 * Launch prices (`launchPrices`, owner ٣٠٣ of 30 Oct 2026 — it replaces ١٧٩
 * here): only an entry the revised pricing doc of 26 Oct gives a launch price
 * has one. While its campaign runs (LAUNCH_CAMPAIGNS, Riyadh days, both ends
 * included) checkout charges it and the card shows the listed price struck
 * through beside it; after the last day both go back to the listed price on
 * their own. The day is always the SERVER's (activeLaunchPrice is called with
 * the request's clock, never the browser's — the SSR cached-date trap).
 *
 * Pure: relative imports only, so `node --test` loads it directly.
 */

import { riyadhDay } from "./campaigns.ts";

/** A subscription cycle: 1, 3, 6 or 12 calendar months. */
export type Cycle = "monthly" | "quarterly" | "semiannual" | "yearly";
/** What an order is billed as: a cycle, or one payment. */
export type Billing = Cycle | "once";

export const CYCLES: readonly Cycle[] = Object.freeze(["monthly", "quarterly", "semiannual", "yearly"] as const);
export const BILLINGS: readonly Billing[] = Object.freeze([...CYCLES, "once"] as Billing[]);

export const CYCLE_MONTHS: Readonly<Record<Cycle, number>> = Object.freeze({
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
});

export function isBilling(value: unknown): value is Billing {
  return typeof value === "string" && (BILLINGS as readonly string[]).includes(value);
}

export function isCycle(value: unknown): value is Cycle {
  return typeof value === "string" && (CYCLES as readonly string[]).includes(value);
}

/** «شهري» / «ربع سنوي» / «نصف سنوي» / «سنوي» / «دفعة واحدة» */
export const BILLING_LABEL_AR: Readonly<Record<Billing, string>> = Object.freeze({
  monthly: "شهري",
  quarterly: "ربع سنوي",
  semiannual: "نصف سنوي",
  yearly: "سنوي",
  once: "دفعة واحدة",
});

export const BILLING_LABEL_EN: Readonly<Record<Billing, string>> = Object.freeze({
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Half-yearly",
  yearly: "Yearly",
  once: "One payment",
});

/**
 * The cycles an audience may be offered (§2 rule 1): lawyers, firms,
 * companies, establishments, NGOs and providers subscribe quarterly,
 * half-yearly or yearly only; individuals and families may also pay monthly.
 */
export const PROFESSIONAL_CYCLES: readonly Cycle[] = Object.freeze(["quarterly", "semiannual", "yearly"] as const);
export const INDIVIDUAL_CYCLES: readonly Cycle[] = CYCLES;

export type BookItemKind = "plan" | "library" | "topup";

/** The paid tiers a plan grants — a subset of ServerTier in src/lib/access-control.ts. */
export type ServerTierLiteral = "ai" | "pro" | "max" | "corp" | "enterprise";

export type LibraryPlanRef = "lib-q1" | "lib-q2" | "lib-annual";

/** One listed price: whole SAR, before VAT. `retired` = no longer sold in this cycle. */
export interface BookPrice {
  readonly sar: number;
  readonly retired?: true;
}

/**
 * A dated launch campaign. `startsOn` / `endsOn` are Riyadh days
 * (`YYYY-MM-DD`), both included.
 */
export interface LaunchCampaign {
  readonly id: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

/**
 * Owner ٣٠٣ (30 Oct 2026; pricing doc 26 Oct §13ج.6): launch prices run from
 * 25 Oct 2026 to 25 Jan 2027 and disappear by themselves after it.
 */
export const LAUNCH_CAMPAIGNS: Readonly<Record<string, LaunchCampaign>> = Object.freeze({
  "launch-2026": Object.freeze({ id: "launch-2026", startsOn: "2026-10-25", endsOn: "2027-01-25" }),
});

/** A campaign-bound price, charged and shown struck-through while its campaign runs (owner ٣٠٣). */
export interface LaunchPrice {
  readonly campaignId: string;
  readonly prices: Readonly<Partial<Record<Billing, number>>>;
}

export interface BookEntry {
  readonly id: string;
  readonly kind: BookItemKind;
  readonly labelAr: string;
  /**
   * The `profiles.user_type` values that may buy this item online, or "any".
   * Access is gated by tier rank and same-rank purchases stack, so a plan
   * sold to the wrong audience would buy another audience's access cheaper
   * (a lawyer taking ind-preventive's `pro` for 149 instead of lawyer-pro).
   */
  readonly buyers: readonly string[] | "any";
  /** SAR before VAT, per billing. A cycle that is not listed is not offered. */
  readonly prices: Readonly<Partial<Record<Billing, BookPrice>>>;
  readonly tier?: ServerTierLiteral;
  readonly libraryPlanRef?: LibraryPlanRef;
  readonly libraryDays?: number;
  readonly points?: number;
  readonly pointsValidityMonths?: number;
  /** Not for sale any more; still resolvable for existing orders and subscriptions. */
  readonly retired?: true;
  /** Priced but not launched: the price is stored, never shown or sold (owner L446). */
  readonly comingSoon?: true;
  readonly launchPrices?: readonly LaunchPrice[];
}

function freezeEntry(entry: BookEntry): BookEntry {
  for (const p of Object.values(entry.prices)) if (p) Object.freeze(p);
  Object.freeze(entry.prices);
  if (Array.isArray(entry.buyers)) Object.freeze(entry.buyers);
  if (entry.launchPrices) {
    for (const lp of entry.launchPrices) {
      Object.freeze(lp.prices);
      Object.freeze(lp);
    }
    Object.freeze(entry.launchPrices);
  }
  return Object.freeze(entry);
}

function plan(
  id: string,
  labelAr: string,
  prices: Partial<Record<Cycle, number>>,
  tier: ServerTierLiteral,
  buyers: readonly string[],
  retiredCycles: readonly Cycle[] = [],
  launchPrices: readonly LaunchPrice[] = [],
): BookEntry {
  const listed: Partial<Record<Billing, BookPrice>> = {};
  for (const c of CYCLES) {
    if (prices[c] === undefined) continue;
    listed[c] = retiredCycles.includes(c) ? { sar: prices[c]!, retired: true } : { sar: prices[c]! };
  }
  return freezeEntry({
    id,
    kind: "plan",
    labelAr,
    prices: listed,
    tier,
    buyers: [...buyers],
    ...(launchPrices.length > 0 ? { launchPrices: launchPrices.map((lp) => ({ ...lp, prices: { ...lp.prices } })) } : {}),
  });
}

/**
 * The `profiles.user_type` values of the professional audiences (pricing doc
 * §2 rule 1) and of individuals. Top-ups are split between them (owner ٣٠٢,
 * conflict ١١): 100 and 250 for individuals only, 500 and up for
 * professionals only.
 */
export const PROFESSIONAL_BUYERS: readonly string[] = Object.freeze([
  "lawyer",
  "firm",
  "corporate",
  "micro",
  "government",
  "ngo",
  "provider",
]);
export const INDIVIDUAL_BUYERS: readonly string[] = Object.freeze(["individual"]);

function library(id: LibraryPlanRef, labelAr: string, sar: number, days: number): BookEntry {
  return freezeEntry({
    id,
    kind: "library",
    labelAr,
    prices: { once: { sar } },
    libraryPlanRef: id,
    libraryDays: days,
    buyers: "any",
  });
}

function topup(
  id: string,
  labelAr: string,
  sar: number,
  points: number,
  months: number,
  buyers: readonly string[],
): BookEntry {
  return freezeEntry({
    id,
    kind: "topup",
    labelAr,
    prices: { once: { sar } },
    points,
    pointsValidityMonths: months,
    buyers: [...buyers],
  });
}

/**
 * The book. The professionals' MONTHLY cycle is retired (the owner confirmed
 * on 26 Oct 2026 that the 399 monthly plan is cancelled; professionals never
 * pay monthly — pricing doc §2 rule 1): checkout refuses it (410), while
 * monthly orders and subscriptions already made still resolve for
 * fulfilment, receipts, refunds, admin and renewal.
 *
 * Owner package of 30 Oct 2026 (answer ٢٩٩: the revised pricing doc of 26 Oct
 * is final; its 14 conflicts are settled in the 28-Oct handover §١/٣, which
 * wins where the two differ) — docs/audits/2026-10-30-owner-package-pricing.md:
 *   - the library (doc §4ج, conflict ٢, answer ٣٠٠): 1,050 / 1,920 / 3,490;
 *   - ind-ai, the doc's «الباقة الذكية الذاتية» `ind-smart` (§7أ.2, answer
 *     ٣٠١): 29 / 79 / 149 / 249 a year, launch 199 a year; the id stays
 *     ind-ai so orders and subscriptions keep resolving;
 *   - the firms' quarterly and half-yearly prices (§6أ) and their launch
 *     prices for the first year (8,415 / 12,665);
 *   - top-ups (§4هـ, conflict ١١, answer ٣٠٢): 100 and 250 for individuals
 *     only, 1 point a riyal, 3 months; 500 / 1,000 / 2,500 / 5,000 / 10,000
 *     for professionals only, the doc's everyday balance (its larger «فترة
 *     العروض» balance is not dated by the owner, so it is not granted), valid
 *     3 / 6 / 12 / 12 / 12 months.
 * Still waiting (the doc's own numbers need the owner): lawyer-pro and
 * consultant-independent → erp-* / bundle-* (P2), the founder memberships
 * (P3), ind-preventive / ind-litigation (the revised §7أ prices neither the
 * same way as today — owner question in the ledger).
 */
export const PRICE_BOOK: Readonly<Record<string, BookEntry>> = Object.freeze({
  "lawyer-pro": plan("lawyer-pro", "المحامي المحترف", { monthly: 399, yearly: 3990 }, "pro", ["lawyer"], ["monthly"]),
  "consultant-independent": plan("consultant-independent", "المستشار القانوني المستقل", { monthly: 399, yearly: 3990 }, "pro", ["lawyer", "provider"], ["monthly"]),
  "firm-basic": plan(
    "firm-basic",
    "مكتب المحاماة",
    { monthly: 990, quarterly: 2990, semiannual: 5490, yearly: 9900 },
    "corp",
    ["firm"],
    ["monthly"],
    [{ campaignId: "launch-2026", prices: { yearly: 8415 } }],
  ),
  "firm-enterprise": plan(
    "firm-enterprise",
    "شركة المحاماة",
    { monthly: 1490, quarterly: 4490, semiannual: 8190, yearly: 14900 },
    "enterprise",
    ["firm"],
    ["monthly"],
    [{ campaignId: "launch-2026", prices: { yearly: 12665 } }],
  ),
  "ind-ai": plan(
    "ind-ai",
    "الباقة الذكية",
    { monthly: 29, quarterly: 79, semiannual: 149, yearly: 249 },
    "ai",
    ["individual"],
    [],
    [{ campaignId: "launch-2026", prices: { yearly: 199 } }],
  ),
  "ind-preventive": plan("ind-preventive", "الباقة الوقائية", { monthly: 149, yearly: 1490 }, "pro", ["individual"]),
  "ind-litigation": plan("ind-litigation", "التأمين القانوني", { monthly: 399, yearly: 3990 }, "max", ["individual"]),
  "lib-q1": library("lib-q1", "المكتبة القانونية — ربع سنوي", 1050, 90),
  "lib-q2": library("lib-q2", "المكتبة القانونية — نصف سنوي", 1920, 180),
  "lib-annual": library("lib-annual", "المكتبة القانونية — سنوي", 3490, 365),
  "topup-100": topup("topup-100", "شحن ١٠٠ (١٠٠ نقطة)", 100, 100, 3, INDIVIDUAL_BUYERS),
  "topup-250": topup("topup-250", "شحن ٢٥٠ (٢٥٠ نقطة)", 250, 250, 3, INDIVIDUAL_BUYERS),
  "topup-500": topup("topup-500", "شحن ٥٠٠ (٥٠٠ نقطة)", 500, 500, 3, PROFESSIONAL_BUYERS),
  "topup-1000": topup("topup-1000", "شحن ١٬٠٠٠ (١٬٢٥٠ نقطة)", 1000, 1250, 6, PROFESSIONAL_BUYERS),
  "topup-2500": topup("topup-2500", "شحن ٢٬٥٠٠ (٣٬٥٠٠ نقطة)", 2500, 3500, 12, PROFESSIONAL_BUYERS),
  "topup-5000": topup("topup-5000", "شحن ٥٬٠٠٠ (٨٬٥٠٠ نقطة)", 5000, 8500, 12, PROFESSIONAL_BUYERS),
  "topup-10000": topup("topup-10000", "شحن ١٠٬٠٠٠ (٢٥٬٠٠٠ نقطة)", 10000, 25000, 12, PROFESSIONAL_BUYERS),
});

// ── lookups ─────────────────────────────────────────────────────────────────

/** The entry for an id (retired ones included), or undefined. Never an inherited key. */
export function bookEntry(id: string, book: Readonly<Record<string, BookEntry>> = PRICE_BOOK): BookEntry | undefined {
  return Object.hasOwn(book, id) ? book[id] : undefined;
}

/** True while the entry is on sale: not retired, not coming soon, and some billing still sold. */
export function isOnSale(entry: BookEntry): boolean {
  return !entry.retired && !entry.comingSoon && offeredBillings(entry).length > 0;
}

/** The billings the entry is SOLD in today, in book order (retired cycles left out). */
export function offeredBillings(entry: BookEntry): Billing[] {
  if (entry.retired || entry.comingSoon) return [];
  return BILLINGS.filter((b) => {
    const p = Object.hasOwn(entry.prices, b) ? entry.prices[b] : undefined;
    return p !== undefined && !p.retired;
  });
}

/** SAR before VAT for a billing the entry is sold in today, or null. */
export function offeredSar(entry: BookEntry, billing: Billing): number | null {
  return offeredBillings(entry).includes(billing) ? entry.prices[billing]!.sar : null;
}

/** An entry's launch price that runs on `now`, for a billing it is sold in today. */
export interface ActiveLaunchPrice {
  readonly campaignId: string;
  /** SAR before VAT: what checkout charges while the campaign runs. */
  readonly sar: number;
  /** SAR before VAT: the listed price, struck through beside it. */
  readonly listSar: number;
  /** The campaign's last Riyadh day (`YYYY-MM-DD`). */
  readonly endsOn: string;
}

/**
 * The launch price of (entry, billing) on `now`, or null: none listed, the
 * billing not sold today, the campaign unknown or outside its Riyadh days, or
 * the price not below the listed one. `now` is the server's request time —
 * never call this with a date baked into a cached page.
 */
export function activeLaunchPrice(
  entry: BookEntry,
  billing: Billing,
  now: Date,
  campaigns: Readonly<Record<string, LaunchCampaign>> = LAUNCH_CAMPAIGNS,
): ActiveLaunchPrice | null {
  return launchPriceOn(entry.launchPrices, offeredSar(entry, billing), billing, now, campaigns);
}

/**
 * The rule under activeLaunchPrice, for callers holding the launch prices and
 * the sold list price only (catalog.quote, in halalas' SAR).
 */
export function launchPriceOn(
  launchPrices: readonly LaunchPrice[] | undefined,
  listSar: number | null,
  billing: Billing,
  now: Date,
  campaigns: Readonly<Record<string, LaunchCampaign>> = LAUNCH_CAMPAIGNS,
): ActiveLaunchPrice | null {
  if (listSar === null || !launchPrices) return null;
  const day = riyadhDay(now);
  for (const lp of launchPrices) {
    const campaign = Object.hasOwn(campaigns, lp.campaignId) ? campaigns[lp.campaignId] : undefined;
    if (!campaign || day < campaign.startsOn || day > campaign.endsOn) continue;
    const sar = Object.hasOwn(lp.prices, billing) ? lp.prices[billing] : undefined;
    if (typeof sar !== "number" || !Number.isSafeInteger(sar) || sar <= 0 || sar >= listSar) continue;
    return { campaignId: campaign.id, sar, listSar, endsOn: campaign.endsOn };
  }
  return null;
}

/** Every launch price running on `now`, keyed `id:billing` (GET /api/v1/pricing/launch). */
export function activeLaunchPrices(
  now: Date,
  book: Readonly<Record<string, BookEntry>> = PRICE_BOOK,
): Record<string, ActiveLaunchPrice> {
  const out: Record<string, ActiveLaunchPrice> = {};
  for (const entry of Object.values(book)) {
    if (!entry.launchPrices) continue;
    for (const billing of offeredBillings(entry)) {
      const lp = activeLaunchPrice(entry, billing, now);
      if (lp) out[`${entry.id}:${billing}`] = lp;
    }
  }
  return out;
}

/**
 * What a renewal of (id, billing) would cost: `sold` at today's price,
 * `retired` with the last listed price (B2 notifies the holder instead of
 * silently renewing a plan or cycle that is no longer sold), or null when the
 * book never listed that billing for the id.
 */
export function renewalPrice(
  id: string,
  billing: string,
  book: Readonly<Record<string, BookEntry>> = PRICE_BOOK,
): { status: "sold"; sar: number } | { status: "retired"; sar: number } | null {
  const entry = bookEntry(id, book);
  if (!entry || !isBilling(billing)) return null;
  const listed = Object.hasOwn(entry.prices, billing) ? entry.prices[billing] : undefined;
  if (!listed) return null;
  const sold = offeredSar(entry, billing);
  return sold !== null ? { status: "sold", sar: sold } : { status: "retired", sar: listed.sar };
}

// ── display ─────────────────────────────────────────────────────────────────

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** 3990 → «٣٬٩٩٠» (ar) or "3,990" (en). Whole SAR only. */
export function formatSarAmount(sar: number, lang: "ar" | "en"): string {
  if (!Number.isSafeInteger(sar) || sar < 0) {
    throw new RangeError(`formatSarAmount: expected a non-negative whole SAR amount, got ${sar}`);
  }
  const latin = String(sar).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (lang === "en") return latin;
  return latin.replace(/,/g, "٬").replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

/**
 * The displayed amount of a book price sold today, e.g. («lawyer-pro»,
 * "yearly", "ar") → «٣٬٩٩٠». Throws for an id or billing the book does not
 * sell (retired, coming soon, never listed). Most callers run at module scope,
 * so such a page would fail to load: bookCallSites.test.ts lists every literal
 * call site and fails when one names a price the book no longer sells — the
 * phase that retires a price updates those pages in the same change.
 */
export function bookPriceText(id: string, billing: Billing, lang: "ar" | "en"): string {
  const entry = bookEntry(id);
  const sar = entry ? offeredSar(entry, billing) : null;
  if (sar === null) throw new Error(`price book: ${id} is not sold ${billing}`);
  return formatSarAmount(sar, lang);
}

/** SAR of a book price sold today (for pages that format numbers themselves). Throws like bookPriceText. */
export function bookSar(id: string, billing: Billing): number {
  const entry = bookEntry(id);
  const sar = entry ? offeredSar(entry, billing) : null;
  if (sar === null) throw new Error(`price book: ${id} is not sold ${billing}`);
  return sar;
}
