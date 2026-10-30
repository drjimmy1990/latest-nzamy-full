/**
 * invoiceFinanceCore.ts — the writes behind POST and PATCH
 * /api/v1/lawyer/finance (owner handoff 2026-10-30, CODE-F01, CODE-F02 /
 * LIVE-F36). The route (src/app/api/v1/lawyer/finance/route.ts) checks the
 * session and role, builds the service client and calls these; the tests
 * (invoiceFinanceCore.test.ts) drive them with a fake service client. The
 * rules themselves live in SQL — public.create_lawyer_invoice
 * (supabase/migrations/20261030_20_create_invoice_atomic.sql) and
 * public.record_invoice_collection (20261030_10_invoice_collections_atomic.sql)
 * — and supabase/tests/rls/invoice_collections.test.sql proves them there.
 *
 * CODE-F01 — POST accepted a `requestId` and hung a payments row on it through
 *   the service role without asking whose request it was; PATCH asked. Now the
 *   request must be assigned to the caller before anything is written. A
 *   missing request and someone else's request get the same 403 body, so the
 *   answer says nothing about whose request it is or whether it exists.
 *
 * CODE-F22 — the placeholder request and the payments row were two writes
 *   with no transaction and no key: a lost response left an orphan, a retry a
 *   duplicate. Both now happen in one SQL function, once per form key.
 *
 * CODE-F21 (scoped to finance) — the invoice may name a CRM card and a case
 *   by id; the card's name and type are read on the server. A typed client
 *   needs an explicit type: the page no longer sends "company" for everyone.
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

const isHalalas = (v: unknown, min: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= MAX_HALALAS;

/** PostgREST / Postgres codes for "this function does not exist (yet)". */
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);

export interface FinanceDeps {
  /** The service-role client (payments has no INSERT/UPDATE policy). */
  admin: SupabaseClient;
}

// ─── POST — issue a manual invoice ──────────────────────────────────────────

export const LEGACY_CREATE_BODY_AR =
  "تغيّرت طريقة إصدار الفواتير في المنصة. حدّث الصفحة ثم أصدر الفاتورة من جديد.";
export const CREATE_UNAVAILABLE_AR =
  "إصدار الفواتير غير متاح مؤقتاً. لم تُنشأ أي فاتورة — حاول بعد قليل.";
export const CREATE_KEY_REUSED_AR =
  "لم يُصدَر شيء: هذا الطلب يكرّر طلب إصدار سابقاً ببيانات مختلفة (غالباً عُدِّل النموذج بعد انقطاع الرد). راجع قائمة الفواتير أولاً — إن ظهرت الفاتورة السابقة فلا حاجة لغيرها، وإلا فاضغط «حفظ» مرة أخرى لإصدارها بالبيانات الحالية.";
export const CREATE_INVALID_AR =
  "بيانات الفاتورة غير مكتملة: اختر الموكّل من دليلك أو اكتب اسمه وحدّد نوعه (فرد أو شركة)، وأدخل أتعاباً أكبر من صفر.";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateInvoiceBody {
  idempotencyKey: string;
  amountHalalas: number;
  /** A CRM card (lawyer_clients.id); its name and type win over the typed ones. */
  clientId: string | null;
  client: string | null;
  clientType: "individual" | "company" | null;
  /** A case of this lawyer the invoice refers to (a reference, not its parent). */
  caseId: string | null;
  /** An existing request of this lawyer the invoice hangs on (CODE-F01). */
  requestId: string | null;
  description: string | null;
  feeType: "full" | "partial" | null;
  caseTitle: string | null;
}

/** null for absent/empty, the string itself, or false for any other type. */
const optString = (v: unknown): string | null | false =>
  v === undefined || v === null || v === "" ? null : typeof v === "string" ? v : false;

/**
 * Every field's type is checked here; whether the request, the case and the
 * card belong to this lawyer is checked by the SQL function, in the same
 * transaction as the inserts.
 */
export function parseCreateBody(
  body: unknown,
): { ok: true; value: CreateInvoiceBody } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  // A page loaded before this change sends `amount` in riyals and no key. A
  // retry of such a request could not be recognised, so it is refused.
  if (
    typeof b.idempotencyKey !== "string" ||
    b.idempotencyKey.length < 8 ||
    b.idempotencyKey.length > 100 ||
    b.amountHalalas === undefined
  ) {
    return { ok: false, error: LEGACY_CREATE_BODY_AR };
  }
  if (!isHalalas(b.amountHalalas, 1)) return { ok: false, error: CREATE_INVALID_AR };

  const raw = {
    clientId: optString(b.clientId),
    client: optString(b.client),
    clientType: optString(b.clientType),
    caseId: optString(b.caseId),
    requestId: optString(b.requestId),
    description: optString(b.description),
    feeType: optString(b.feeType),
    caseTitle: optString(b.caseTitle),
  };
  for (const [k, v] of Object.entries(raw)) {
    if (v === false) return { ok: false, error: `${k} must be a string` };
  }
  const f = raw as Record<keyof typeof raw, string | null>;
  if (f.clientId !== null && !UUID_RE.test(f.clientId)) return { ok: false, error: CREATE_INVALID_AR };
  if (f.clientType !== null && f.clientType !== "individual" && f.clientType !== "company") {
    return { ok: false, error: CREATE_INVALID_AR };
  }
  if (f.feeType !== null && f.feeType !== "full" && f.feeType !== "partial") {
    return { ok: false, error: CREATE_INVALID_AR };
  }
  // No card: a typed name and an explicit type. The page used to send
  // clientType "company" for everyone (CODE-F21).
  if (f.clientId === null && (!f.client?.trim() || f.clientType === null)) {
    return { ok: false, error: CREATE_INVALID_AR };
  }
  return {
    ok: true,
    value: {
      idempotencyKey: b.idempotencyKey,
      amountHalalas: b.amountHalalas,
      clientId: f.clientId,
      client: f.client?.trim() ?? null,
      clientType: f.clientType as CreateInvoiceBody["clientType"],
      caseId: f.caseId,
      requestId: f.requestId,
      description: f.description,
      feeType: f.feeType as CreateInvoiceBody["feeType"],
      caseTitle: f.caseTitle,
    },
  };
}

export interface CreateInvoiceInput {
  userId: string;
  body: unknown;
}

/**
 * CODE-F01 / CODE-F22: one call to public.create_lawyer_invoice
 * (20261030_20), which checks ownership and writes the placeholder request
 * and the payments row in ONE transaction, once per idempotency key. A
 * refused call writes nothing; a repeated form gets the same invoice back.
 */
export async function createInvoiceWith(
  deps: FinanceDeps,
  input: CreateInvoiceInput,
): Promise<FinanceReply> {
  const parsed = parseCreateBody(input.body);
  if (!parsed.ok) return fail(400, parsed.error);
  const c = parsed.value;

  const { data, error } = await deps.admin.rpc("create_lawyer_invoice", {
    p_actor: input.userId,
    p_idempotency_key: c.idempotencyKey,
    p_amount_halalas: c.amountHalalas,
    p_client_name: c.client,
    p_client_type: c.clientType,
    p_lawyer_client_id: c.clientId,
    p_case_id: c.caseId,
    p_request_id: c.requestId,
    p_description: c.description,
    p_fee_type: c.feeType,
    p_case_title: c.caseTitle,
  });

  if (error) {
    // Never fall back to the old two-step write: that is CODE-F22.
    if (MISSING_FUNCTION.has(String(error.code ?? ""))) {
      console.error(
        "[lawyer/finance POST] create_lawyer_invoice is missing — run 20261030_20_create_invoice_atomic.sql",
      );
      return fail(503, CREATE_UNAVAILABLE_AR);
    }
    console.error("[lawyer/finance POST] create_lawyer_invoice failed:", error.message);
    return fail(500, "Failed to create invoice");
  }

  const r = (data ?? {}) as { code?: string; replay?: boolean; payment?: Record<string, unknown> };
  switch (r.code) {
    case "ok":
      if (!r.payment) return fail(500, "Failed to create invoice");
      return { status: 200, row: r.payment, replay: r.replay === true };
    case "forbidden":
      // Same body for a missing and a foreign request / case / card.
      return fail(403, "Forbidden");
    case "key_reused":
      return fail(409, CREATE_KEY_REUSED_AR);
    case "invalid":
      return fail(400, CREATE_INVALID_AR);
    default:
      console.error("[lawyer/finance POST] unexpected result:", r.code);
      return fail(500, "Failed to create invoice");
  }
}

// ─── PATCH — record one collected payment ───────────────────────────────────

export interface CollectBody {
  paymentId: string;
  method: CollectMethod;
  amountHalalas: number;
  expectedPaidHalalas: number;
  idempotencyKey: string;
}

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
