/**
 * checkoutView.ts — the pure half of the /checkout screen and of the buy
 * buttons that lead to it (Moyasar payments B1, Task 7).
 *
 *   - checkoutHref: where a buy button goes. A signed-in buyer with the
 *     Moyasar gateway on goes to /checkout for an item PAYABLE_ITEMS sells;
 *     otherwise null, and the button keeps today's request flow (owner ٢٤٦).
 *   - what the screen says about an item: the VAT sentence, the points and
 *     their validity for a top-up, the library's access length, and the
 *     ind-litigation coverage sentence. Firm plans promise no seats.
 *   - moyasarInitConfig: the Moyasar.init config. The intent is created by
 *     POST /api/v1/payments/checkout (src/lib/payments/checkoutCore.ts);
 *     on_initiating hands Moyasar that intent AND the order id as the
 *     payment's metadata.order_id — without it fulfilment rejects the payment
 *     as order_mismatch.
 *
 * Pure: relative imports only, so `node --test` loads it
 * (checkoutView.test.ts).
 */

import { PAYABLE_ITEMS, quote, type Billing, type PayableItem, type VatMode } from "./catalog.ts";
import type { CheckoutResponse } from "./checkoutRules.ts";
import { VAT_NOTICE } from "../pricing/vatNotice.ts";

// ── the buy buttons ─────────────────────────────────────────────────────────

/**
 * The billing an item is bought with from a /pricing toggle value: plans keep
 * monthly / yearly; top-ups and library plans are a single payment ("once")
 * whatever the toggle says. Null when the item offers nothing that fits.
 */
export function checkoutBillingFor(item: Pick<PayableItem, "prices">, billing: Billing): Billing | null {
  if (Object.hasOwn(item.prices, billing)) return billing;
  if (billing !== "once" && Object.hasOwn(item.prices, "once")) return "once";
  return null;
}

/**
 * `/checkout?item=<id>&billing=<b>` for a signed-in buyer while the gateway is
 * on, for an item sold online; null keeps the existing request flow (guests,
 * gateway off, and every plan that is not in PAYABLE_ITEMS — /contact CTAs,
 * the firm library, provider tiers…).
 */
export function checkoutHref(
  planId: string,
  billing: Billing,
  gatewayEnabled: boolean,
  signedIn: boolean,
): string | null {
  if (!gatewayEnabled || !signedIn) return null;
  if (!Object.hasOwn(PAYABLE_ITEMS, planId)) return null;
  const chosen = checkoutBillingFor(PAYABLE_ITEMS[planId], billing);
  if (!chosen) return null;
  return `/checkout?item=${encodeURIComponent(planId)}&billing=${chosen}`;
}

/**
 * GET /api/v1/payments/status as usePaymentsStatus returns it. Only the
 * Moyasar provider can take a checkout: the stub gateway (local / staging)
 * reports disabled:false, but POST /api/v1/payments/checkout answers 503 for
 * it. While the status is still loading the gateway counts as off.
 */
export function gatewayAllowsCheckout(status: {
  disabled: boolean;
  provider: string | null;
  loading?: boolean;
}): boolean {
  return status.loading !== true && status.disabled === false && status.provider === "moyasar";
}

export type BuyAction = { kind: "checkout"; href: string } | { kind: "wait" } | { kind: "request" };

/**
 * What a signed-in buy button does: "checkout" → /checkout; "request" →
 * today's entitlement request; "wait" → nothing yet, because the item is sold
 * online but the gateway status has not loaded — a click then must not file a
 * request the payer did not mean (it would be a request instead of a payment).
 * Items not sold online never wait: the gateway does not concern them.
 */
export function buyButtonAction(
  planId: string,
  billing: Billing,
  status: { disabled: boolean; provider: string | null; loading?: boolean },
  signedIn: boolean,
): BuyAction {
  if (!signedIn || checkoutHref(planId, billing, true, true) === null) return { kind: "request" };
  if (status.loading === true) return { kind: "wait" };
  const href = checkoutHref(planId, billing, gatewayAllowsCheckout(status), signedIn);
  return href ? { kind: "checkout", href } : { kind: "request" };
}

// ── the query string ────────────────────────────────────────────────────────

const BILLINGS: ReadonlySet<string> = new Set<Billing>(["monthly", "yearly", "once"]);

function first(v: string | readonly string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.length > 0 && s.length <= 64 ? s : null;
}

/** `?item=&billing=` of /checkout: an item PAYABLE_ITEMS sells, with a billing it offers. */
export function parseCheckoutQuery(
  item: string | readonly string[] | undefined,
  billing: string | readonly string[] | undefined,
): { ok: true; itemId: string; billing: Billing } | { ok: false } {
  const itemId = first(item);
  const b = first(billing);
  if (!itemId || !b || !BILLINGS.has(b)) return { ok: false };
  if (!Object.hasOwn(PAYABLE_ITEMS, itemId)) return { ok: false };
  if (!Object.hasOwn(PAYABLE_ITEMS[itemId].prices, b)) return { ok: false };
  return { ok: true, itemId, billing: b as Billing };
}

// ── what the screen says ────────────────────────────────────────────────────

/** Verbatim (Task 7 brief): ind-litigation covers the main subscriber only. */
export const LITIGATION_COVERAGE_AR = "تغطية المشترك الرئيسي؛ تُضاف التغطية العائلية بطلب يراجعه الفريق";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** 1500 → «١٬٥٠٠» */
function arabicNumber(n: number): string {
  return String(n)
    .replace(/\B(?=(\d{3})+(?!\d))/g, "٬")
    .replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

/** 3 → «٣ أشهر», 12 → «١٢ شهراً» (the wording of the top-up cards). */
function monthsAr(n: number): string {
  if (n === 1) return "شهر واحد";
  if (n === 2) return "شهران";
  return n <= 10 ? `${arabicNumber(n)} أشهر` : `${arabicNumber(n)} شهراً`;
}

/** 90 → «٩٠ يوماً», 7 → «٧ أيام» */
function daysAr(n: number): string {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  return n <= 10 ? `${arabicNumber(n)} أيام` : `${arabicNumber(n)} يوماً`;
}

/** 100 → «١٠٠ نقطة», 5 → «٥ نقاط» */
function pointsAr(n: number): string {
  if (n === 1) return "نقطة واحدة";
  if (n === 2) return "نقطتان";
  return n <= 10 ? `${arabicNumber(n)} نقاط` : `${arabicNumber(n)} نقطة`;
}

/**
 * The lines the screen shows under the item's name: what the catalog grants
 * and nothing more. Firm plans get no line — their seats are not sold here.
 */
export function checkoutItemNotes(item: PayableItem): string[] {
  if (item.id === "ind-litigation") return [LITIGATION_COVERAGE_AR];
  if (item.kind === "topup") {
    const notes: string[] = [];
    // The label already names the points («شحن ٢٥٠ (٣٠٠ نقطة)»): no second line.
    if (typeof item.points === "number" && !item.labelAr.includes(pointsAr(item.points))) {
      notes.push(pointsAr(item.points));
    }
    if (typeof item.pointsValidityMonths === "number") {
      notes.push(`صالحة ${monthsAr(item.pointsValidityMonths)} من تاريخ الشراء`);
    }
    return notes;
  }
  if (item.kind === "library" && typeof item.libraryDays === "number") {
    return [`وصول إلى المكتبة القانونية لمدة ${daysAr(item.libraryDays)}`];
  }
  return [];
}

/** «اشتراك شهري» / «اشتراك سنوي» / «دفعة واحدة» */
export function billingLabelAr(billing: Billing): string {
  if (billing === "monthly") return "اشتراك شهري";
  if (billing === "yearly") return "اشتراك سنوي";
  return "دفعة واحدة";
}

/**
 * The VAT sentence beside the listed price, before the server has quoted.
 * The library's mode depends on the buyer: with the buyer's account type the
 * sentence is the one the server will charge; without it, both rules.
 */
export function listedVatNotice(item: PayableItem, buyerUserType: string | null): string {
  if (item.vat === "buyer") {
    if (buyerUserType === null) return VAT_NOTICE.library.ar;
    const listed = Object.keys(item.prices)[0] as Billing | undefined;
    const q = listed ? quote(item.id, listed, buyerUserType) : null;
    return q && q.ok ? quoteVatNotice(q.vatMode) : VAT_NOTICE.library.ar;
  }
  return quoteVatNotice(item.vat);
}

/** The VAT sentence for the mode POST /api/v1/payments/checkout quoted. */
export function quoteVatNotice(mode: VatMode): string {
  return mode === "exclusive" ? VAT_NOTICE.exclusive.ar : VAT_NOTICE.inclusive.ar;
}

// ── the checkout answer ─────────────────────────────────────────────────────

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * A 200 body of POST /api/v1/payments/checkout, checked before the form is
 * built from it; anything malformed is null (the screen says the payment
 * could not start). Moyasar refuses amounts under 100 halalas. The callback
 * URL must be the server's http(s) result URL for this very order.
 */
export function parseCheckoutResponse(body: unknown): CheckoutResponse | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const q = b.quote as Record<string, unknown> | null | undefined;
  if (!isText(b.orderId) || !isText(b.intentId) || !isText(b.clientSecret)) return null;
  if (!isText(b.publishableKey) || !/^pk_(test|live)_/.test(b.publishableKey)) return null;
  if (!isInt(b.amountHalalas) || b.amountHalalas < 100 || !isText(b.descriptionAr)) return null;
  if (typeof b.saveCard !== "boolean") return null;
  if (typeof q !== "object" || q === null || !isInt(q.net) || !isInt(q.vat) || !isInt(q.total)) return null;
  if (q.vatMode !== "exclusive" && q.vatMode !== "inclusive") return null;
  if (q.total !== b.amountHalalas) return null;
  if (!isText(b.callbackUrl) || !/^https?:\/\/[^/?#]+\/payments\/result\?order=/.test(b.callbackUrl)) return null;
  if (!b.callbackUrl.endsWith(`?order=${encodeURIComponent(b.orderId)}`)) return null;
  const expiresAt = b.expiresAt === undefined || b.expiresAt === null ? null : b.expiresAt;
  if (expiresAt !== null && !isText(expiresAt)) return null;
  return {
    orderId: b.orderId,
    intentId: b.intentId,
    clientSecret: b.clientSecret,
    publishableKey: b.publishableKey,
    amountHalalas: b.amountHalalas,
    descriptionAr: b.descriptionAr,
    saveCard: b.saveCard,
    quote: { net: q.net, vat: q.vat, total: q.total, vatMode: q.vatMode },
    callbackUrl: b.callbackUrl,
    expiresAt,
  };
}

// ── the held intent ─────────────────────────────────────────────────────────

/**
 * An intent lives one hour from creation (checkoutRules.ts). Without an
 * expires_at, a payer who presses pay later than this after «متابعة الدفع»
 * gets a new intent first.
 */
export const INTENT_REFRESH_MS = 50 * 60 * 1000;

/** With an expires_at, the intent is replaced this long before it lapses. */
export const INTENT_EXPIRY_MARGIN_MS = 10 * 60 * 1000;

/**
 * True when the held intent must be replaced before paying: within
 * INTENT_EXPIRY_MARGIN_MS of its expires_at, or — when Moyasar sent none or
 * an unreadable one — INTENT_REFRESH_MS after it was received.
 */
export function intentNeedsRefresh(
  resp: Pick<CheckoutResponse, "expiresAt">,
  receivedAt: number,
  now: number,
): boolean {
  const expires = resp.expiresAt ? Date.parse(resp.expiresAt) : Number.NaN;
  if (Number.isFinite(expires)) return now >= expires - INTENT_EXPIRY_MARGIN_MS;
  return now - receivedAt >= INTENT_REFRESH_MS;
}

/**
 * After a refresh: "proceed" pays with the new intent when it charges exactly
 * what the payer was shown; "confirm" stops the payment so the screen shows
 * the new figures first (a price or VAT rule changed in between).
 */
export function refreshDecision(
  shown: Pick<CheckoutResponse, "amountHalalas" | "quote">,
  fresh: Pick<CheckoutResponse, "amountHalalas" | "quote">,
): "proceed" | "confirm" {
  const same =
    shown.amountHalalas === fresh.amountHalalas &&
    shown.quote.net === fresh.quote.net &&
    shown.quote.vat === fresh.quote.vat &&
    shown.quote.total === fresh.quote.total &&
    shown.quote.vatMode === fresh.quote.vatMode;
  return same ? "proceed" : "confirm";
}

/**
 * True for every report the Moyasar form passes to on_failure: the next
 * attempt needs a new checkout (order + intent). Moyasar documents on_failure
 * as receiving a STRING message, and the form also passes objects (a failed
 * payment, since a declined card consumes the intent; Moyasar's
 * intent_not_fulfillable; an API or network error). The shape cannot reliably
 * tell a used-up intent apart, so any on_failure call drops the held intent
 * (B1 final review); the server supersedes the earlier order.
 */
export function needsNewCheckout(reported: unknown): boolean {
  void reported;
  return true;
}

// ── the Moyasar form ────────────────────────────────────────────────────────

export type MoyasarMethod = "creditcard" | "applepay";

/**
 * Apple Pay only with a publishable key AND NEXT_PUBLIC_APPLE_PAY_ENABLED set
 * to exactly "true" (the domain must be registered with Moyasar first).
 */
export function moyasarMethods(publishableKey: string, applePayFlag: string | undefined): MoyasarMethod[] {
  return publishableKey && applePayFlag === "true" ? ["creditcard", "applepay"] : ["creditcard"];
}

/** What on_initiating returns: only keys Moyasar lets it change. */
export interface InitiatingResult {
  payment_intent: { id: string; client_secret: string };
  amount: number;
  metadata: { order_id: string };
  callback_url: string;
}

export function initiatingResult(resp: CheckoutResponse): InitiatingResult {
  return {
    payment_intent: { id: resp.intentId, client_secret: resp.clientSecret },
    amount: resp.amountHalalas,
    metadata: { order_id: resp.orderId },
    callback_url: resp.callbackUrl,
  };
}

export interface MoyasarInitConfig {
  element: string;
  amount: number;
  currency: "SAR";
  description: string;
  publishable_api_key: string;
  callback_url: string;
  metadata: { order_id: string };
  methods: MoyasarMethod[];
  supported_networks: ("mada" | "visa" | "mastercard")[];
  language: "ar";
  use_payment_intent: true;
  on_initiating: () => Promise<InitiatingResult | false>;
  on_failure: (reported: unknown) => Promise<void>;
  credit_card: { save_card: boolean };
  apple_pay: { country: "SA"; label: "NEZAMY"; validate_merchant_url: string };
}

/**
 * The Moyasar.init config for one checkout response.
 *
 * `callback_url` is the server's (resp.callbackUrl, built from
 * NEXT_PUBLIC_SITE_URL — the intent's own); the form requires one although
 * Moyasar uses the intent's. `initiate` returns the intent to pay with — the
 * one held, or a new one near expiry — or null, which makes on_initiating
 * answer false (no payment). `onNeedsNewCheckout` runs on every on_failure
 * report, a string message or an object (needsNewCheckout).
 *
 * moyasar-payment-form 2.3.0 accepts on_initiating / on_failure only as async
 * functions (it checks the constructor name), so both are `async`.
 *
 * metadata.order_id is set twice on purpose: the form builds the fulfil body
 * as {amount, currency, description, publishable_api_key, metadata (from
 * init)} overlaid with the data and then with on_initiating's result, so the
 * init value is the floor and on_initiating's (which names a refreshed order)
 * wins.
 */
export function moyasarInitConfig(
  resp: CheckoutResponse,
  opts: {
    element: string;
    applePayFlag: string | undefined;
    initiate: () => Promise<CheckoutResponse | null>;
    onNeedsNewCheckout: () => void;
  },
): MoyasarInitConfig {
  return {
    element: opts.element,
    amount: resp.amountHalalas,
    currency: "SAR",
    description: resp.descriptionAr,
    publishable_api_key: resp.publishableKey,
    callback_url: resp.callbackUrl,
    metadata: { order_id: resp.orderId },
    methods: moyasarMethods(resp.publishableKey, opts.applePayFlag),
    supported_networks: ["mada", "visa", "mastercard"],
    language: "ar",
    use_payment_intent: true,
    on_initiating: async () => {
      const current = await opts.initiate();
      if (!current) return false;
      return initiatingResult(current);
    },
    on_failure: async (reported: unknown) => {
      if (needsNewCheckout(reported)) opts.onNeedsNewCheckout();
    },
    credit_card: { save_card: resp.saveCard },
    apple_pay: {
      country: "SA",
      label: "NEZAMY",
      validate_merchant_url: "https://api.moyasar.com/v1/applepay/initiate",
    },
  };
}
