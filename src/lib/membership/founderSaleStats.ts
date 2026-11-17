/**
 * founderSaleStats.ts — F14 (owner package 17 Nov): the founder sale in
 * numbers for «حملة المؤسس» (/dashboard/admin/founder). GET
 * /api/v1/admin/founder/overview reads the rows with the service role and
 * hands them here; the page shows what comes back. Pure: no imports, so
 * `node --test` loads it.
 *
 * Honest by construction:
 *   - REVENUE counts LIVE payments only (payment_orders.live === true). A
 *     test-mode payment (staff / test accounts, Moyasar test keys) is counted
 *     apart and never added in; a paid order whose mode is unknown (live null)
 *     is counted apart too.
 *   - Money comes from the stored columns only: total_halalas = net + VAT
 *     (VAT-exclusive pricing, ٢٥٨), refunded_halalas for a refund, the whole
 *     total for a void. Nothing is recomputed from the price book.
 *   - CONVERSION is by buyer, not by order (a declined card makes a second
 *     order for the same lawyer): "started" = distinct buyers with a founder
 *     order that is not test-mode, "paid" = distinct buyers with a LIVE paid
 *     one. Grouped by metadata.attribution.utm_source and .utm_campaign
 *     (F13); an order without it — every order placed before F13 shipped,
 *     and every buyer who never came through a tagged link — falls in the
 *     «غير متتبَّع» row, never guessed.
 *   - WEBHOOK problems are the payment_webhook_events rows whose outcome says
 *     something went wrong (webhookProblemOf). Deliveries refused before any
 *     database write — a wrong secret (401) or a malformed body (400) — are
 *     NOT recorded anywhere, so they cannot be shown; the page says so.
 */

export interface SaleOrderRow {
  id: string;
  user_id: string | null;
  status: string;
  live: boolean | null;
  net_halalas: number | null;
  vat_halalas: number | null;
  total_halalas: number | null;
  refunded_halalas: number | null;
  paid_at: string | null;
  /** metadata->attribution (F13), selected on its own — never the whole metadata. */
  attribution: unknown;
}

export interface RevenueTotals {
  /** Orders a payment reached (paid_at set): paid, later refunded or voided included. */
  paidOrders: number;
  /** Their stored amounts — gross, before any refund. */
  netHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  /** Given back: refunded_halalas, or the whole total of a voided payment. */
  reversedHalalas: number;
  /** totalHalalas − reversedHalalas. */
  keptHalalas: number;
}

export interface ConversionRow {
  /** The utm value, or null for «غير متتبَّع». */
  key: string | null;
  started: number;
  paid: number;
  /** Live gross total of this group's paid orders. */
  revenueHalalas: number;
}

export interface FounderSaleStats {
  revenue: { live: RevenueTotals; test: RevenueTotals; unknownMode: number };
  conversion: { bySource: ConversionRow[]; byCampaign: ConversionRow[] };
  /** True when the order read stopped at its cap (the numbers are then a lower bound). */
  ordersTruncated: boolean;
}

export const UNTRACKED_AR = "غير متتبَّع";

const whole = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0);

function emptyTotals(): RevenueTotals {
  return { paidOrders: 0, netHalalas: 0, vatHalalas: 0, totalHalalas: 0, reversedHalalas: 0, keptHalalas: 0 };
}

function addPaid(t: RevenueTotals, o: SaleOrderRow): void {
  const total = whole(o.total_halalas);
  t.paidOrders += 1;
  t.netHalalas += whole(o.net_halalas);
  t.vatHalalas += whole(o.vat_halalas);
  t.totalHalalas += total;
  const reversed = o.status === "voided" ? total : Math.min(whole(o.refunded_halalas), total);
  t.reversedHalalas += reversed;
  t.keptHalalas = t.totalHalalas - t.reversedHalalas;
}

/** A payment reached this order (it may have been refunded or voided since). */
export function wasPaid(o: Pick<SaleOrderRow, "paid_at">): boolean {
  return typeof o.paid_at === "string" && o.paid_at.length > 0;
}

/** utm_source / utm_campaign of metadata.attribution, or null. Bounded; nothing else is read. */
export function attributionKey(attribution: unknown, key: "utm_source" | "utm_campaign"): string | null {
  if (typeof attribution !== "object" || attribution === null || Array.isArray(attribution)) return null;
  const v = (attribution as Record<string, unknown>)[key];
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 64);
  return t ? t : null;
}

function conversionBy(orders: SaleOrderRow[], key: "utm_source" | "utm_campaign"): ConversionRow[] {
  const groups = new Map<string | null, { started: Set<string>; paid: Set<string>; revenue: number }>();
  for (const o of orders) {
    if (o.live === false) continue; // test-mode orders are not buyers
    const buyer = o.user_id ?? `order:${o.id}`;
    const k = attributionKey(o.attribution, key);
    let g = groups.get(k);
    if (!g) {
      g = { started: new Set(), paid: new Set(), revenue: 0 };
      groups.set(k, g);
    }
    g.started.add(buyer);
    if (o.live === true && wasPaid(o)) {
      g.paid.add(buyer);
      g.revenue += whole(o.total_halalas);
    }
  }
  return [...groups.entries()]
    .map(([k, g]) => ({ key: k, started: g.started.size, paid: g.paid.size, revenueHalalas: g.revenue }))
    .sort((a, b) => {
      if ((a.key === null) !== (b.key === null)) return a.key === null ? 1 : -1; // untracked last
      return b.paid - a.paid || b.started - a.started || String(a.key).localeCompare(String(b.key));
    });
}

export function founderSaleStats(orders: SaleOrderRow[], ordersTruncated = false): FounderSaleStats {
  const live = emptyTotals();
  const test = emptyTotals();
  let unknownMode = 0;
  for (const o of orders) {
    if (!wasPaid(o)) continue;
    if (o.live === true) addPaid(live, o);
    else if (o.live === false) addPaid(test, o);
    else unknownMode += 1;
  }
  return {
    revenue: { live, test, unknownMode },
    conversion: { bySource: conversionBy(orders, "utm_source"), byCampaign: conversionBy(orders, "utm_campaign") },
    ordersTruncated,
  };
}

/** paid / started as a whole percentage, or null when nobody started. */
export function conversionPercent(row: Pick<ConversionRow, "started" | "paid">): number | null {
  if (row.started <= 0) return null;
  return Math.round((row.paid / row.started) * 100);
}

// ── webhook problems ─────────────────────────────────────────────────────────

export interface WebhookEventRow {
  event_id: string;
  type: string | null;
  payment_id: string | null;
  live: boolean | null;
  received_at: string | null;
  outcome: string | null;
}

export interface WebhookProblemDto {
  eventId: string;
  type: string | null;
  paymentId: string | null;
  live: boolean | null;
  receivedAt: string | null;
  outcome: string | null;
  labelAr: string;
}

/**
 * The PostgREST filter for the problem rows (an .or() string): the delivery
 * never finished (null), is waiting for Moyasar's retry (pending…), was
 * refused by fulfilment (rejected…), named no order, or came in the other
 * mode. 'granted', 'already_done…', 'failed' (a declined card — the payer's
 * problem, not the webhook's), 'recorded' and 'ignored' are normal.
 */
export const WEBHOOK_PROBLEM_FILTER =
  "outcome.is.null,outcome.like.pending*,outcome.like.rejected*,outcome.eq.no_order,outcome.eq.mode_mismatch";

/** The Arabic label of a problem outcome, or null when the outcome is normal. */
export function webhookProblemOf(outcome: string | null | undefined): string | null {
  if (outcome === null || outcome === undefined || outcome === "") return "لم تكتمل معالجته (قد يكون قيد المعالجة الآن)";
  if (outcome === "pending" || outcome.startsWith("pending:")) return "بانتظار إعادة الإرسال من ميسّر";
  if (outcome.startsWith("rejected")) return "رُفضت الدفعة عند التحقق (الطلب أو المبلغ أو العملة لا يطابق)";
  if (outcome === "no_order") return "لا يوجد طلب مطابق للدفعة";
  if (outcome === "mode_mismatch") return "وضع الحدث (تجريبي/حي) لا يطابق مفتاح الخادم";
  return null;
}

export function webhookProblems(rows: WebhookEventRow[]): WebhookProblemDto[] {
  const out: WebhookProblemDto[] = [];
  for (const r of rows) {
    const labelAr = webhookProblemOf(r.outcome);
    if (!labelAr) continue;
    out.push({
      eventId: r.event_id,
      type: r.type,
      paymentId: r.payment_id,
      live: r.live,
      receivedAt: r.received_at,
      outcome: r.outcome,
      labelAr,
    });
  }
  return out;
}

/** What the page says about the webhook errors it cannot show (honesty note). */
export const WEBHOOK_UNRECORDED_NOTE_AR =
  "تُعرض هنا أحداث ميسّر المسجّلة لكل المدفوعات (وليس المؤسس وحده). الطلبات المزوّرة أو التالفة (سر خاطئ أو صيغة غير صالحة) تُرفض قبل أي كتابة في قاعدة البيانات، فلا يسجّلها التطبيق ولا يمكن عرضها هنا؛ أثرها الوحيد ردّ 401 أو 400 في سجل الوصول لخادم الويب.";
