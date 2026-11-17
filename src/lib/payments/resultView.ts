/**
 * resultView.ts — what /payments/result shows for a fulfilment outcome
 * (Moyasar payments B1, Task 6). Pure: the page fetches the order and calls
 * fulfillOrder; this maps the answer to Arabic copy and links.
 *
 * Success is shown ONLY for 'granted', or 'already_done' with no reason (a
 * refresh after success). Every other answer says what actually happened:
 *   already_entitled  — paid, nothing replaced: the refund-review notice;
 *   order_refunded    — refunded;
 *   claimed_elsewhere — another call is still granting: pending, refresh;
 *   order_<status>    — a closed unpaid order: closed, retry, contact;
 *   failed            — the reason is Moyasar's own message (it may be
 *                       English): shown only BESIDE the Arabic copy;
 *   pending           — not confirmed yet: refresh;
 *   rejected          — not matched to the order: contact.
 * The page never reads a ?status= from the URL; nothing here takes one.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { orderLabelWithPointsAr, sellableItem } from "./catalog.ts";
import { fulfilmentNoticeAr } from "./fulfillDecision.ts";
import { FOUNDER_PLAN_ID } from "../membership/founderPlan.ts";
import { FOUNDER_BENEFITS } from "../pricing/founderCard.ts";

export interface ResultOrder {
  id: string;
  kind: string;
  item_id: string;
  billing: string;
  status: string;
  receipt_number: string | null;
  /** Task F fix round 1: the points the order's purchase lot credited, when read. */
  credited_points?: number | null;
}

export interface ResultInput {
  outcome: "granted" | "already_done" | "failed" | "pending" | "rejected";
  reason?: string;
  receiptNumber?: string | null;
}

export type ResultTone = "success" | "review" | "refunded" | "failed" | "pending" | "closed" | "rejected";

export interface ResultView {
  tone: ResultTone;
  title: string;
  body: string;
  /** Moyasar's message for a declined payment, shown beside the Arabic copy. */
  detail?: string;
  /** The printable receipt (Task 8), once the money was taken. */
  receiptHref?: string;
  /** Back to the checkout for the same item and billing. */
  retryHref?: string;
  /** Show a link that reloads this page. */
  refresh: boolean;
  /** Point the payer at the contact page. */
  contact: boolean;
}

const PENDING_TITLE = "جارٍ تأكيد الدفع…";
const PENDING_BODY = "لم يصلنا تأكيد الدفع من بوابة الدفع بعد. حدّث الصفحة بعد لحظات.";
const CONTACT_SENTENCE = "إن خُصم مبلغ من بطاقتك فتواصل معنا لمراجعته.";

/** Moyasar's failure reason when it gave no message (fulfillCore's fallback). */
const NO_GATEWAY_MESSAGE = "payment_failed";

function labelOf(order: Pick<ResultOrder, "item_id" | "credited_points">): string {
  // resolve, not sell: an order for a retired item keeps the name it was sold
  // under (R3); a top-up names the points its lot actually credited.
  return orderLabelWithPointsAr(order.item_id, order.credited_points) ?? "طلبك";
}

function noticeKind(kind: string): "plan" | "library" | "topup" | "membership" {
  return kind === "library" || kind === "topup" || kind === "membership" ? kind : "plan";
}

/** /checkout for the order's own item and billing — only while that item is still sold so. */
export function retryHrefFor(order: Pick<ResultOrder, "item_id" | "billing">): string | undefined {
  const sold = sellableItem(order.item_id);
  if (!sold || !Object.hasOwn(sold.prices, order.billing)) return undefined;
  return `/checkout?item=${encodeURIComponent(order.item_id)}&billing=${encodeURIComponent(order.billing)}`;
}

function receiptHrefFor(order: Pick<ResultOrder, "id">): string {
  return `/dashboard/billing/receipt/${encodeURIComponent(order.id)}`;
}

// The self-refresh rule lives in autoRefresh.ts (import-free, safe for the
// client bundle); re-exported here for existing callers.
export { AUTO_REFRESH_INTERVAL_MS, AUTO_REFRESH_WINDOW_MS, autoRefreshDecision } from "./autoRefresh.ts";

/** «جارٍ تأكيد الدفع…» with a refresh — also what the page shows when it cannot read the order right now. */
export function pendingView(): ResultView {
  return { tone: "pending", title: PENDING_TITLE, body: PENDING_BODY, refresh: true, contact: false };
}

function closedView(order: ResultOrder): ResultView {
  return {
    tone: "closed",
    title: "هذا الطلب مغلق",
    body: `لم يُفعَّل شيء بهذا الطلب. ${CONTACT_SENTENCE}`,
    retryHref: retryHrefFor(order),
    refresh: false,
    contact: true,
  };
}

export function paymentResultView(result: ResultInput, order: ResultOrder): ResultView {
  const receiptNumber = result.receiptNumber ?? order.receipt_number ?? null;
  const notice = (alreadyEntitled: boolean) =>
    fulfilmentNoticeAr({ kind: noticeKind(order.kind), labelAr: labelOf(order), receiptNumber, alreadyEntitled });

  switch (result.outcome) {
    case "granted": {
      const n = notice(false);
      return { tone: "success", title: n.title, body: n.body, receiptHref: receiptHrefFor(order), refresh: false, contact: false };
    }
    case "already_done": {
      if (!result.reason) {
        const n = notice(false);
        return { tone: "success", title: n.title, body: n.body, receiptHref: receiptHrefFor(order), refresh: false, contact: false };
      }
      if (result.reason === "already_entitled") {
        const n = notice(true);
        return { tone: "review", title: n.title, body: n.body, receiptHref: receiptHrefFor(order), refresh: false, contact: false };
      }
      if (result.reason === "order_refunded") {
        return {
          tone: "refunded",
          title: "تم استرداد المبلغ",
          body: "استُرد مبلغ هذا الطلب.",
          receiptHref: receiptHrefFor(order),
          refresh: false,
          contact: false,
        };
      }
      if (result.reason === "claimed_elsewhere") return pendingView();
      return closedView(order);
    }
    case "failed": {
      const message = typeof result.reason === "string" ? result.reason.trim() : "";
      const view: ResultView = {
        tone: "failed",
        title: "لم تتم عملية الدفع",
        body: "لم تكتمل عملية الدفع، ولم يُفعَّل شيء بهذا الطلب. يمكنك المحاولة مرة أخرى.",
        retryHref: retryHrefFor(order),
        refresh: false,
        contact: false,
      };
      if (message && message !== NO_GATEWAY_MESSAGE) view.detail = message.slice(0, 300);
      return view;
    }
    case "rejected":
      return {
        tone: "rejected",
        title: "تعذّر تأكيد الدفع",
        body: `لم نتمكن من مطابقة هذه الدفعة مع طلبك، ولم يُفعَّل شيء. ${CONTACT_SENTENCE}`,
        refresh: false,
        contact: true,
      };
    case "pending":
    default:
      return pendingView();
  }
}

/**
 * No payment id yet (neither the callback's `?id=` nor one stored on the
 * order): nothing to fetch. Open → pending; cancelled (superseded by a newer
 * checkout) or another closed status → closed. A paid order always carries
 * its payment id, so a paid one here is not shown as a success.
 */
export function resultViewWithoutPayment(order: ResultOrder): ResultView {
  if (order.status === "created" || order.status === "initiated" || order.status === "paid") return pendingView();
  return closedView(order);
}

// ── F16: the founder welcome (owner, 13-Nov package, files 02 + 08) ─────────

export const FOUNDER_WELCOME_TITLE = "أهلاً بك في نخبة المؤسسين";
export const FOUNDER_WELCOME_TOOLS_LABEL = "ابدأ استخدام أدواتك الآن";
export const FOUNDER_WELCOME_RECEIPT_LABEL = "عرض الإيصال";
/** The AI tools hub (the lawyer's tools are listed there). */
export const FOUNDER_WELCOME_TOOLS_HREF = "/ai";

export interface FounderWelcome {
  title: string;
  /** The activation sentence the success view already carries (term + receipt number). */
  body: string;
  /** What the membership includes: the founder card's own list (FOUNDER_BENEFITS), never a typed copy. */
  benefits: readonly string[];
  toolsHref: string;
  receiptHref: string;
}

/**
 * The gold welcome card, or null for the ordinary result card.
 *
 * Only a SUCCESSFUL founder membership order gets it: kind "membership" and
 * item FOUNDER_PLAN_ID, and a success view (granted, or a refresh after it).
 * A founder payment that did not seat (already_entitled → «قيد المراجعة»), a
 * failure, a pending or a refund keeps the ordinary card. Every other order
 * keeps the ordinary card too.
 *
 * No points line: founder_activate (20261101_10) grants credits, a seat and
 * library access — no points. The «+٧٠٠ نقطة» in the owner's request is the
 * top-up counter (topup-500), not part of this membership.
 */
export function founderWelcomeFor(view: ResultView, order: Pick<ResultOrder, "kind" | "item_id">): FounderWelcome | null {
  if (view.tone !== "success" || !view.receiptHref) return null;
  if (order.kind !== "membership" || order.item_id !== FOUNDER_PLAN_ID) return null;
  return {
    title: FOUNDER_WELCOME_TITLE,
    body: view.body,
    benefits: FOUNDER_BENEFITS,
    toolsHref: FOUNDER_WELCOME_TOOLS_HREF,
    receiptHref: view.receiptHref,
  };
}
