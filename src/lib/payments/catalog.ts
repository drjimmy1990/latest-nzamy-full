/**
 * catalog.ts — what checkout charges, in halalas, derived from the one price
 * book (src/lib/pricing/priceBook.ts), and the VAT quote.
 *
 * Every amount is an integer number of halalas (1 SAR = 100 halalas). The
 * server charges what the book says, never a price sent by the browser. No
 * number lives here: catalog.test.ts holds every item to its book entry.
 *
 * VAT is 15 %, always on top (pricing doc §2 rule 5, answer ٢٥٨ — it replaces
 * the inclusive individuals' plans and the buyer-dependent library of ٢٤٨):
 * the listed price is the net, VAT is added at checkout and on the receipt.
 * `VatMode` keeps "inclusive" only because orders paid before ٢٥٨ carry it in
 * payment_orders.vat_mode; nothing sold today is quoted inclusive.
 *
 * Two views of the same items (retire, never delete):
 *   - PAYABLE_ITEMS — RESOLVE: every book entry, retired ones included.
 *     Fulfilment, receipts, labels, refunds and admin views look items up
 *     here, because orders and subscriptions keep pointing at retired ids.
 *   - sellableItem() / quote() — SELL: only what is on sale, in the billings
 *     still sold. Checkout and every buy link go through these.
 *
 * Pure: relative imports only, so `node --test` loads it directly.
 */

import {
  PRICE_BOOK,
  BILLINGS,
  isOnSale,
  offeredBillings,
  type Billing,
  type BookEntry,
  type BookItemKind,
  type LibraryPlanRef,
  type ServerTierLiteral,
} from "../pricing/priceBook.ts";

export type { Billing, LibraryPlanRef, ServerTierLiteral };
export type ItemKind = BookItemKind;
export type VatMode = "exclusive" | "inclusive";

/** Frozen at runtime too: this is the price authority, nothing may patch it. */
export type PayableItem = Readonly<{
  id: string;
  kind: ItemKind;
  labelAr: string;
  /** Halalas before VAT, for the billings SOLD today (retired cycles left out). */
  prices: Readonly<Partial<Record<Billing, number>>>;
  /** Halalas before VAT for every billing the book lists, retired ones included (renewal lookup, admin). */
  listedPrices: Readonly<Partial<Record<Billing, number>>>;
  /** False for a retired or coming-soon entry: resolvable, never sold. */
  onSale: boolean;
  tier?: ServerTierLiteral;
  libraryPlanRef?: LibraryPlanRef;
  libraryDays?: number;
  points?: number;
  pointsValidityMonths?: number;
  /** Plans renew automatically (owner ٢٤٦), so only they keep the card. */
  saveCard: boolean;
  /**
   * The `profiles.user_type` values that may buy this item online, or "any".
   * Checkout refuses a buyer outside the list (buyerAllowed).
   */
  buyers: Readonly<string[]> | "any";
}>;

export const VAT_PERCENT = 15;

const SAR = 100;

function toPayable(entry: BookEntry): PayableItem {
  const sold = new Set<Billing>(offeredBillings(entry));
  const prices: Partial<Record<Billing, number>> = {};
  const listedPrices: Partial<Record<Billing, number>> = {};
  for (const b of BILLINGS) {
    const p = Object.hasOwn(entry.prices, b) ? entry.prices[b] : undefined;
    if (!p) continue;
    listedPrices[b] = p.sar * SAR;
    if (sold.has(b)) prices[b] = p.sar * SAR;
  }
  const item: PayableItem = {
    id: entry.id,
    kind: entry.kind,
    labelAr: entry.labelAr,
    prices: Object.freeze(prices),
    listedPrices: Object.freeze(listedPrices),
    onSale: isOnSale(entry),
    ...(entry.tier ? { tier: entry.tier } : {}),
    ...(entry.libraryPlanRef ? { libraryPlanRef: entry.libraryPlanRef } : {}),
    ...(entry.libraryDays !== undefined ? { libraryDays: entry.libraryDays } : {}),
    ...(entry.points !== undefined ? { points: entry.points } : {}),
    ...(entry.pointsValidityMonths !== undefined ? { pointsValidityMonths: entry.pointsValidityMonths } : {}),
    saveCard: entry.kind === "plan",
    buyers: entry.buyers === "any" ? "any" : Object.freeze([...entry.buyers]),
  };
  return Object.freeze(item);
}

/** The halala catalogue of a book (tests build one from a fixture book). */
export function buildCatalog(book: Readonly<Record<string, BookEntry>>): Readonly<Record<string, PayableItem>> {
  const out: Record<string, PayableItem> = {};
  for (const [id, entry] of Object.entries(book)) out[id] = toPayable(entry);
  return Object.freeze(out);
}

/** RESOLVE: every item the book knows, retired ones included. */
export const PAYABLE_ITEMS: Readonly<Record<string, PayableItem>> = buildCatalog(PRICE_BOOK);

/** The item for an id, retired included, or undefined (never an inherited key). */
export function resolveItem(
  id: string,
  catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS,
): PayableItem | undefined {
  return Object.hasOwn(catalog, id) ? catalog[id] : undefined;
}

/** SELL: the item for an id only while it is on sale, or undefined. */
export function sellableItem(
  id: string,
  catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS,
): PayableItem | undefined {
  const item = resolveItem(id, catalog);
  return item && item.onSale ? item : undefined;
}

export type QuoteResult =
  | {
      ok: true;
      item: PayableItem;
      vatMode: VatMode;
      netHalalas: number;
      vatHalalas: number;
      totalHalalas: number;
    }
  | { ok: false; error: "unknown_item" | "not_for_sale" | "billing_not_offered" };

/**
 * The price of selling `itemId` in `billing` now: VAT-exclusive, 15 % on top.
 * A retired or coming-soon item, or a RETIRED cycle of an item still on sale
 * (listed, no longer sold — lawyer-pro monthly), is `not_for_sale` (checkout
 * 410); a billing the book never listed for it is `billing_not_offered` (400).
 */
export function quote(
  itemId: string,
  billing: Billing,
  catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS,
): QuoteResult {
  const item = resolveItem(itemId, catalog);
  if (!item) return { ok: false, error: "unknown_item" };
  if (!item.onSale) return { ok: false, error: "not_for_sale" };
  const netHalalas = Object.hasOwn(item.prices, billing) ? item.prices[billing] : undefined;
  if (netHalalas === undefined) {
    const listed = Object.hasOwn(item.listedPrices, billing);
    return { ok: false, error: listed ? "not_for_sale" : "billing_not_offered" };
  }
  const vatHalalas = Math.round((netHalalas * VAT_PERCENT) / 100);
  return { ok: true, item, vatMode: "exclusive", netHalalas, vatHalalas, totalHalalas: netHalalas + vatHalalas };
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
