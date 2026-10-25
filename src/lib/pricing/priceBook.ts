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
 * Launch prices (`launchPrices`) are campaign-bound and dated by the
 * campaign; they are shown in the dated banner only, never inside a price card
 * (owner ١٧٩). No entry has one yet.
 *
 * Pure: no runtime imports, so `node --test` loads it directly.
 */

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

/** A campaign-bound price, shown only in that campaign's dated banner (owner ١٧٩). */
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
): BookEntry {
  const listed: Partial<Record<Billing, BookPrice>> = {};
  for (const c of CYCLES) if (prices[c] !== undefined) listed[c] = { sar: prices[c]! };
  return freezeEntry({ id, kind: "plan", labelAr, prices: listed, tier, buyers: [...buyers] });
}

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

function topup(id: string, labelAr: string, sar: number, points: number, months: number): BookEntry {
  return freezeEntry({
    id,
    kind: "topup",
    labelAr,
    prices: { once: { sar } },
    points,
    pointsValidityMonths: months,
    buyers: "any",
  });
}

/**
 * The book. Prices are today's (P1 changes none). P2 retires lawyer-pro and
 * consultant-independent and adds the lib/erp/bundle paths; P6 retires the
 * firms' monthly cycle; P5 adds the individuals' quarterly and half-yearly
 * prices — see docs/plans/2026-10-26-P1-price-book-design.md §6.
 */
export const PRICE_BOOK: Readonly<Record<string, BookEntry>> = Object.freeze({
  "lawyer-pro": plan("lawyer-pro", "المحامي المحترف", { monthly: 399, yearly: 3990 }, "pro", ["lawyer"]),
  "consultant-independent": plan("consultant-independent", "المستشار القانوني المستقل", { monthly: 399, yearly: 3990 }, "pro", ["lawyer", "provider"]),
  "firm-basic": plan("firm-basic", "مكتب المحاماة", { monthly: 990, yearly: 9900 }, "corp", ["firm"]),
  "firm-enterprise": plan("firm-enterprise", "شركة المحاماة", { monthly: 1490, yearly: 14900 }, "enterprise", ["firm"]),
  "ind-ai": plan("ind-ai", "الباقة الذكية", { monthly: 39, yearly: 390 }, "ai", ["individual"]),
  "ind-preventive": plan("ind-preventive", "الباقة الوقائية", { monthly: 149, yearly: 1490 }, "pro", ["individual"]),
  "ind-litigation": plan("ind-litigation", "التأمين القانوني", { monthly: 399, yearly: 3990 }, "max", ["individual"]),
  "lib-q1": library("lib-q1", "المكتبة القانونية — ربع سنوي", 1500, 90),
  "lib-q2": library("lib-q2", "المكتبة القانونية — نصف سنوي", 2750, 180),
  "lib-annual": library("lib-annual", "المكتبة القانونية — سنوي", 5000, 365),
  "topup-100": topup("topup-100", "شحن ١٠٠ (١٠٠ نقطة)", 100, 100, 3),
  "topup-250": topup("topup-250", "شحن ٢٥٠ (٣٠٠ نقطة)", 250, 300, 3),
  "topup-500": topup("topup-500", "شحن ٥٠٠ (٧٠٠ نقطة)", 500, 700, 6),
  "topup-1000": topup("topup-1000", "شحن ١٬٠٠٠ (١٬٥٠٠ نقطة)", 1000, 1500, 12),
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
 * sell: a page that asks for one is a bug, and the honesty tests load every
 * page that calls this.
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
