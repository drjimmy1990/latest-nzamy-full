/**
 * invoiceFinanceCore.ts — the writes behind POST and PATCH
 * /api/v1/lawyer/finance (owner handoff 2026-10-30, CODE-F01, CODE-F02 /
 * LIVE-F36). The route (src/app/api/v1/lawyer/finance/route.ts) checks the
 * session and role, builds the service client and calls these; the tests
 * (invoiceFinanceCore.test.ts) drive them with a fake service client. The
 * collection rules themselves live in SQL — public.record_invoice_collection
 * (supabase/migrations/20261030_10_invoice_collections_atomic.sql) — and
 * supabase/tests/rls/invoice_collections.test.sql proves them there.
 *
 * CODE-F01 — POST accepted a `requestId` and hung a payments row on it through
 *   the service role without asking whose request it was; PATCH asked. Now the
 *   request must be assigned to the caller before anything is written. A
 *   missing request and someone else's request get the same 403 body, so the
 *   answer says nothing about whose request it is or whether it exists.
 *
 * CODE-F02 / LIVE-F36 — the page sent a cumulative `paidAmount` it had
 *   computed from what the form showed when it was opened, and the route
 *   stored it. Two forms opened at 450 paid: the first saved 300 (→ 750), the
 *   second saved 400 over the 250 left (→ 850) and erased the first payment.
 *   Now the browser sends only THIS payment, in halalas, plus the paid amount
 *   its form showed (`expectedPaidHalalas`) and a key made when the form
 *   opened. The SQL function locks the invoice row, refuses a form whose
 *   snapshot is no longer true, refuses more than the remainder, adds the
 *   payment, and writes one public.invoice_collections row per payment. A
 *   repeat of the same key is answered with the first result, not a second
 *   payment.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** The payments columns the finance page's invoice mapper reads. */
export const PAYMENT_COLUMNS =
  "id, request_id, provider, amount, currency, status, metadata, created_at";

export const COLLECT_METHODS = ["cash", "bank_transfer"] as const;
export type CollectMethod = (typeof COLLECT_METHODS)[number];

/** numeric(12,2) holds at most 9,999,999,999.99 riyals. */
const MAX_HALALAS = 999_999_999_999;

export const LEGACY_COLLECT_BODY_AR =
  "تغيّرت طريقة تسجيل التحصيل في المنصة. حدّث الصفحة ثم سجّل الدفعة من جديد.";
export const COLLECT_UNAVAILABLE_AR =
  "تسجيل التحصيل غير متاح مؤقتاً. لم يُسجَّل أي مبلغ — حاول بعد قليل.";
export const KEY_REUSED_AR =
  "تعذّر قبول هذا الطلب لأنه يكرّر طلباً سابقاً بمبلغ مختلف. أغلق النموذج وافتحه من جديد.";

const sar = (halalas: number) =>
  (halalas / 100).toLocaleString("ar-SA", { maximumFractionDigits: 2 });

/** The form's snapshot is out of date: another payment was recorded after it opened. */
export function staleFormAr(paidHalalas: number, remainingHalalas: number): string {
  return (
    `سُجّلت دفعة أخرى على هذه الفاتورة بعد فتحك هذا النموذج، فلم تُسجَّل دفعتك. ` +
    `المحصّل الآن ${sar(paidHalalas)} ر.س والمتبقي ${sar(remainingHalalas)} ر.س — ` +
    `راجع المبلغ ثم سجّله من جديد.`
  );
}

export function exceedsRemainingAr(remainingHalalas: number): string {
  return `المبلغ أكبر من المتبقي على الفاتورة (${sar(remainingHalalas)} ر.س). لم يُسجَّل أي مبلغ.`;
}

export type FinanceReply =
  | { status: 200; row: Record<string, unknown>; replay?: boolean }
  | { status: 400 | 403 | 404 | 409 | 500 | 503; body: { error: string } };

const fail = (status: 400 | 403 | 404 | 409 | 500 | 503, error: string): FinanceReply => ({
  status,
  body: { error },
});

export interface FinanceDeps {
  /** The service-role client (payments has no INSERT/UPDATE policy). */
  admin: SupabaseClient;
}

// ─── POST — issue a manual invoice ──────────────────────────────────────────

export interface CreateInvoiceInput {
  userId: string;
  body: unknown;
}

/**
 * Validates, checks ownership of a supplied `requestId`, then writes.
 * Every refusal happens before the first insert, so a refused call leaves
 * no placeholder request and no payments row behind.
 */
export async function createInvoiceWith(
  deps: FinanceDeps,
  input: CreateInvoiceInput,
): Promise<FinanceReply> {
  const b = (input.body ?? {}) as Record<string, unknown>;
  const client = typeof b.client === "string" ? b.client : undefined;
  const description = typeof b.description === "string" ? b.description : undefined;
  const feeType = typeof b.feeType === "string" ? b.feeType : undefined;
  const caseTitle = typeof b.caseTitle === "string" ? b.caseTitle : undefined;
  const clientType = typeof b.clientType === "string" ? b.clientType : undefined;
  const amount = b.amount;

  if (!client || !client.trim() || amount === undefined || amount === null) {
    return fail(400, "client and amount required");
  }

  const feeNum = Number(amount);
  if (Number.isNaN(feeNum)) return fail(400, "amount must be a number");
  // `payments.amount` has no CHECK constraint, so a negative fee was accepted
  // and then subtracted from every total on the page — including «إجمالي
  // الأتعاب المستحقة», which a lawyer may quote. There is no void or edit
  // control on that page, so a bad row could not be taken back.
  if (!Number.isFinite(feeNum) || feeNum <= 0) {
    return fail(400, "amount must be greater than zero");
  }

  if (b.requestId !== undefined && b.requestId !== null && typeof b.requestId !== "string") {
    return fail(400, "requestId must be a string");
  }
  const suppliedRequestId = typeof b.requestId === "string" && b.requestId ? b.requestId : null;

  const service = deps.admin;

  // CODE-F01: a supplied request must be assigned to this lawyer — the same
  // rule PATCH and GET apply. Missing and foreign answer identically.
  if (suppliedRequestId) {
    const { data: owned, error: ownErr } = await service
      .from("service_requests")
      .select("assigned_to")
      .eq("id", suppliedRequestId)
      .maybeSingle();
    if (ownErr) {
      console.error("[lawyer/finance POST] ownership read failed:", ownErr.message);
      return fail(500, "Failed to create invoice");
    }
    if (!owned || (owned as { assigned_to?: unknown }).assigned_to !== input.userId) {
      return fail(403, "Forbidden");
    }
  }

  // 1) Create (or reuse) a placeholder service_request to satisfy
  //    payments.request_id NOT NULL FK.
  let reqId = suppliedRequestId;
  if (!reqId) {
    const reqIdGen = crypto.randomUUID();
    const { data: reqRow, error: reqErr } = await service
      .from("service_requests")
      .insert({
        id: reqIdGen,
        requester_user_id: input.userId,
        type: "service",
        title: `فاتورة: ${client.trim()}`,
        description: description || "",
        requester: { name: client.trim(), role: "client", tier: "free" },
        receiver: "lawyer",
        assigned_to: input.userId,
        status: "completed",
        payment: { amount: feeNum, status: "not_required" },
        source_path: "",
        metadata: { invoice: true },
      })
      .select("id")
      .single();
    if (reqErr || !reqRow) {
      return fail(500, reqErr?.message || "Failed to create invoice request");
    }
    reqId = String((reqRow as { id: unknown }).id);
  }

  // 2) Insert the payment row.
  const paymentMeta: Record<string, unknown> = {
    invoice: true,
    client: client.trim(),
    description: description || "أتعاب قانونية",
    issued_by: input.userId,
    feeType: feeType || "full",
  };
  if (caseTitle) paymentMeta.caseTitle = caseTitle;
  if (clientType) paymentMeta.clientType = clientType;

  const { data: paymentRow, error: payErr } = await service
    .from("payments")
    .insert({
      id: crypto.randomUUID(),
      request_id: reqId,
      provider: "manual",
      amount: feeNum,
      currency: "SAR",
      status: "requires_payment",
      metadata: paymentMeta,
    })
    .select(PAYMENT_COLUMNS)
    .single();

  if (payErr || !paymentRow) {
    return fail(500, payErr?.message || "Failed to create payment");
  }
  return { status: 200, row: paymentRow as Record<string, unknown> };
}

// ─── PATCH — record one collected payment ───────────────────────────────────

export interface CollectBody {
  paymentId: string;
  method: CollectMethod;
  amountHalalas: number;
  expectedPaidHalalas: number;
  idempotencyKey: string;
}

const isHalalas = (v: unknown, min: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= MAX_HALALAS;

/**
 * Every field is required. In particular there is no "omit the amount to
 * settle in full" any more, and no way to skip the snapshot: either one would
 * let a form opened before another payment settle from a view that is no
 * longer true.
 */
export function parseCollectBody(
  body: unknown,
): { ok: true; value: CollectBody } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  // A page loaded before this change still sends the cumulative total. It is
  // refused outright — reading it as a payment amount would book the running
  // total a second time.
  if (b.paidAmount !== undefined && b.amountHalalas === undefined) {
    return { ok: false, error: LEGACY_COLLECT_BODY_AR };
  }

  if (typeof b.paymentId !== "string" || !b.paymentId) {
    return { ok: false, error: "paymentId required" };
  }
  const method = b.method ?? "cash";
  if (method !== "cash" && method !== "bank_transfer") {
    return { ok: false, error: "method must be cash or bank_transfer" };
  }
  if (!isHalalas(b.amountHalalas, 1)) {
    return {
      ok: false,
      error: "amountHalalas must be a whole number of halalas greater than 0",
    };
  }
  if (!isHalalas(b.expectedPaidHalalas, 0)) {
    return { ok: false, error: LEGACY_COLLECT_BODY_AR };
  }
  if (
    typeof b.idempotencyKey !== "string" ||
    b.idempotencyKey.length < 8 ||
    b.idempotencyKey.length > 100
  ) {
    return { ok: false, error: LEGACY_COLLECT_BODY_AR };
  }
  return {
    ok: true,
    value: {
      paymentId: b.paymentId,
      method,
      amountHalalas: b.amountHalalas,
      expectedPaidHalalas: b.expectedPaidHalalas,
      idempotencyKey: b.idempotencyKey,
    },
  };
}

export interface CollectInput {
  userId: string;
  body: unknown;
}

/** What public.record_invoice_collection answers (one jsonb object). */
interface CollectionResult {
  code?: string;
  paid_halalas?: number;
  remaining_halalas?: number;
  replay?: boolean;
  payment?: Record<string, unknown>;
}

/** PostgREST / Postgres codes for "this function does not exist (yet)". */
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);

export async function recordCollectionWith(
  deps: FinanceDeps,
  input: CollectInput,
): Promise<FinanceReply> {
  const parsed = parseCollectBody(input.body);
  if (!parsed.ok) return fail(400, parsed.error);
  const c = parsed.value;

  const { data, error } = await deps.admin.rpc("record_invoice_collection", {
    p_payment_id: c.paymentId,
    p_actor: input.userId,
    p_amount_halalas: c.amountHalalas,
    p_method: c.method,
    p_expected_paid_halalas: c.expectedPaidHalalas,
    p_idempotency_key: c.idempotencyKey,
  });

  if (error) {
    // Never fall back to the old read-then-overwrite: that is the defect.
    if (MISSING_FUNCTION.has(String(error.code ?? ""))) {
      console.error(
        "[lawyer/finance PATCH] record_invoice_collection is missing — run 20261030_10_invoice_collections_atomic.sql",
      );
      return fail(503, COLLECT_UNAVAILABLE_AR);
    }
    console.error("[lawyer/finance PATCH] record_invoice_collection failed:", error.message);
    return fail(500, "Failed to update payment");
  }

  const r = (data ?? {}) as CollectionResult;
  switch (r.code) {
    case "ok":
      if (!r.payment) return fail(500, "Failed to update payment");
      return { status: 200, row: r.payment, replay: r.replay === true };
    case "not_found":
      return fail(404, "Invoice not found");
    case "forbidden":
      return fail(403, "Forbidden");
    case "not_collectable":
      return fail(409, "Invoice is not collectable");
    case "stale":
      return fail(409, staleFormAr(Number(r.paid_halalas ?? 0), Number(r.remaining_halalas ?? 0)));
    case "exceeds_remaining":
      return fail(409, exceedsRemainingAr(Number(r.remaining_halalas ?? 0)));
    case "key_reused":
      return fail(409, KEY_REUSED_AR);
    case "invalid":
      return fail(400, "amountHalalas must be a whole number of halalas greater than 0");
    default:
      console.error("[lawyer/finance PATCH] unexpected result:", r.code);
      return fail(500, "Failed to update payment");
  }
}
