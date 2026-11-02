/**
 * founderAdmin.ts — the pure rules of the admin «حملة المؤسس» panel (P3 Task 10):
 *   GET   /api/v1/admin/founder/overview            — the numbers, members, refund list
 *   PATCH /api/v1/admin/founder/sale                — { salePaused?, capacity? } (R2, R25)
 *   POST  /api/v1/admin/founder/orders/[id]/activate — «إعادة محاولة التفعيل» (R24)
 *
 * - The summary is founder_seat_summary() (20261101_10).
 * - A refund case is a PAID membership order whose metadata.founder is one of
 *   ruling R7's three reasons. founder_activate never rewrites that key on a
 *   refund, so the status filter is what drops a refunded order from the list.
 * - Members are ACTIVE seats only, and their credits come from those seats
 *   only: a revoked seat's credit row can read remaining 1 after a late
 *   ai_fail_run (Task 2 note). Each member carries `live` from its order's
 *   payment_orders.live (R32), so a test-mode seat shows «تجريبي».
 * - The retry maps founder_activate's answer (a stamped refund order) or
 *   fulfillOrder's resume answer (a paid order whose stamp never happened).
 *
 * Relative imports only: `node --test` loads it (./founderAdmin.test.ts).
 */
import { FOUNDER_CAPACITY_MAX, riyadhDay } from "../pricing/campaigns.ts";

export const FOUNDER_REFUND_REASONS = ["seat_unavailable", "not_verified", "already_member"] as const;
export type FounderRefundCase = (typeof FOUNDER_REFUND_REASONS)[number];

export const FOUNDER_REFUND_LABEL_AR = "بانتظار استرداد";

export const FOUNDER_REFUND_REASON_AR: Readonly<Record<FounderRefundCase, string>> = {
  seat_unavailable: "اكتملت المقاعد قبل تأكيد الدفع",
  not_verified: "رخصة المحامي غير موثّقة عند تأكيد الدفع",
  already_member: "المشتري عضو مؤسس بالفعل بعملية أخرى",
};

/** payment_orders.status values (20261022_10), in the order the panel shows them. */
export const FOUNDER_ORDER_STATUSES = ["created", "initiated", "paid", "failed", "refunded", "voided", "cancelled"] as const;

/** The admin's own pages: where a paid order is refunded. */
export const ADMIN_REFUND_HREF = "/dashboard/admin/subscriptions/orders";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const isWhole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

// ── the summary ──────────────────────────────────────────────────────────────

export interface FounderAdminSummary {
  capacity: number;
  active: number;
  reserved: number;
  seatsLeft: number;
  salePaused: boolean;
  /** The SQL's on_sale: window open, not paused, a seat left. */
  onSale: boolean;
}

/** founder_seat_summary()'s one row (an array from PostgREST, or the bare row), or null. */
export function founderAdminSummaryFromRpc(data: unknown): FounderAdminSummary | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!isPlainObject(row)) return null;
  const { capacity, active, reserved, seats_left: seatsLeft, sale_paused: salePaused, on_sale: onSale } = row;
  if (!isWhole(capacity) || !isWhole(active) || !isWhole(reserved) || !isWhole(seatsLeft)) return null;
  if (typeof salePaused !== "boolean" || typeof onSale !== "boolean") return null;
  return { capacity, active, reserved, seatsLeft, salePaused, onSale };
}

/**
 * One phrase for the sale state. `codeSwitch` is FOUNDER_MEMBERSHIP_ON_SALE:
 * while it is false nothing is sold, whatever the SQL says.
 */
export function saleStateAr(summary: FounderAdminSummary | null, codeSwitch: boolean): string {
  if (!summary) return "—";
  if (summary.salePaused) return "البيع متوقف مؤقتًا";
  if (!codeSwitch) return "البيع مغلق في الشيفرة";
  if (summary.onSale) return "معروض للبيع";
  if (summary.seatsLeft === 0) return "اكتملت المقاعد";
  return "خارج فترة الحملة";
}

/** The ISO instant of today's Riyadh midnight (Asia/Riyadh has no DST: +03:00). */
export function riyadhDayStartIso(now: Date): string {
  return `${riyadhDay(now)}T00:00:00+03:00`;
}

// ── the refund list ──────────────────────────────────────────────────────────

export interface FounderOrderRow {
  id: string;
  user_id: string | null;
  kind: string;
  status: string;
  total_halalas?: number | null;
  refunded_halalas?: number | null;
  receipt_number?: string | null;
  paid_at?: string | null;
  fulfilled_at?: string | null;
  live?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export type PersonRef = { name: string | null; email: string | null };

/** A refund claimed and not released (refund_job.state other than 'retryable'). */
function refundInFlight(order: FounderOrderRow): boolean {
  const job = order.metadata?.refund_job;
  return isPlainObject(job) && job.state !== "retryable";
}

/** Why this order waits for a refund (R7), or null when it does not. */
export function founderRefundCase(order: FounderOrderRow): FounderRefundCase | null {
  if (order.kind !== "membership" || order.status !== "paid") return null;
  const founder = order.metadata?.founder;
  return (FOUNDER_REFUND_REASONS as readonly unknown[]).includes(founder) ? (founder as FounderRefundCase) : null;
}

export interface FounderRefundOrderDto {
  id: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  reason: FounderRefundCase;
  reasonAr: string;
  label: string;
  totalHalalas: number;
  receiptNumber: string | null;
  paidAt: string | null;
  live: boolean | null;
  /**
   * The «إعادة محاولة التفعيل» button. Not for already_member: he holds an
   * active seat from another order, so founder_activate can only say 'already'.
   * Not while a refund is in flight either (R26): a refund_job other than
   * 'retryable' — the API refuses it (activationRetryIssue).
   */
  canRetry: boolean;
}

/** The «بانتظار استرداد» table: refund cases only, newest payment first. */
export function founderRefundOrders(
  rows: readonly FounderOrderRow[],
  people: ReadonlyMap<string, PersonRef>,
): FounderRefundOrderDto[] {
  const out: FounderRefundOrderDto[] = [];
  for (const o of rows) {
    const reason = founderRefundCase(o);
    if (!reason) continue;
    const person = o.user_id ? people.get(o.user_id) : undefined;
    out.push({
      id: o.id,
      userId: o.user_id,
      name: person?.name ?? null,
      email: person?.email ?? null,
      reason,
      reasonAr: FOUNDER_REFUND_REASON_AR[reason],
      label: FOUNDER_REFUND_LABEL_AR,
      totalHalalas: typeof o.total_halalas === "number" ? o.total_halalas : 0,
      receiptNumber: o.receipt_number ?? null,
      paidAt: o.paid_at ?? null,
      live: typeof o.live === "boolean" ? o.live : null,
      canRetry: reason !== "already_member" && !refundInFlight(o),
    });
  }
  return out.sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
}

// ── members ──────────────────────────────────────────────────────────────────

export interface FounderSeatRow {
  id: string;
  user_id: string;
  order_id: string | null;
  status: string;
  activated_at: string | null;
  ends_at: string | null;
}

export interface FounderCreditRow {
  seat_id: string;
  kind: string;
  total: number;
  remaining: number;
}

type CreditDto = { remaining: number; total: number } | null;

export interface FounderMemberDto {
  seatId: string;
  userId: string;
  orderId: string | null;
  name: string | null;
  email: string | null;
  activatedAt: string | null;
  endsAt: string | null;
  credits: { draftingWork: CreditDto; independentOutput: CreditDto };
  /**
   * R32: false only when the seat's order is a test-mode payment
   * (payment_orders.live = false) — the panel tags it «تجريبي». A seat with
   * no order, an order not found, or live null counts as live (no tag), the
   * same `=== false` rule as the refund list's «عملية تجريبية».
   */
  live: boolean;
}

/** «تجريبي» — the member row's tag for a seat bought in test mode (R32). */
export const FOUNDER_TEST_SEAT_TAG_AR = "تجريبي";

/**
 * The members: ACTIVE seats, newest activation first, each with its own
 * seat's credits. `liveByOrder` is payment_orders.live keyed by order id.
 */
export function founderMembers(
  seats: readonly FounderSeatRow[],
  credits: readonly FounderCreditRow[],
  people: ReadonlyMap<string, PersonRef>,
  liveByOrder: ReadonlyMap<string, boolean | null>,
): FounderMemberDto[] {
  const active = seats.filter((s) => s.status === "active");
  const bySeat = new Map<string, { draftingWork: CreditDto; independentOutput: CreditDto }>();
  for (const s of active) bySeat.set(s.id, { draftingWork: null, independentOutput: null });
  for (const c of credits) {
    const slot = bySeat.get(c.seat_id);
    if (!slot) continue; // a revoked / released seat's credits never show
    const dto = { remaining: c.remaining, total: c.total };
    if (c.kind === "drafting_work") slot.draftingWork = dto;
    else if (c.kind === "independent_output") slot.independentOutput = dto;
  }
  return active
    .map((s) => {
      const person = people.get(s.user_id);
      return {
        seatId: s.id,
        userId: s.user_id,
        orderId: s.order_id,
        name: person?.name ?? null,
        email: person?.email ?? null,
        activatedAt: s.activated_at,
        endsAt: s.ends_at,
        credits: bySeat.get(s.id)!,
        live: !(s.order_id && liveByOrder.get(s.order_id) === false),
      };
    })
    .sort((a, b) => (b.activatedAt ?? "").localeCompare(a.activatedAt ?? ""));
}

// ── the sale PATCH (R2) ──────────────────────────────────────────────────────

export type FounderSalePatch = { sale_paused?: boolean; capacity?: number };

/**
 * { salePaused?: boolean, capacity?: whole number 1..100000 }, at least one
 * (R25: partial) → only the keys sent, merged into
 * platform_settings['founder_campaign'], so a capacity save never re-sends
 * (and so never undoes) a pause another admin just made, and the reverse.
 * The merged value is checked again by founderCampaignSettingIssue (Task 8's
 * validator) before the write.
 */
export function parseFounderSalePatch(body: unknown): { ok: true; patch: FounderSalePatch } | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: "بيانات غير صالحة" };
  const unknownKeys = Object.keys(body).filter((k) => k !== "salePaused" && k !== "capacity");
  if (unknownKeys.length > 0) {
    return { ok: false, error: `حقول غير معروفة: ${unknownKeys.join("، ")} — المسموح: salePaused و capacity` };
  }
  if (!("salePaused" in body) && !("capacity" in body)) {
    return { ok: false, error: "أرسل salePaused أو capacity (أو كليهما)" };
  }
  const patch: FounderSalePatch = {};
  if ("salePaused" in body) {
    if (typeof body.salePaused !== "boolean") {
      return { ok: false, error: "salePaused يجب أن يكون true لإيقاف البيع مؤقتًا أو false لاستئنافه" };
    }
    patch.sale_paused = body.salePaused;
  }
  if ("capacity" in body) {
    const c = body.capacity;
    if (typeof c !== "number" || !Number.isInteger(c) || c < 1 || c > FOUNDER_CAPACITY_MAX) {
      return { ok: false, error: `عدد المقاعد يجب أن يكون عددًا صحيحًا بين 1 و ${FOUNDER_CAPACITY_MAX}` };
    }
    patch.capacity = c;
  }
  return { ok: true, patch };
}

/** The capacity may not drop below the seats already taken (active + live reserved). */
export function founderCapacityFloorIssue(capacity: number, summary: { active: number; reserved: number }): string | null {
  const taken = summary.active + summary.reserved;
  if (capacity >= taken) return null;
  return `لا يمكن جعل عدد المقاعد ${capacity} أقل من المقاعد المفعّلة والمحجوزة الآن (${taken})`;
}

// ── R24: «إعادة محاولة التفعيل» ──────────────────────────────────────────────

export interface RetryIssue {
  status: 400 | 404 | 409;
  error: string;
}

/**
 * Whether this order may be re-activated: a PAID membership order whose
 * metadata.founder is not 'activated', with a buyer, no money returned and no
 * refund under way (a refund_job other than 'retryable' is processing or done).
 */
export function activationRetryIssue(order: FounderOrderRow | null): RetryIssue | null {
  if (!order) return { status: 404, error: "العملية غير موجودة" };
  if (order.kind !== "membership") return { status: 400, error: "هذه ليست عملية عضوية مؤسس" };
  if (order.status !== "paid") {
    return { status: 409, error: `لا يُعاد تفعيل عملية غير مدفوعة (الحالة: ${order.status})` };
  }
  if (typeof order.refunded_halalas === "number" && order.refunded_halalas > 0) {
    return { status: 409, error: "استُرد مبلغ من هذه العملية — لا يُعاد تفعيلها" };
  }
  if (refundInFlight(order)) {
    return { status: 409, error: "استرداد هذه العملية قيد المعالجة — لا يُعاد تفعيلها" };
  }
  if (order.metadata?.founder === "activated") {
    return { status: 409, error: "العضوية مفعّلة لهذه العملية بالفعل" };
  }
  if (!order.user_id) return { status: 409, error: "حُذف حساب المشتري — يبقى الاسترداد وحده" };
  return null;
}

export type RetryOutcomeKind = "activated" | "already_activated" | "still_refund" | "in_progress" | "failed";

export interface RetryOutcome {
  status: 200 | 409 | 503;
  outcome: RetryOutcomeKind;
  message: string;
  reason?: FounderRefundCase;
}

const ACTIVATED: RetryOutcome = { status: 200, outcome: "activated", message: "تم تفعيل العضوية المؤسِّسة لهذه العملية." };
const ALREADY: RetryOutcome = { status: 200, outcome: "already_activated", message: "العضوية مفعّلة لهذه العملية بالفعل — لم يتغير شيء." };
const IN_PROGRESS: RetryOutcome = {
  status: 409,
  outcome: "in_progress",
  message: "تفعيل هذه العملية جارٍ الآن — أعد المحاولة بعد دقائق.",
};
const UNAVAILABLE: RetryOutcome = { status: 503, outcome: "failed", message: "تعذّر إكمال التفعيل الآن — حاول مجددًا." };

const STILL_REFUND_AR: Readonly<Record<FounderRefundCase, string>> = {
  seat_unavailable: "لم تُفعَّل: لا يوجد مقعد متاح — تبقى العملية بانتظار استرداد.",
  not_verified: "لم تُفعَّل: رخصة المحامي غير موثّقة بعد — تبقى العملية بانتظار استرداد.",
  already_member: "لم تُفعَّل: المشتري عضو مؤسس بعملية أخرى — تبقى العملية بانتظار استرداد.",
};

function stillRefund(reason: FounderRefundCase | null): RetryOutcome {
  return reason
    ? { status: 409, outcome: "still_refund", message: STILL_REFUND_AR[reason], reason }
    : { status: 409, outcome: "still_refund", message: "لم تُفعَّل — تبقى العملية بانتظار استرداد." };
}

const asRefundCase = (v: unknown): FounderRefundCase | null =>
  (FOUNDER_REFUND_REASONS as readonly unknown[]).includes(v) ? (v as FounderRefundCase) : null;

/**
 * founder_activate(p_order)'s answer for an order already stamped fulfilled.
 * `founderAfter` is metadata.founder read after the call: it tells «this
 * order's seat is active» (activated) from «a seat on another order»
 * (already_member). An 'already' with neither is a revoked seat — not an
 * activation.
 */
export function activationAnswer(rpc: unknown, founderAfter: unknown): RetryOutcome {
  switch (rpc) {
    case "activated":
      return ACTIVATED;
    case "full":
      return stillRefund("seat_unavailable");
    case "not_verified":
      return stillRefund("not_verified");
    case "already":
      if (founderAfter === "activated") return ALREADY;
      if (founderAfter === "already_member") return stillRefund("already_member");
      return { status: 409, outcome: "failed", message: "مقعد هذه العملية ملغى — لا يُعاد تفعيله من هنا." };
    case "not_paid":
      return { status: 409, outcome: "failed", message: "العملية ليست مدفوعة — لا يُعاد تفعيلها." };
    default:
      return UNAVAILABLE;
  }
}

/** fulfillOrder({ resume: true })'s answer for a paid order whose stamp never happened. */
export function outcomeFromFulfil(result: { outcome: string; reason?: string }, founderAfter: unknown): RetryOutcome {
  if (result.outcome === "granted") return ACTIVATED;
  if (result.outcome === "already_done") {
    if (result.reason === "already_entitled") return stillRefund(asRefundCase(founderAfter));
    return founderAfter === "activated" ? ALREADY : IN_PROGRESS;
  }
  if (result.outcome === "pending") return result.reason === "fulfilment_in_progress" ? IN_PROGRESS : UNAVAILABLE;
  return {
    status: 409,
    outcome: "failed",
    message: `تعذّر التفعيل${result.reason ? ` (${result.reason.slice(0, 80)})` : ""} — راجع العملية.`,
  };
}

// ── the panel's switch ───────────────────────────────────────────────────────

/** The pause / resume button's label, the confirm question, and the value it posts. */
export function saleToggleCopy(salePaused: boolean): { button: string; confirm: string; next: boolean } {
  return salePaused
    ? {
        button: "استئناف البيع",
        confirm: "استئناف بيع عضوية المؤسس؟ تعود البطاقة للظهور ويُقبل الشراء ما دامت الحملة قائمة وبقيت مقاعد.",
        next: false,
      }
    : {
        button: "إيقاف البيع مؤقتًا",
        confirm:
          "إيقاف بيع عضوية المؤسس مؤقتًا؟ تُخفى البطاقة، ويرى القادم من رابط الحملة «البيع متوقف مؤقتًا». لا يُقبل حجز جديد ولا إعادة محاولة دفع ما دام البيع متوقفًا. العمليات المدفوعة تُفعَّل كالمعتاد، والأعضاء الحاليون لا يتأثرون.",
        next: true,
      };
}
