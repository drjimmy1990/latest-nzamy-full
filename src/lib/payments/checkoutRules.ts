/**
 * checkoutRules.ts — the pure half of POST /api/v1/payments/checkout (Moyasar
 * payments B1, Task 6): the request body, the callback origin, the intent
 * description, which of the buyer's earlier orders a new checkout supersedes,
 * and the response shape the checkout screen (Task 7) reads.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import type { Billing, VatMode } from "./catalog.ts";
import { isBilling } from "../pricing/priceBook.ts";
import { normalizeCouponCode } from "./couponRules.ts";

/**
 * The 410 copy: a retired item, or a retired cycle of one (lawyer-pro
 * monthly). Here, not in checkoutCore.ts, because the client checkout
 * (MoyasarCheckout.tsx) shows it too and checkoutCore.ts pulls node:crypto.
 */
export const NOT_FOR_SALE_AR = "لم يعد هذا المنتج متاحاً للشراء";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The body is `{ itemId, billing }` (+ an optional `couponCode`, P7) and
 * nothing else is read: the price is the catalog's (quote), never the
 * browser's, and the discount is the server's (couponServer). A couponCode
 * that is not a well-formed code (couponRules.normalizeCouponCode) refuses
 * the body; an empty / null one means no coupon. `couponCode` is returned
 * only when one was sent.
 */
export function parseCheckoutBody(
  body: unknown,
): { ok: true; itemId: string; billing: Billing; couponCode?: string } | { ok: false } {
  if (!isPlainObject(body)) return { ok: false };
  const { itemId, billing } = body;
  if (typeof itemId !== "string" || itemId.length === 0 || itemId.length > 64) return { ok: false };
  // monthly / quarterly / semiannual / yearly / once — whether the item is
  // sold in it is quote()'s question, answered 400 there.
  if (!isBilling(billing)) return { ok: false };
  const rawCoupon = body.couponCode;
  if (rawCoupon === undefined || rawCoupon === null || rawCoupon === "") return { ok: true, itemId, billing };
  const couponCode = normalizeCouponCode(rawCoupon);
  if (!couponCode) return { ok: false };
  return { ok: true, itemId, billing, couponCode };
}

/**
 * The origin Moyasar sends the payer back to, from NEXT_PUBLIC_SITE_URL only
 * — never the request's Host header, which a client can set. Unset or not an
 * http(s) URL → refused in both modes; live mode also needs https (test mode
 * keeps http for a local run). Only the origin is kept.
 */
export function resolveCallbackOrigin(
  raw: string | null | undefined,
  mode: "test" | "live",
): { ok: true; origin: string } | { ok: false; reason: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, reason: "NEXT_PUBLIC_SITE_URL is not set" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "NEXT_PUBLIC_SITE_URL is not an absolute URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "NEXT_PUBLIC_SITE_URL is not http(s)" };
  }
  if (mode === "live" && url.protocol !== "https:") {
    return { ok: false, reason: "NEXT_PUBLIC_SITE_URL must be https in live mode" };
  }
  return { ok: true, origin: url.origin };
}

/** `<origin>/payments/result?order=<id>` (the client re-checks the order param). */
export function callbackUrlFor(origin: string, orderId: string): string {
  return `${origin}/payments/result?order=${encodeURIComponent(orderId)}`;
}

/** The intent's description, as Moyasar shows it on the payment. */
export function intentDescription(labelAr: string): string {
  return `NEZAMY — ${labelAr}`;
}

// ── superseding the buyer's earlier orders ──────────────────────────────────

export interface SupersedeCandidateRow {
  id: string;
  item_id: string;
  status: string;
  moyasar_intent_id: string | null;
  moyasar_payment_id: string | null;
}

/**
 * How far back a checkout looks for orders to supersede: an intent lives one
 * hour from creation, after which Moyasar can no longer cancel it (nor can
 * anyone pay with it), so older orders are left as they are.
 */
export const SUPERSEDE_WINDOW_MS = 65 * 60 * 1000;

export interface SupersedeTarget {
  id: string;
  intentId: string | null;
}

/**
 * Every checkout makes a new order and a new intent (an intent lives one
 * hour, from creation). The buyer's earlier orders for the SAME item (either
 * billing) that are still open (created / initiated) and that no payment has
 * reached (no moyasar_payment_id) are superseded — so a payer who opens the
 * checkout twice does not leave a usable client secret behind.
 */
export function ordersToSupersede(
  rows: readonly SupersedeCandidateRow[] | null | undefined,
  itemId: string,
): SupersedeTarget[] {
  return (rows ?? [])
    .filter(
      (r) =>
        r.item_id === itemId &&
        (r.status === "created" || r.status === "initiated") &&
        !r.moyasar_payment_id,
    )
    .map((r) => ({ id: r.id, intentId: r.moyasar_intent_id ?? null }));
}

/**
 * Whether a superseded order may be closed ('cancelled'). Moyasar cancels an
 * intent only while it is `created` and unexpired; a FULFILLED intent (one a
 * payment was already made with — its id not yet on our order) answers 400
 * intent_not_cancelable, as does an expired one. Closing such an order would
 * strand that payment on a closed order, so it stays open and the callback,
 * the webhook or the sweep settles it. So: close only when there is no intent
 * (no client secret ever left the server) or Moyasar confirmed the cancel.
 */
export function cancelOrderAfterIntentCancel(
  target: SupersedeTarget,
  cancelResult: { ok: boolean } | null,
): boolean {
  if (target.intentId === null) return true;
  return cancelResult?.ok === true;
}

// ── the response ────────────────────────────────────────────────────────────

/**
 * What POST /api/v1/payments/checkout answers (200). Amounts are halalas.
 *
 * `orderId` MUST be passed by the browser as the payment's
 * `metadata.order_id` when it fulfils the intent (Moyasar's intent create
 * takes no metadata, so the server cannot set it): fulfilment refuses a
 * payment whose metadata.order_id does not name the order, and the sweep finds
 * an order's payment by it. The intent's callback_url already carries
 * `?order=<orderId>`.
 */
export interface CheckoutResponse {
  orderId: string;
  intentId: string;
  /** The intent's client secret — for this payer's browser only. */
  clientSecret: string;
  publishableKey: string;
  amountHalalas: number;
  /** «NEZAMY — <labelAr>», the intent's description. */
  descriptionAr: string;
  /** Plans keep the card for renewal (owner ٢٤٦); one-off items do not. */
  saveCard: boolean;
  /**
   * The charged amounts. With a coupon (P7) `net` is AFTER the discount and
   * VAT is on it; `listNet` (the book's net), `discount` and `couponCode`
   * are then present and listNet − discount = net.
   */
  quote: {
    net: number;
    vat: number;
    total: number;
    vatMode: VatMode;
    listNet?: number;
    discount?: number;
    couponCode?: string;
    /** While a launch price runs (owner ٣٠٣): the book's listed net, shown struck through; `net` is the launch price. */
    launchListNet?: number;
  };
  /**
   * The intent's callback_url, `<NEXT_PUBLIC_SITE_URL>/payments/result?order=<orderId>`
   * — the browser hands it to Moyasar.init (the form requires one) instead of
   * building its own from window.location.
   */
  callbackUrl: string;
  /** The intent's expires_at (ISO), or null when Moyasar sent none. */
  expiresAt: string | null;
}
