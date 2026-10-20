/**
 * catalog.ts — the one server-side price catalog for online payment, and the
 * VAT quote (owner answers ٢٣٩ / ٢٤٨ / ٢٤٩).
 *
 * Every amount is an integer number of halalas (1 SAR = 100 halalas). The
 * server charges what this file says, never a price sent by the browser.
 *
 * VAT is 15 %:
 *   - "exclusive" — the listed price is the net; VAT is added on top
 *     (lawyers, consultants, firms, top-ups);
 *   - "inclusive" — the listed price is what the buyer pays; VAT is inside it
 *     (individuals' plans);
 *   - "buyer"     — the library: exclusive for a business buyer
 *     (BUSINESS_USER_TYPES), inclusive for anyone else, a guest included.
 *
 * The listed prices are the ones shown in src/lib/pricing/plans.ts and
 * src/constants/pricing/*.ts; catalog.test.ts fails if they drift apart.
 *
 * Pure: no runtime imports, so `node --test` loads it directly.
 */

export type ItemKind = "plan" | "library" | "topup";
export type Billing = "monthly" | "yearly" | "once";
export type VatMode = "exclusive" | "inclusive";

/** The paid tiers a plan grants — a subset of ServerTier in src/lib/access-control.ts. */
export type ServerTierLiteral = "ai" | "pro" | "max" | "corp" | "enterprise";

export type LibraryPlanRef = "lib-q1" | "lib-q2" | "lib-annual";

/** Frozen at runtime too: this is the price authority, nothing may patch it. */
export type PayableItem = Readonly<{
  id: string;
  kind: ItemKind;
  labelAr: string;
  /** Halalas, as listed (net for exclusive VAT, gross for inclusive). */
  prices: Readonly<Partial<Record<Billing, number>>>;
  vat: VatMode | "buyer";
  tier?: ServerTierLiteral;
  libraryPlanRef?: LibraryPlanRef;
  libraryDays?: number;
  points?: number;
  pointsValidityMonths?: number;
  /** Plans renew automatically (owner ٢٤٦), so only they keep the card. */
  saveCard: boolean;
  /**
   * The `profiles.user_type` values that may buy this item online, or "any".
   * Access is gated by tier rank and same-rank purchases stack, so a plan
   * sold to the wrong audience would buy another audience's access cheaper
   * (a lawyer taking ind-preventive's `pro` for 149 instead of lawyer-pro).
   * Checkout refuses a buyer outside the list (buyerAllowed).
   */
  buyers: Readonly<string[]> | "any";
}>;

function freezeItem(item: PayableItem): PayableItem {
  Object.freeze(item.prices);
  if (Array.isArray(item.buyers)) Object.freeze(item.buyers);
  return Object.freeze(item);
}

export const VAT_PERCENT = 15;

const SAR = 100;

function plan(
  id: string,
  labelAr: string,
  monthlySar: number,
  yearlySar: number,
  tier: ServerTierLiteral,
  vat: VatMode,
  buyers: readonly string[],
): PayableItem {
  return freezeItem({
    id,
    kind: "plan",
    labelAr,
    prices: { monthly: monthlySar * SAR, yearly: yearlySar * SAR },
    vat,
    tier,
    saveCard: true,
    buyers: [...buyers],
  });
}

function library(id: LibraryPlanRef, labelAr: string, sar: number, days: number): PayableItem {
  return freezeItem({
    id,
    kind: "library",
    labelAr,
    prices: { once: sar * SAR },
    vat: "buyer",
    libraryPlanRef: id,
    libraryDays: days,
    saveCard: false,
    buyers: "any",
  });
}

function topup(id: string, labelAr: string, sar: number, points: number, months: number): PayableItem {
  return freezeItem({
    id,
    kind: "topup",
    labelAr,
    prices: { once: sar * SAR },
    vat: "exclusive",
    points,
    pointsValidityMonths: months,
    saveCard: false,
    buyers: "any",
  });
}

export const PAYABLE_ITEMS: Readonly<Record<string, PayableItem>> = Object.freeze({
  "lawyer-pro": plan("lawyer-pro", "المحامي المحترف", 399, 3990, "pro", "exclusive", ["lawyer"]),
  "consultant-independent": plan("consultant-independent", "المستشار القانوني المستقل", 399, 3990, "pro", "exclusive", ["lawyer", "provider"]),
  "firm-basic": plan("firm-basic", "مكتب المحاماة", 990, 9900, "corp", "exclusive", ["firm"]),
  "firm-enterprise": plan("firm-enterprise", "شركة المحاماة", 1490, 14900, "enterprise", "exclusive", ["firm"]),
  "ind-ai": plan("ind-ai", "الباقة الذكية", 39, 390, "ai", "inclusive", ["individual"]),
  "ind-preventive": plan("ind-preventive", "الباقة الوقائية", 149, 1490, "pro", "inclusive", ["individual"]),
  "ind-litigation": plan("ind-litigation", "التأمين القانوني", 399, 3990, "max", "inclusive", ["individual"]),
  "lib-q1": library("lib-q1", "المكتبة القانونية — ربع سنوي", 1500, 90),
  "lib-q2": library("lib-q2", "المكتبة القانونية — نصف سنوي", 2750, 180),
  "lib-annual": library("lib-annual", "المكتبة القانونية — سنوي", 5000, 365),
  "topup-100": topup("topup-100", "شحن ١٠٠ (١٠٠ نقطة)", 100, 100, 3),
  "topup-250": topup("topup-250", "شحن ٢٥٠ (٣٠٠ نقطة)", 250, 300, 3),
  "topup-500": topup("topup-500", "شحن ٥٠٠ (٧٠٠ نقطة)", 500, 700, 6),
  "topup-1000": topup("topup-1000", "شحن ١٬٠٠٠ (١٬٥٠٠ نقطة)", 1000, 1500, 12),
});

/**
 * `profiles.user_type` values that buy the library VAT-exclusive (owner ٢٤٨:
 * establishments pay VAT on top). `micro` accounts are small establishments.
 */
export const BUSINESS_USER_TYPES = [
  "lawyer",
  "provider",
  "firm",
  "corporate",
  "business",
  "government",
  "ngo",
  "micro",
] as const;

export type QuoteResult =
  | {
      ok: true;
      item: PayableItem;
      vatMode: VatMode;
      netHalalas: number;
      vatHalalas: number;
      totalHalalas: number;
    }
  | { ok: false; error: "unknown_item" | "billing_not_offered" };

function isBusinessBuyer(userType: string | null): boolean {
  return userType !== null && (BUSINESS_USER_TYPES as readonly string[]).includes(userType);
}

export function quote(itemId: string, billing: Billing, buyerUserType: string | null): QuoteResult {
  if (!Object.hasOwn(PAYABLE_ITEMS, itemId)) return { ok: false, error: "unknown_item" };
  const item = PAYABLE_ITEMS[itemId];
  const listed = Object.hasOwn(item.prices, billing) ? item.prices[billing] : undefined;
  if (listed === undefined) return { ok: false, error: "billing_not_offered" };

  const vatMode: VatMode =
    item.vat === "buyer" ? (isBusinessBuyer(buyerUserType) ? "exclusive" : "inclusive") : item.vat;

  if (vatMode === "exclusive") {
    const netHalalas = listed;
    const vatHalalas = Math.round((netHalalas * VAT_PERCENT) / 100);
    return { ok: true, item, vatMode, netHalalas, vatHalalas, totalHalalas: netHalalas + vatHalalas };
  }
  const totalHalalas = listed;
  const netHalalas = Math.round((totalHalalas * 100) / (100 + VAT_PERCENT));
  return { ok: true, item, vatMode, netHalalas, vatHalalas: totalHalalas - netHalalas, totalHalalas };
}

/**
 * True when an account of `userType` may buy `item` online. "any" items
 * (library, top-ups) are open to every signed-in account; a plan only to its
 * listed audience. An unknown or missing user type buys only "any" items.
 */
export function buyerAllowed(item: Pick<PayableItem, "buyers">, userType: string | null | undefined): boolean {
  if (item.buyers === "any") return true;
  return typeof userType === "string" && item.buyers.includes(userType);
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toArabicDigits(latin: string): string {
  return latin.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

/**
 * Halalas as Arabic text: 45885 → «٤٥٨٫٨٥ ر.س», 39900 → «٣٩٩ ر.س»,
 * 399000 → «٣٬٩٩٠ ر.س». Built by hand rather than with Intl, whose Arabic
 * output (bidi marks, separators) varies between ICU versions.
 *
 * Money is a non-negative integer of halalas; anything else is a bug upstream,
 * so it throws a RangeError rather than rounding it away.
 */
export function formatHalalas(h: number): string {
  if (!Number.isSafeInteger(h) || h < 0) {
    throw new RangeError(`formatHalalas: expected a non-negative integer of halalas, got ${h}`);
  }
  const sar = Math.floor(h / SAR);
  const halalas = h % SAR;
  const grouped = String(sar).replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  const fraction = halalas === 0 ? "" : `٫${String(halalas).padStart(2, "0")}`;
  return `${toArabicDigits(grouped + fraction)} ر.س`;
}
