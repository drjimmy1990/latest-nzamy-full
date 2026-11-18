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
 *      metadata {user_email} (user_id is set null if the account is deleted),
 *      plus metadata.attribution when the buyer's browser carries the F13
 *      first-touch utm cookie (any item; the route reads and re-validates it).
 *   6. The intent: the quote's total, «NEZAMY — <labelAr>», callback
 *      <origin>/payments/result?order=<id>. Refused → the order is closed, 503.
 *   7. The stamp: moyasar_intent_id + 'initiated', only while still 'created',
 *      returning the row. Zero rows (a concurrent checkout of the same item
 *      superseded it meanwhile) or an error → the intent is cancelled, the
 *      order closed, 503 — the client secret never goes out for a closed
 *      order.
 *   8. 200 CheckoutResponse, with the intent's callback URL and expiry.
 *
 * l6-pay (batch 6, 18 Nov 2026) — never on the founder membership:
 *   3a. A PLAN (deps.ranks given — the route passes TIER_RANK): the buyer's
 *       active plans (upgradeProration.readUpgrade). A running higher tier,
 *       or an open-ended row of the same tier → 409 before any order (it
 *       would be paid and grant nothing). An upgrade from a lower PAID plan →
 *       the pro-rata credit; a coupon with it → 400 UPGRADE_NO_COUPON_AR. A
 *       failed read → 503.
 *   3c. A TOP-UP of a founder member (F12, founderDiscount.ts; lifetime and
 *       founder_topup_discount_bps since l7): 15 % by default off the net,
 *       or the coupon if it is larger (never both). A failed
 *       founder read → 503. metadata.founder_discount; quote.founderDiscount.
 *   3d. The credit off the net before VAT (VAT recomputed); less than 1 SAR
 *       left → 409 UPGRADE_CREDIT_TOO_BIG_AR. metadata.proration;
 *       quote.prorationCredit. A second open / paid order crediting the same
 *       plans hits payment_orders_proration_once_key → 409 UPGRADE_PENDING_AR.
 *   5c. A LIMITED coupon (max_uses) is reserved for the order (the
 *       coupon_reserve RPC, 20261126_60) before any intent: exhausted → 400
 *       (the generic sentence), an RPC error → 503; the order is cancelled
 *       either way. The reservation lapses by itself when the order fails,
 *       is cancelled or its hold expires.
 *
 * The founder membership (P3, kind "membership" — lawyer-founder-2026) adds,
 * for that kind only (every other item is untouched):
 *   0.  The sale switch (deps.onSale, FOUNDER_MEMBERSHIP_ON_SALE by default)
 *       off → 410 «باب الاشتراك مغلق حاليًا» before anything is read or
 *       written, so a partial deploy can never take money (Task 11 flips it).
 *   0b. A coupon code → 400 «لا تُطبَّق القسائم على باقة المؤسس»: the
 *       first-year price is already the discount and nothing stacks. No
 *       coupon is read and no try is spent (couponRules refuses the kind too,
 *       for the preview route).
 *   0c. The founder terms consent (owner ١٦, founderConsent.ts): the body
 *       must carry acceptFounderTerms: true and the current
 *       founderTermsVersion, else 400 (FOUNDER_TERMS_REQUIRED_AR /
 *       FOUNDER_TERMS_STALE_AR) before anything is read or written; terms
 *       not published → 410. The order's metadata records
 *       founder_terms_version and founder_terms_accepted_at (this request's
 *       server clock, deps.now, ISO).
 *   0d. S6b: the Turnstile check (deps.verifyHuman, the route's
 *       checkoutCaptchaPasses — checkoutCaptcha.ts). False or a throw → 403
 *       {error: CHECKOUT_CAPTCHA_REFUSED_AR, code: "captcha"} before
 *       anything is read or written: no order, no seat, no intent. The
 *       browser shows it with a retry, never as a final refusal. Absent →
 *       not checked (the route always passes it; route.test.ts pins that).
 *   5b. After the order row, the seat: deps.reserveFounderSeat (the route's
 *       founder_reserve_seat RPC, 20261101_10). Anything but 'reserved'
 *       cancels the order (still 'created', no intent yet) and answers:
 *       not_verified / not_advocate 403, already_member / full 409, closed / paused 410; an
 *       RPC error (22023: the order already holds a seat), a throw, an
 *       unknown answer or a missing dependency → 503 CHECKOUT_FAILED_AR.
 *       Never a 500, never an intent without a reserved seat.
 *   5c. (Task 5, ruling R13) Once the seat may be held, an order cancelled on
 *       the way — Moyasar refused the intent (6), the stamp failed (7), or
 *       the reserve RPC threw (a transport error after the database may have
 *       reserved) — frees it at once: deps.releaseFounderSeat (the route's
 *       founder_release_order RPC). Best-effort: a failure is logged and the
 *       reply is unchanged (the sweep's founder_release_expired catches it).
 *       A refusal answer reserved nothing, so it releases nothing.
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
import {
  COUPON_PENDING_AR,
  isCouponOrderConflict,
  priceWithCoupon,
  sortOpenCouponOrders,
  staleOrderClosable,
  type OpenCouponOrderRow,
} from "./couponServer.ts";
import { applyDiscount, COUPON_INVALID_AR, COUPONS_UNAVAILABLE_AR } from "./couponRules.ts";
import {
  isProrationOrderConflict,
  netAfterCredit,
  prorationMetadata,
  readUpgrade,
  UPGRADE_CREDIT_TOO_BIG_AR,
  UPGRADE_FAILED_AR,
  UPGRADE_NO_COUPON_AR,
  UPGRADE_PENDING_AR,
  type UpgradeDecision,
} from "./upgradeProration.ts";
import {
  bestDiscount,
  FOUNDER_DISCOUNT_FAILED_AR,
  founderDiscountApplies,
  founderDiscountBps,
  founderDiscountHalalas,
  founderDiscountMetadata,
  isActiveFounder,
} from "./founderDiscount.ts";
import type { TierRankTable } from "../entitlementGrantRules.ts";
import { COUPON_ATTEMPTS, RATE_LIMITED_AR, type CouponAttemptBudget } from "./couponAttempts.ts";
import type { BookEntry } from "../pricing/priceBook.ts";
import { FOUNDER_MEMBERSHIP_ON_SALE } from "../pricing/campaigns.ts";
import { checkFounderConsent, type FounderConsent, type FounderTermsState } from "./founderConsent.ts";
import { CHECKOUT_CAPTCHA_CODE, CHECKOUT_CAPTCHA_REFUSED_AR } from "./checkoutCaptcha.ts";
import type { Attribution } from "../attribution/utmAttribution.ts";
import type { OrderAnalytics } from "../analytics/analytics.ts";
import { DEMO_NO_PAYMENT_AR, demoRefusal } from "../api/dbErrorCore.ts";
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

// P3: the founder membership's refusals (task 4 brief, verbatim)
export const FOUNDER_CLOSED_AR = "باب الاشتراك مغلق حاليًا";
export const FOUNDER_NO_COUPON_AR = "لا تُطبَّق القسائم على باقة المؤسس";
export const FOUNDER_NOT_VERIFIED_AR = "يُتاح اشتراك المؤسس بعد توثيق رخصتك المهنية";
export const FOUNDER_ALREADY_MEMBER_AR = "أنت عضو مؤسس بالفعل";
export const FOUNDER_FULL_AR = "اكتملت مقاعد المؤسسين";
/** 20261122_10 (owner, 17 Nov): the founder plan is for a licensed advocate only. */
export const FOUNDER_NOT_ADVOCATE_AR = "باقة المؤسس للمحامي المرخّص للترافع فقط، ولا تُتاح لحساب المستشار";

/** founder_reserve_seat's refusals (20261101_10) → the checkout's reply. 'reserved' goes on; any other answer is a 503. */
const SEAT_REFUSALS: Readonly<Record<string, { status: 403 | 409 | 410; error: string }>> = {
  not_verified: { status: 403, error: FOUNDER_NOT_VERIFIED_AR },
  not_advocate: { status: 403, error: FOUNDER_NOT_ADVOCATE_AR },
  // 20261125_50 (S3): a demo account never reserves a founder seat
  demo_account: { status: 403, error: DEMO_NO_PAYMENT_AR },
  already_member: { status: 409, error: FOUNDER_ALREADY_MEMBER_AR },
  full: { status: 409, error: FOUNDER_FULL_AR },
  closed: { status: 410, error: FOUNDER_CLOSED_AR },
  paused: { status: 410, error: FOUNDER_CLOSED_AR },
};

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
  /** P3: whether the founder membership is on sale; FOUNDER_MEMBERSHIP_ON_SALE unless a test passes its own. */
  onSale?: boolean;
  /** Owner ١٦: the founder terms (published + version); CURRENT_FOUNDER_TERMS unless a test passes its own. */
  founderTerms?: FounderTermsState;
  /**
   * P3: reserves a founder seat for this membership order — the route's
   * founder_reserve_seat RPC. Answers reserved | already_member | full |
   * closed | paused | not_verified | not_advocate; throws on an RPC error. Missing → a
   * membership checkout fails closed (503).
   */
  reserveFounderSeat?: (userId: string, orderId: string) => Promise<string>;
  /**
   * P3 (R13): frees the founder seat of a membership order this checkout
   * cancels after reserving it — the route's founder_release_order RPC.
   * Best-effort; never called for any other kind.
   */
  releaseFounderSeat?: (orderId: string) => Promise<void>;
  /**
   * S6b: the Turnstile check for a founder membership checkout (step 0d) —
   * true to go on. Never called for any other kind. A throw is a refusal.
   */
  verifyHuman?: () => Promise<boolean>;
  /**
   * l6-pay (Q511): TIER_RANK (src/lib/access-control.ts) — the route passes
   * it. With it a PLAN checkout reads what the buyer holds (step 3a): a
   * downgrade is refused, an upgrade carries the pro-rata credit. Absent →
   * not read (the plan is priced as before). Never used for any other kind.
   */
  ranks?: TierRankTable;
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
  /** Owner ١٦: the founder terms consent (parseFounderConsent); read for the founder membership only. */
  founderConsent?: FounderConsent | null;
  /** F13: the first-touch utm cookie (utmAttribution.ts), stored as metadata.attribution; null / absent → nothing stored. */
  attribution?: Attribution | null;
  /** l7-analytics: the consented GA client id (orderAnalyticsFromCookies), stored as metadata.analytics for the server purchase event; null / absent → nothing stored, no event. */
  analytics?: OrderAnalytics | null;
  /**
   * l7 decision 3 (20261127_80): the gateway mode of this checkout, stored as
   * metadata.gateway_mode. The database accepts a TEST ACCOUNT's order only
   * when it says 'test' ('demo_account:live_payment' otherwise, mapped by
   * demoRefusal below). Absent → not stored.
   */
  gatewayMode?: "test" | "live";
}

export type CheckoutReply =
  | { status: 200; body: CheckoutResponse }
  | { status: 400 | 403 | 409 | 410 | 429 | 503; body: { error: string; code?: string } };

const OPEN = ["created", "initiated"];

const missingLogged = new Set<string>();

function logMissingOnce(step: string, code: string | undefined): void {
  if (missingLogged.has(step)) return;
  missingLogged.add(step);
  console.warn(`[payments/checkout] ${step}: a B1 migration is not applied yet (${code ?? "?"}); answering 503`);
}

const fail = (status: 400 | 403 | 409 | 410 | 429 | 503, error: string): CheckoutReply => ({ status, body: { error } });

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

/** Step 5c — best-effort: a failed release is logged and never changes the reply. */
async function releaseSeat(deps: CheckoutDeps, orderId: string): Promise<void> {
  if (!deps.releaseFounderSeat) return;
  try {
    await deps.releaseFounderSeat(orderId);
  } catch (err) {
    console.warn("[payments/checkout] freeing the founder seat failed (the sweep frees it):", orderId, err instanceof Error ? err.message : "unknown");
  }
}

/**
 * Step 5 (l6-pay) — the buyer's OPEN orders carrying this proration key:
 * "pending" while one may still be paid (younger than the intent lifetime,
 * or a payment reached it within the sweep's lookback), "cleared" once every
 * stale one is closed (couponServer.staleOrderClosable: Moyasar lists nothing
 * for it but failed payments), "unknown" on a failed read / listing / close.
 * No open order (the conflict is a PAID one) → "pending".
 */
async function closeStaleProrationOrders(
  deps: CheckoutDeps,
  userId: string,
  key: string,
  now: Date,
): Promise<"cleared" | "pending" | "unknown"> {
  const { admin, client } = deps;
  const { data, error } = await admin
    .from("payment_orders")
    .select("id, item_id, status, created_at, moyasar_intent_id, moyasar_payment_id")
    .eq("user_id", userId)
    .in("status", OPEN)
    .eq("metadata->proration->>key", key)
    .limit(10);
  if (error) {
    console.error("[payments/checkout] reading the open upgrade orders failed:", error.code);
    return "unknown";
  }
  const rows = (data as OpenCouponOrderRow[] | null) ?? [];
  if (rows.length === 0) return "pending";
  // no item matches: every fresh open order blocks
  const { blocking, stale } = sortOpenCouponOrders(rows, "(no item)", now.getTime());
  if (blocking.length > 0 || stale.length === 0) return "pending";
  for (const row of stale) {
    let listed: Array<{ status: string }> | null = null;
    if (!(row.status === "created" && !row.moyasar_intent_id && !row.moyasar_payment_id)) {
      const r = await client.listPaymentsByOrder(row.id);
      if (!r.ok) return "unknown";
      listed = r.data;
    }
    if (!staleOrderClosable(row, listed, now.getTime())) return "pending";
    const close = admin.from("payment_orders").update({ status: "cancelled" }).eq("id", row.id).eq("user_id", userId).in("status", OPEN);
    const { error: closeErr } = row.moyasar_payment_id
      ? await close.eq("moyasar_payment_id", row.moyasar_payment_id)
      : await close.is("moyasar_payment_id", null);
    if (closeErr) return "unknown";
    console.info("[payments/checkout] closed an abandoned upgrade order:", row.id);
  }
  return "cleared";
}

/** The coupon_reserve RPC's name (20261126_60). */
export const COUPON_RESERVE_RPC = "coupon_reserve";

/** Step 5c — null when the coupon's use is held for this order, else the reply (the caller cancels the order). */
async function reserveCoupon(admin: SupabaseClient, couponId: string, orderId: string, userId: string): Promise<CheckoutReply | null> {
  let answer: unknown;
  try {
    const { data, error } = await admin.rpc(COUPON_RESERVE_RPC, { p_coupon: couponId, p_order: orderId, p_user: userId });
    if (error) {
      if (isMissingPaymentsObject(error.code)) logMissingOnce("coupon_reserve", error.code);
      else console.error("[payments/checkout] reserving the coupon failed:", orderId, error.code);
      return fail(503, COUPONS_UNAVAILABLE_AR);
    }
    answer = data;
  } catch (err) {
    console.error("[payments/checkout] reserving the coupon threw:", orderId, err instanceof Error ? err.message : "unknown");
    return fail(503, COUPONS_UNAVAILABLE_AR);
  }
  if (answer === "reserved" || answer === "unlimited") return null;
  if (answer === "exhausted") return fail(400, COUPON_INVALID_AR);
  console.error("[payments/checkout] coupon_reserve gave an unexpected answer:", orderId, String(answer).slice(0, 40));
  return fail(503, COUPONS_UNAVAILABLE_AR);
}

/** Step 5b — null when the seat is reserved, else the reply (the caller cancels the order). */
async function reserveSeat(deps: CheckoutDeps, userId: string, orderId: string): Promise<CheckoutReply | null> {
  if (!deps.reserveFounderSeat) {
    console.error("[payments/checkout] a membership checkout without reserveFounderSeat:", orderId);
    return fail(503, CHECKOUT_FAILED_AR);
  }
  let answer: unknown;
  try {
    answer = await deps.reserveFounderSeat(userId, orderId);
  } catch (err) {
    console.error("[payments/checkout] reserving a founder seat failed:", orderId, err instanceof Error ? err.message : "unknown");
    // the RPC may have reserved before the transport failed (5c)
    await releaseSeat(deps, orderId);
    return fail(503, CHECKOUT_FAILED_AR);
  }
  if (answer === "reserved") return null;
  const refusal = typeof answer === "string" && Object.prototype.hasOwnProperty.call(SEAT_REFUSALS, answer) ? SEAT_REFUSALS[answer] : null;
  if (refusal) return fail(refusal.status, refusal.error);
  console.error("[payments/checkout] founder_reserve_seat gave an unknown answer:", orderId, String(answer).slice(0, 40));
  return fail(503, CHECKOUT_FAILED_AR);
}

export async function startCheckoutWith(deps: CheckoutDeps, input: CheckoutInput): Promise<CheckoutReply> {
  const { admin, client } = deps;
  const { user } = input;
  const attempts = deps.attempts ?? COUPON_ATTEMPTS;
  const catalog = deps.catalog ?? PAYABLE_ITEMS;

  // 0 (P3). the founder membership: the sale switch, then no coupon, then the
  // terms consent (owner ١٦) — before any read
  const isMembership = resolveItem(input.itemId, catalog)?.kind === "membership";
  let consentMeta: Record<string, string> | null = null;
  if (isMembership) {
    if (!(deps.onSale ?? FOUNDER_MEMBERSHIP_ON_SALE)) return fail(410, FOUNDER_CLOSED_AR);
    if (input.couponCode) return fail(400, FOUNDER_NO_COUPON_AR);
    const consent = checkFounderConsent(input.founderConsent, deps.now?.() ?? new Date(), deps.founderTerms);
    if (!consent.ok) return fail(consent.status, consent.error);
    consentMeta = consent.metadata;
    // 0d (S6b). the Turnstile check — before any read, so a refusal writes nothing
    if (deps.verifyHuman) {
      let human = false;
      try {
        human = (await deps.verifyHuman()) === true;
      } catch {
        human = false;
      }
      if (!human) return { status: 403, body: { error: CHECKOUT_CAPTCHA_REFUSED_AR, code: CHECKOUT_CAPTCHA_CODE } };
    }
  }

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

  // 3a (l6-pay, Q511). a plan: what the buyer already holds — a downgrade is
  // refused before any order (it would be paid and grant nothing); an upgrade
  // from a lower PAID plan carries the pro-rata credit (upgradeProration.ts),
  // which is never combined with a coupon
  let upgrade: Extract<UpgradeDecision, { kind: "credit" }> | null = null;
  if (q.item.kind === "plan" && q.item.tier && deps.ranks) {
    const held = await readUpgrade(admin, { userId: user.id, tier: q.item.tier, now, ranks: deps.ranks });
    if (!held) return fail(503, UPGRADE_FAILED_AR);
    if (held.kind === "refused") return fail(409, held.error);
    if (held.kind === "credit") {
      if (input.couponCode) return fail(400, UPGRADE_NO_COUPON_AR);
      upgrade = held;
    }
  }

  // 3b. the coupon, on the net before VAT
  let net = q.netHalalas;
  let vat = q.vatHalalas;
  let total = q.totalHalalas;
  let couponMeta: Record<string, unknown> | null = null;
  let couponQuote: { listNet: number; discount: number; couponCode: string } | null = null;
  let couponLimited = false;
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
    couponLimited = priced.coupon.limited === true;
  }

  // 3c (l6-pay, F12). a founder member: 15 % (the setting) off a top-up, never
  // combined with a better offer — the larger of coupon and founder discount
  // wins (a tie keeps the coupon unused)
  let founderMeta: Record<string, unknown> | null = null;
  let founderQuote: { listNet: number; founderDiscount: number } | null = null;
  if (founderDiscountApplies(q.item.kind)) {
    const founder = await isActiveFounder(admin, user.id, now);
    if (founder === null) return fail(503, FOUNDER_DISCOUNT_FAILED_AR);
    if (founder) {
      // l7 (decision 4): the rate is the founder_topup_discount_bps setting (default 1500)
      const bps = await founderDiscountBps(admin);
      const fd = founderDiscountHalalas(q.netHalalas, bps);
      if (bestDiscount(couponQuote?.discount ?? null, fd).source === "founder") {
        const d = applyDiscount(q.netHalalas, fd);
        ({ netHalalas: net, vatHalalas: vat, totalHalalas: total } = d);
        couponMeta = null;
        couponQuote = null;
        couponLimited = false;
        founderMeta = founderDiscountMetadata(q.netHalalas, d.discountHalalas, bps);
        founderQuote = { listNet: q.netHalalas, founderDiscount: d.discountHalalas };
      }
    }
  }

  // 3d (l6-pay, Q511). the pro-rata credit off the net before VAT; less than
  // 1 SAR left → refused (Moyasar charges no 0, and the credit would be lost)
  let prorationMeta: Record<string, unknown> | null = null;
  let prorationQuote: { listNet: number; prorationCredit: number } | null = null;
  if (upgrade) {
    if (netAfterCredit(net, upgrade.creditHalalas) === null) return fail(409, UPGRADE_CREDIT_TOO_BIG_AR);
    const d = applyDiscount(net, upgrade.creditHalalas);
    ({ netHalalas: net, vatHalalas: vat, totalHalalas: total } = d);
    prorationMeta = prorationMetadata(upgrade, q.netHalalas);
    prorationQuote = { listNet: q.netHalalas, prorationCredit: d.discountHalalas };
  }

  // 4. earlier open orders for the same item
  const superseded = await supersedeEarlierOrders(deps, user.id, q.item.id);
  if (superseded.missing) {
    logMissingOnce("open orders read", superseded.code);
    return fail(503, MOYASAR_DISABLED_MESSAGE_AR);
  }
  if (superseded.code) console.warn("[payments/checkout] reading earlier open orders failed:", superseded.code);

  // 5. the order
  const orderRow = {
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
      ...(founderMeta ? { founder_discount: founderMeta } : {}),
      ...(prorationMeta ? { proration: prorationMeta } : {}),
      ...(consentMeta ?? {}),
      ...(input.attribution ? { attribution: input.attribution } : {}),
      ...(input.analytics ? { analytics: input.analytics } : {}),
      ...(input.gatewayMode ? { gateway_mode: input.gatewayMode } : {}),
      ...(q.launch
        ? { launch: { campaign_id: q.launch.campaignId, list_net_halalas: q.launch.listNetHalalas } }
        : {}),
    },
  };
  const insertOrder = () => admin.from("payment_orders").insert(orderRow).select("id").single();
  let { data: inserted, error: insertErr } = await insertOrder();
  // l6-pay: an ABANDONED earlier upgrade attempt (its intent expired, no
  // payment) must not lock the upgrade for good — nothing else closes it.
  // Closed after the same checks as an expired couponed order, then the
  // insert is tried once more; a fresh or reached order still answers 409.
  if (insertErr && upgrade && isProrationOrderConflict(insertErr)) {
    const cleared = await closeStaleProrationOrders(deps, user.id, upgrade.key, now);
    if (cleared === "unknown") return fail(503, CHECKOUT_FAILED_AR);
    if (cleared === "cleared") ({ data: inserted, error: insertErr } = await insertOrder());
  }
  const orderId = (inserted as { id?: unknown } | null)?.id;
  if (insertErr || typeof orderId !== "string" || !orderId) {
    if (couponMeta && isCouponOrderConflict(insertErr)) {
      // another tab opened an order carrying this code meanwhile (20261026_20)
      attempts.spend(user.id);
      return fail(400, COUPON_PENDING_AR);
    }
    // l6-pay (20261126_60): another open / paid order already carries the credit of these plans
    if (prorationMeta && isProrationOrderConflict(insertErr)) return fail(409, UPGRADE_PENDING_AR);
    // 20261125_50 (S3) / 20261127_80: payment_orders refuses a test account's order outside test mode
    const demo = demoRefusal(insertErr);
    if (demo) return fail(demo.status, demo.message);
    if (insertErr && isMissingPaymentsObject(insertErr.code)) {
      logMissingOnce("order insert", insertErr.code);
      return fail(503, MOYASAR_DISABLED_MESSAGE_AR);
    }
    console.error("[payments/checkout] creating the order failed:", insertErr?.code, insertErr?.message);
    return fail(503, CHECKOUT_FAILED_AR);
  }

  // 5b (P3). the founder seat — reserved, or the order is closed before any intent
  if (isMembership) {
    const refused = await reserveSeat(deps, user.id, orderId);
    if (refused) {
      await admin.from("payment_orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "created");
      return refused;
    }
  }

  // 5c (l6-pay, 20261126_60). a LIMITED coupon (max_uses) is reserved for this
  // order before any intent: coupon_reserve locks the coupon row and counts
  // the uses plus the live reservations, so two buyers cannot both take the
  // last use. A reservation stops counting by itself once its order fails, is
  // cancelled or its hold expires, and turns into the use when fulfilment
  // records it. Exhausted → the generic coupon sentence; an RPC error or the
  // function missing (20261126_60 not run) → 503, never an unguarded charge.
  if (couponMeta && couponLimited) {
    const refused = await reserveCoupon(admin, String(couponMeta.id), orderId, user.id);
    if (refused) {
      await admin.from("payment_orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "created");
      return refused;
    }
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
    if (isMembership) await releaseSeat(deps, orderId);
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
    if (isMembership) await releaseSeat(deps, orderId);
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
        ...(founderQuote ?? {}),
        ...(prorationQuote ?? {}),
        ...(q.launch ? { launchListNet: q.launch.listNetHalalas } : {}),
      },
      callbackUrl,
      expiresAt: intent.data.expiresAt,
    },
  };
}
