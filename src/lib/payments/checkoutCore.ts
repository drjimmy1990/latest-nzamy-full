/**
 * checkoutCore.ts — the steps of POST /api/v1/payments/checkout after the
 * session, the body, the gateway switch and the callback origin have been
 * checked (Moyasar payments B1, Task 6, fix round 1). The route
 * (src/app/api/v1/payments/checkout/route.ts) builds the clients and calls
 * startCheckoutWith; the tests drive it with a fake service client and a fake
 * Moyasar client.
 *
 *   1. profiles.user_type through the service role. A read error OR a missing
 *      row → 503: the type decides who may buy (buyerAllowed), and a guess
 *      could sell a plan to the wrong audience.
 *   2. buyerAllowed(item, userType) BEFORE quoting → 403
 *      «هذه الباقة غير متاحة لنوع حسابك». Access is gated by tier rank and
 *      same-rank purchases stack, so a plan sold outside its audience would
 *      buy that audience's access cheaper.
 *   3. quote(itemId, billing) — the price book's price, VAT-exclusive (٢٥٨),
 *      never the browser's. Unknown item, or a billing the book never listed
 *      for it → 400; a retired item, or a retired cycle of one (lawyer-pro
 *      monthly — still resolvable for old orders, never sold) → 410
 *      «لم يعد هذا المنتج متاحاً للشراء».
 *   3b. A coupon code, when sent (P7, couponServer.priceWithCoupon): applied
 *      to the quote's net before VAT, VAT recomputed on the discounted net.
 *      Refused (unknown / used / below the minimum / not for this item) →
 *      400 with the Arabic reason, nothing written; coupons not available
 *      yet (20261026_20 not run) or unreadable → 503 — never the full price
 *      to a buyer who expected a discount. The order stores the DISCOUNTED
 *      net / VAT / total and metadata.coupon {id, code, discount_halalas,
 *      list_net_halalas}; the intent charges that total, so fulfilment's
 *      paid-vs-stored check and refunds need nothing new.
 *      The buyer's OTHER open orders carrying the same code (P7 review,
 *      finding 1; couponServer.priceWithCoupon): a payable one for another
 *      item, or one a payment reached → 400 «هذا الكود مستخدم في طلب آخر قيد
 *      الدفع — أكمل ذلك الطلب أو ألغِه»; one whose intent expired is closed
 *      here once Moyasar lists no payment for it beyond a failed one (503 when
 *      Moyasar cannot be asked). The database backstop
 *      payment_orders_coupon_once_key (20261026_20) turns a race between two
 *      tabs into the same 400 at step 5.
 *      Coupon tries are budgeted per buyer (couponAttempts.ts, finding 4):
 *      a spent budget answers 429 before anything is read, and every coupon
 *      refusal here spends one try — the same budget as the preview route.
 *   4. The buyer's earlier open orders for the same item that no payment has
 *      reached (last SUPERSEDE_WINDOW_MS): the intent is cancelled at Moyasar
 *      first and the order closed only when that worked, or when it never had
 *      an intent (checkoutRules.ts says why). Best-effort.
 *   5. A new payment_orders row: status 'created', the quote's amounts,
 *      metadata {user_email} (user_id is set null if the account is deleted).
 *   6. The intent: the quote's total, «NEZAMY — <labelAr>», callback
 *      <origin>/payments/result?order=<id>. Refused → the order is closed, 503.
 *   7. The stamp: moyasar_intent_id + 'initiated', only while still 'created',
 *      returning the row. Zero rows (a concurrent checkout of the same item
 *      superseded it meanwhile) or an error → the intent is cancelled, the
 *      order closed, 503 — the client secret never goes out for a closed
 *      order.
 *   8. 200 CheckoutResponse, with the intent's callback URL and expiry.
 * A missing B1 table (isMissingPaymentsObject) → 503 with the Arabic copy,
 * logged once; never 500.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test`
 * loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoyasarClient } from "./moyasarClient.ts";
import { buyerAllowed, PAYABLE_ITEMS, quote, resolveItem, type Billing, type PayableItem } from "./catalog.ts";
import { isMissingPaymentsObject } from "./fulfillDecision.ts";
import { MOYASAR_DISABLED_MESSAGE_AR } from "./moyasarConfig.ts";
import { COUPON_PENDING_AR, isCouponOrderConflict, priceWithCoupon } from "./couponServer.ts";
import { COUPON_ATTEMPTS, RATE_LIMITED_AR, type CouponAttemptBudget } from "./couponAttempts.ts";
import type { BookEntry } from "../pricing/priceBook.ts";
import {
  callbackUrlFor,
  cancelOrderAfterIntentCancel,
  intentDescription,
  NOT_FOR_SALE_AR,
  ordersToSupersede,
  SUPERSEDE_WINDOW_MS,
  type CheckoutResponse,
  type SupersedeCandidateRow,
} from "./checkoutRules.ts";

export const CHECKOUT_FAILED_AR = "تعذّر بدء عملية الدفع، حاول مرة أخرى بعد قليل";
export const AUDIENCE_REFUSED_AR = "هذه الباقة غير متاحة لنوع حسابك";
export const UNKNOWN_ITEM_AR = "هذا المنتج غير متاح للدفع الإلكتروني";
export const BILLING_NOT_OFFERED_AR = "مدة الاشتراك هذه غير متاحة لهذا المنتج";
export { NOT_FOR_SALE_AR };

export interface CheckoutDeps {
  admin: SupabaseClient;
  client: Pick<MoyasarClient, "createIntent" | "cancelIntent" | "listPaymentsByOrder">;
  /** The per-buyer coupon try budget (couponAttempts.ts); the shared one unless a test passes its own. */
  attempts?: CouponAttemptBudget;
  /** The clock (tests pin it). */
  now?: () => Date;
  /** The halala catalogue; PAYABLE_ITEMS unless a test passes a fixture (e.g. a retired item). */
  catalog?: Readonly<Record<string, PayableItem>>;
  /** The price book behind the catalogue (the "already discounted" check); PRICE_BOOK unless a test passes one. */
  book?: Readonly<Record<string, BookEntry>>;
}

export interface CheckoutInput {
  user: { id: string; email?: string | null };
  itemId: string;
  billing: Billing;
  /** resolveCallbackOrigin(NEXT_PUBLIC_SITE_URL, mode).origin */
  origin: string;
  publishableKey: string;
  /** A normalised coupon code (parseCheckoutBody), or null / absent for none. */
  couponCode?: string | null;
}

export type CheckoutReply =
  | { status: 200; body: CheckoutResponse }
  | { status: 400 | 403 | 410 | 429 | 503; body: { error: string } };

const OPEN = ["created", "initiated"];

const missingLogged = new Set<string>();

function logMissingOnce(step: string, code: string | undefined): void {
  if (missingLogged.has(step)) return;
  missingLogged.add(step);
  console.warn(`[payments/checkout] ${step}: a B1 migration is not applied yet (${code ?? "?"}); answering 503`);
}

const fail = (status: 400 | 403 | 410 | 429 | 503, error: string): CheckoutReply => ({ status, body: { error } });

/** Step 4 — best-effort: a failure here never blocks the new checkout. */
async function supersedeEarlierOrders(
  deps: CheckoutDeps,
  userId: string,
  itemId: string,
): Promise<{ missing: boolean; code?: string }> {
  const { admin, client } = deps;
  const since = new Date((deps.now?.() ?? new Date()).getTime() - SUPERSEDE_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from("payment_orders")
    .select("id, item_id, status, moyasar_intent_id, moyasar_payment_id")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .in("status", OPEN)
    .is("moyasar_payment_id", null)
    .gt("created_at", since)
    .limit(10);
  if (error) return { missing: isMissingPaymentsObject(error.code), code: error.code };

  const targets = ordersToSupersede(data as SupersedeCandidateRow[] | null, itemId);
  await Promise.all(
    targets.map(async (target) => {
      const cancelled = target.intentId ? await client.cancelIntent(target.intentId) : null;
      if (!cancelOrderAfterIntentCancel(target, cancelled)) return;
      const { error: closeErr } = await admin
        .from("payment_orders")
        .update({ status: "cancelled" })
        .eq("id", target.id)
        .eq("user_id", userId)
        .in("status", OPEN)
        .is("moyasar_payment_id", null);
      if (closeErr) console.warn("[payments/checkout] closing a superseded order failed:", target.id, closeErr.code);
    }),
  );
  return { missing: false };
}

export async function startCheckoutWith(deps: CheckoutDeps, input: CheckoutInput): Promise<CheckoutReply> {
  const { admin, client } = deps;
  const { user } = input;
  const attempts = deps.attempts ?? COUPON_ATTEMPTS;

  // 0. a buyer who spent his coupon tries is answered before any read
  if (input.couponCode && !attempts.check(user.id).ok) return fail(429, RATE_LIMITED_AR);

  // 1. the buyer's account type
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) {
    console.error("[payments/checkout] reading the buyer's profile failed:", profileErr.code);
    return fail(503, CHECKOUT_FAILED_AR);
  }
  if (!profile) {
    console.error("[payments/checkout] the buyer has no profile row:", user.id);
    return fail(503, CHECKOUT_FAILED_AR);
  }
  const rawType = (profile as { user_type?: unknown }).user_type;
  const userType = typeof rawType === "string" ? rawType : null;

  // 2. the audience, before any price
  const catalog = deps.catalog ?? PAYABLE_ITEMS;
  const known = resolveItem(input.itemId, catalog);
  if (!known) return fail(400, UNKNOWN_ITEM_AR);
  if (!buyerAllowed(known, userType)) return fail(403, AUDIENCE_REFUSED_AR);

  // 3. the price — on the request's clock, so a launch price (owner ٣٠٣) is
  // charged while its campaign runs and never after
  const now = deps.now?.() ?? new Date();
  const q = quote(input.itemId, input.billing, catalog, now);
  if (!q.ok) {
    if (q.error === "not_for_sale") return fail(410, NOT_FOR_SALE_AR);
    return fail(400, q.error === "unknown_item" ? UNKNOWN_ITEM_AR : BILLING_NOT_OFFERED_AR);
  }

  // 3b. the coupon, on the net before VAT
  let net = q.netHalalas;
  let vat = q.vatHalalas;
  let total = q.totalHalalas;
  let couponMeta: Record<string, unknown> | null = null;
  let couponQuote: { listNet: number; discount: number; couponCode: string } | null = null;
  if (input.couponCode) {
    const priced = await priceWithCoupon(admin, {
      code: input.couponCode,
      userId: user.id,
      userType,
      item: q.item,
      billing: input.billing,
      netHalalas: q.netHalalas,
      now,
      book: deps.book,
      gateway: client,
    });
    if (!priced.ok) {
      if (priced.status === 400) attempts.spend(user.id);
      return fail(priced.status, priced.error);
    }
    ({ netHalalas: net, vatHalalas: vat, totalHalalas: total } = priced.quote);
    couponMeta = {
      id: priced.coupon.id,
      code: priced.coupon.code,
      discount_halalas: priced.quote.discountHalalas,
      list_net_halalas: priced.quote.listNetHalalas,
    };
    couponQuote = { listNet: priced.quote.listNetHalalas, discount: priced.quote.discountHalalas, couponCode: priced.coupon.code };
  }

  // 4. earlier open orders for the same item
  const superseded = await supersedeEarlierOrders(deps, user.id, q.item.id);
  if (superseded.missing) {
    logMissingOnce("open orders read", superseded.code);
    return fail(503, MOYASAR_DISABLED_MESSAGE_AR);
  }
  if (superseded.code) console.warn("[payments/checkout] reading earlier open orders failed:", superseded.code);

  // 5. the order
  const { data: inserted, error: insertErr } = await admin
    .from("payment_orders")
    .insert({
      user_id: user.id,
      merchant: "platform",
      kind: q.item.kind,
      item_id: q.item.id,
      billing: input.billing,
      net_halalas: net,
      vat_halalas: vat,
      total_halalas: total,
      vat_mode: q.vatMode,
      currency: "SAR",
      status: "created",
      source: "checkout",
      metadata: {
        user_email: user.email ?? null,
        ...(couponMeta ? { coupon: couponMeta } : {}),
        ...(q.launch
          ? { launch: { campaign_id: q.launch.campaignId, list_net_halalas: q.launch.listNetHalalas } }
          : {}),
      },
    })
    .select("id")
    .single();
  const orderId = (inserted as { id?: unknown } | null)?.id;
  if (insertErr || typeof orderId !== "string" || !orderId) {
    if (couponMeta && isCouponOrderConflict(insertErr)) {
      // another tab opened an order carrying this code meanwhile (20261026_20)
      attempts.spend(user.id);
      return fail(400, COUPON_PENDING_AR);
    }
    if (insertErr && isMissingPaymentsObject(insertErr.code)) {
      logMissingOnce("order insert", insertErr.code);
      return fail(503, MOYASAR_DISABLED_MESSAGE_AR);
    }
    console.error("[payments/checkout] creating the order failed:", insertErr?.code, insertErr?.message);
    return fail(503, CHECKOUT_FAILED_AR);
  }
  const descriptionAr = intentDescription(q.item.labelAr);
  const callbackUrl = callbackUrlFor(input.origin, orderId);

  // 6. the intent
  const intent = await client.createIntent({
    amountHalalas: total,
    description: descriptionAr,
    callbackUrl,
    metadata: { order_id: orderId },
  });
  if (!intent.ok) {
    console.error("[payments/checkout] Moyasar refused the intent:", orderId, intent.status, intent.type);
    // no client secret left the server: close the order so nothing waits on it
    await admin.from("payment_orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "created");
    return fail(503, CHECKOUT_FAILED_AR);
  }

  // 7. the stamp — the secret goes out only if it really landed on this order
  const { data: stamped, error: stampErr } = await admin
    .from("payment_orders")
    .update({ moyasar_intent_id: intent.data.id, status: "initiated" })
    .eq("id", orderId)
    .eq("status", "created")
    .select("id");
  if (stampErr || !Array.isArray(stamped) || stamped.length !== 1) {
    console.error("[payments/checkout] saving the intent on the order failed:", orderId, stampErr?.code ?? "no row");
    await client.cancelIntent(intent.data.id);
    await admin.from("payment_orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "created");
    return fail(503, CHECKOUT_FAILED_AR);
  }

  // 8. the answer
  return {
    status: 200,
    body: {
      orderId,
      intentId: intent.data.id,
      clientSecret: intent.data.clientSecret,
      publishableKey: input.publishableKey,
      amountHalalas: total,
      descriptionAr,
      saveCard: q.item.saveCard,
      quote: {
        net,
        vat,
        total,
        vatMode: q.vatMode,
        ...(couponQuote ?? {}),
        ...(q.launch ? { launchListNet: q.launch.listNetHalalas } : {}),
      },
      callbackUrl,
      expiresAt: intent.data.expiresAt,
    },
  };
}
