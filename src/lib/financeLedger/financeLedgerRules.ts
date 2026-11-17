/**
 * financeLedgerRules.ts — the request rules, money arithmetic, DTO mapping and
 * the fee-statement builder of the three finance registers of batch l6-ledger
 * (owner TODO F3/F4; migration 20261126_40_time_trust_expenses.sql):
 *
 *   time_entries          «الوقت»     work on a case and/or a client card
 *   lawyer_expenses       «المصروفات» money the office spent for them
 *   client_trust_ledger   «الأمانات»  money held on behalf of a client
 *
 * Money is integer halalas everywhere (the invoice API's `amountHalalas`
 * too); a time entry's amount is round(minutes × rate / 60), the same formula
 * as the table's generated column. Nothing here guesses a value: a missing
 * rate is 0 (unpriced), never an invented default.
 *
 * Pure (no imports), so `node --test` loads it directly; the routes, the
 * service and the screens share one vocabulary with the table CHECKs.
 */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ── Vocabularies (the table CHECKs) ──────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  "court_fees", "government_fees", "travel", "translation", "notary", "expert", "printing_courier", "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABEL_AR: Record<ExpenseCategory, string> = {
  court_fees: "رسوم قضائية",
  government_fees: "رسوم حكومية",
  travel: "سفر وتنقل",
  translation: "ترجمة",
  notary: "توثيق",
  expert: "خبير",
  printing_courier: "طباعة وبريد",
  other: "أخرى",
};

export const isExpenseCategory = (v: unknown): v is ExpenseCategory =>
  typeof v === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(v);

export const TRUST_KINDS = ["deposit", "disbursement"] as const;
export type TrustKind = (typeof TRUST_KINDS)[number];
export const TRUST_KIND_LABEL_AR: Record<TrustKind, string> = { deposit: "إيداع", disbursement: "صرف" };
export const isTrustKind = (v: unknown): v is TrustKind => v === "deposit" || v === "disbursement";

export const MAX_DESCRIPTION = 1000;
export const MAX_REFERENCE = 200;
export const MIN_VOID_REASON = 3;
export const MAX_VOID_REASON = 500;
export const MAX_DURATION_MIN = 1440;
/** 1,000,000 SAR per hour — the table CHECK; anything above is a typo. */
export const MAX_RATE_HALALAS = 100_000_000;
/** 999,999,999.99 SAR — the table CHECK. */
export const MAX_AMOUNT_HALALAS = 99_999_999_999;
export const LIST_PAGE_SIZE = 500;
const MAX_ID = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Money ────────────────────────────────────────────────────────────────────

/** round(minutes × rate / 60) — the generated column of time_entries. */
export function timeAmountHalalas(durationMin: number, rateHalalas: number): number {
  if (!Number.isFinite(durationMin) || !Number.isFinite(rateHalalas) || durationMin <= 0 || rateHalalas <= 0) return 0;
  return Math.round((durationMin * rateHalalas) / 60);
}

/** Arabic-Indic and Persian digits → ASCII, Arabic decimal/thousands marks → "." / "". */
export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/[٬,\s]/g, "");
}

/**
 * "300", "300.5", "٣٠٠٫٥٠" or 300.5 → halalas. At most 2 decimals; null for
 * anything else (never a rounded guess).
 */
export function sarToHalalas(v: unknown): number | null {
  let s: string;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    s = String(v);
  } else if (typeof v === "string") {
    s = normalizeDigits(v.trim());
  } else {
    return null;
  }
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

/** halalas → "1,234.50" (Latin digits, as the finance page prints amounts). */
export function formatSar(halalas: number): string {
  const n = Math.round(halalas) / 100;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** minutes → "2 س 15 د" */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س ${m} د`;
}

// ── Field parsers ────────────────────────────────────────────────────────────

/** "YYYY-MM-DD", a real calendar day, not before 1990 and not after `todayIso` + 1 day. */
export function parseDay(v: unknown, todayIso: string, label: string): Parsed<string> {
  if (typeof v !== "string" || !DATE_RE.test(v.trim())) return { ok: false, error: `${label} غير صالح.` };
  const d = v.trim();
  const ms = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== d) return { ok: false, error: `${label} غير صالح.` };
  if (d < "1990-01-01") return { ok: false, error: `${label} غير صالح.` };
  const limit = new Date(Date.parse(`${todayIso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (d > limit) return { ok: false, error: `${label} في المستقبل — السجل يقيّد ما حدث فعلاً.` };
  return { ok: true, value: d };
}

function parseDescription(v: unknown): Parsed<string> {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return { ok: false, error: "الوصف مطلوب." };
  if (t.length > MAX_DESCRIPTION) return { ok: false, error: `الوصف يجب ألا يتجاوز ${MAX_DESCRIPTION} حرف.` };
  return { ok: true, value: t };
}

function parseOptionalCase(v: unknown): Parsed<string | null> {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !v.trim() || v.length > MAX_ID) return { ok: false, error: "القضية غير صالحة." };
  return { ok: true, value: v.trim() };
}

function parseOptionalUuid(v: unknown, label: string): Parsed<string | null> {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !UUID_RE.test(v)) return { ok: false, error: `${label} غير صالح.` };
  return { ok: true, value: v.toLowerCase() };
}

function parseDuration(v: unknown): Parsed<number> {
  const n = typeof v === "string" ? Number(normalizeDigits(v)) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_DURATION_MIN) {
    return { ok: false, error: `المدة بالدقائق من 1 إلى ${MAX_DURATION_MIN}.` };
  }
  return { ok: true, value: n };
}

function parseRate(v: unknown): Parsed<number> {
  if (v === undefined || v === null || v === "") return { ok: true, value: 0 };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_RATE_HALALAS) {
    return { ok: false, error: "سعر الساعة غير صالح." };
  }
  return { ok: true, value: v };
}

function parseAmount(v: unknown): Parsed<number> {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > MAX_AMOUNT_HALALAS) {
    return { ok: false, error: "المبلغ غير صالح — أدخل مبلغاً أكبر من صفر." };
  }
  return { ok: true, value: v };
}

function parseBool(v: unknown, fallback: boolean, label: string): Parsed<boolean> {
  if (v === undefined || v === null) return { ok: true, value: fallback };
  if (typeof v !== "boolean") return { ok: false, error: `${label} غير صالح.` };
  return { ok: true, value: v };
}

export function parseVoidReason(v: unknown): Parsed<string> {
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length < MIN_VOID_REASON) return { ok: false, error: "اكتب سبب الإلغاء (3 أحرف على الأقل) — لا يُلغى قيد مالي بلا سبب." };
  if (t.length > MAX_VOID_REASON) return { ok: false, error: `سبب الإلغاء يجب ألا يتجاوز ${MAX_VOID_REASON} حرف.` };
  return { ok: true, value: t };
}

/** A case and/or a client card — at least one. */
function parseTarget(r: Record<string, unknown>): Parsed<{ caseRequestId: string | null; lawyerClientId: string | null }> {
  const c = parseOptionalCase(r.caseRequestId);
  if (!c.ok) return c;
  const k = parseOptionalUuid(r.lawyerClientId, "الموكل");
  if (!k.ok) return k;
  if (!c.value && !k.value) return { ok: false, error: "اختر القضية أو الموكل." };
  return { ok: true, value: { caseRequestId: c.value, lawyerClientId: k.value } };
}

// ── Time entries ─────────────────────────────────────────────────────────────

export interface TimeCreateInput {
  caseRequestId: string | null;
  lawyerClientId: string | null;
  workDate: string;
  durationMin: number;
  description: string;
  hourlyRateHalalas: number;
  billable: boolean;
  workSessionId: string | null;
}

export function parseTimeCreate(raw: unknown, todayIso: string): Parsed<TimeCreateInput> {
  const r = isRecord(raw) ? raw : {};
  const target = parseTarget(r);
  if (!target.ok) return target;
  const workDate = r.workDate === undefined ? { ok: true as const, value: todayIso } : parseDay(r.workDate, todayIso, "تاريخ العمل");
  if (!workDate.ok) return workDate;
  const duration = parseDuration(r.durationMin);
  if (!duration.ok) return duration;
  const description = parseDescription(r.description);
  if (!description.ok) return description;
  const rate = parseRate(r.hourlyRateHalalas);
  if (!rate.ok) return rate;
  const billable = parseBool(r.billable, true, "قابلية الفوترة");
  if (!billable.ok) return billable;
  const session = parseOptionalUuid(r.workSessionId, "جلسة العمل");
  if (!session.ok) return session;
  return {
    ok: true,
    value: {
      ...target.value,
      workDate: workDate.value,
      durationMin: duration.value,
      description: description.value,
      hourlyRateHalalas: rate.value,
      billable: billable.value,
      workSessionId: session.value,
    },
  };
}

export type FinancePatch =
  | { kind: "void"; reason: string }
  | { kind: "edit"; row: Record<string, unknown> };

/** PATCH of a time entry: `{ void: true, reason }` or the editable fields. Case, client and firm never move. */
export function parseTimePatch(raw: unknown, todayIso: string): Parsed<FinancePatch> {
  if (!isRecord(raw)) return { ok: false, error: "لا شيء لتعديله." };
  if (raw.void === true) {
    const reason = parseVoidReason(raw.reason);
    return reason.ok ? { ok: true, value: { kind: "void", reason: reason.value } } : reason;
  }
  const row: Record<string, unknown> = {};
  if ("workDate" in raw) {
    const p = parseDay(raw.workDate, todayIso, "تاريخ العمل");
    if (!p.ok) return p;
    row.work_date = p.value;
  }
  if ("durationMin" in raw) {
    const p = parseDuration(raw.durationMin);
    if (!p.ok) return p;
    row.duration_min = p.value;
  }
  if ("description" in raw) {
    const p = parseDescription(raw.description);
    if (!p.ok) return p;
    row.description = p.value;
  }
  if ("hourlyRateHalalas" in raw) {
    const p = parseRate(raw.hourlyRateHalalas);
    if (!p.ok) return p;
    row.hourly_rate_halalas = p.value;
  }
  if ("billable" in raw) {
    const p = parseBool(raw.billable, true, "قابلية الفوترة");
    if (!p.ok) return p;
    row.billable = p.value;
  }
  if (Object.keys(row).length === 0) return { ok: false, error: "لا شيء لتعديله." };
  return { ok: true, value: { kind: "edit", row } };
}

// ── Expenses ─────────────────────────────────────────────────────────────────

export interface ExpenseCreateInput {
  caseRequestId: string | null;
  lawyerClientId: string | null;
  spentOn: string;
  category: ExpenseCategory;
  description: string;
  amountHalalas: number;
  billable: boolean;
}

export function parseExpenseCreate(raw: unknown, todayIso: string): Parsed<ExpenseCreateInput> {
  const r = isRecord(raw) ? raw : {};
  const target = parseTarget(r);
  if (!target.ok) return target;
  const spentOn = r.spentOn === undefined ? { ok: true as const, value: todayIso } : parseDay(r.spentOn, todayIso, "تاريخ المصروف");
  if (!spentOn.ok) return spentOn;
  if (!isExpenseCategory(r.category)) return { ok: false, error: "اختر تصنيف المصروف." };
  const description = parseDescription(r.description);
  if (!description.ok) return description;
  const amount = parseAmount(r.amountHalalas);
  if (!amount.ok) return amount;
  const billable = parseBool(r.billable, true, "قابلية الفوترة");
  if (!billable.ok) return billable;
  return {
    ok: true,
    value: {
      ...target.value,
      spentOn: spentOn.value,
      category: r.category,
      description: description.value,
      amountHalalas: amount.value,
      billable: billable.value,
    },
  };
}

export function parseExpensePatch(raw: unknown, todayIso: string): Parsed<FinancePatch> {
  if (!isRecord(raw)) return { ok: false, error: "لا شيء لتعديله." };
  if (raw.void === true) {
    const reason = parseVoidReason(raw.reason);
    return reason.ok ? { ok: true, value: { kind: "void", reason: reason.value } } : reason;
  }
  const row: Record<string, unknown> = {};
  if ("spentOn" in raw) {
    const p = parseDay(raw.spentOn, todayIso, "تاريخ المصروف");
    if (!p.ok) return p;
    row.spent_on = p.value;
  }
  if ("category" in raw) {
    if (!isExpenseCategory(raw.category)) return { ok: false, error: "تصنيف المصروف غير صالح." };
    row.category = raw.category;
  }
  if ("description" in raw) {
    const p = parseDescription(raw.description);
    if (!p.ok) return p;
    row.description = p.value;
  }
  if ("amountHalalas" in raw) {
    const p = parseAmount(raw.amountHalalas);
    if (!p.ok) return p;
    row.amount_halalas = p.value;
  }
  if ("billable" in raw) {
    const p = parseBool(raw.billable, true, "قابلية الفوترة");
    if (!p.ok) return p;
    row.billable = p.value;
  }
  if (Object.keys(row).length === 0) return { ok: false, error: "لا شيء لتعديله." };
  return { ok: true, value: { kind: "edit", row } };
}

// ── Trust ledger ─────────────────────────────────────────────────────────────

export interface TrustCreateInput {
  lawyerClientId: string;
  caseRequestId: string | null;
  kind: TrustKind;
  amountHalalas: number;
  occurredOn: string;
  description: string;
  reference: string;
  /** The writer saw «the balance goes below zero» and confirmed. */
  confirmNegative: boolean;
}

export function parseTrustCreate(raw: unknown, todayIso: string): Parsed<TrustCreateInput> {
  const r = isRecord(raw) ? raw : {};
  const client = parseOptionalUuid(r.lawyerClientId, "الموكل");
  if (!client.ok) return client;
  if (!client.value) return { ok: false, error: "الأمانة تُسجَّل لموكل — اختر الموكل." };
  const kase = parseOptionalCase(r.caseRequestId);
  if (!kase.ok) return kase;
  if (!isTrustKind(r.kind)) return { ok: false, error: "اختر نوع الحركة: إيداع أو صرف." };
  const amount = parseAmount(r.amountHalalas);
  if (!amount.ok) return amount;
  const occurredOn = r.occurredOn === undefined ? { ok: true as const, value: todayIso } : parseDay(r.occurredOn, todayIso, "تاريخ الحركة");
  if (!occurredOn.ok) return occurredOn;
  const description = parseDescription(r.description);
  if (!description.ok) return description;
  let reference = "";
  if (r.reference !== undefined && r.reference !== null) {
    if (typeof r.reference !== "string" || r.reference.trim().length > MAX_REFERENCE) {
      return { ok: false, error: `المرجع يجب ألا يتجاوز ${MAX_REFERENCE} حرف.` };
    }
    reference = r.reference.trim();
  }
  return {
    ok: true,
    value: {
      lawyerClientId: client.value,
      caseRequestId: kase.value,
      kind: r.kind,
      amountHalalas: amount.value,
      occurredOn: occurredOn.value,
      description: description.value,
      reference,
      confirmNegative: r.confirmNegative === true,
    },
  };
}

/** The balance after this movement (a deposit adds, a disbursement subtracts). */
export function trustBalanceAfter(balance: number, kind: TrustKind, amount: number): number {
  return kind === "deposit" ? balance + amount : balance - amount;
}

/** A disbursement that takes the balance below zero needs the writer's confirmation. */
export function needsNegativeConfirmation(balance: number, kind: TrustKind, amount: number): boolean {
  return kind === "disbursement" && trustBalanceAfter(balance, kind, amount) < 0;
}

// ── List filters ─────────────────────────────────────────────────────────────

export interface FinanceListFilters {
  caseId: string | null;
  clientId: string | null;
  from: string | null;
  to: string | null;
  includeVoided: boolean;
}

/** Query string → filters. Unknown values are ignored, never trusted. */
export function parseListFilters(get: (name: string) => string | null): FinanceListFilters {
  const caseId = get("caseId");
  const clientId = get("clientId");
  const from = get("from");
  const to = get("to");
  const day = (d: string | null) => (d && DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) ? d : null);
  return {
    caseId: caseId && caseId.trim() && caseId.length <= MAX_ID ? caseId.trim() : null,
    clientId: clientId && UUID_RE.test(clientId) ? clientId.toLowerCase() : null,
    from: day(from),
    to: day(to),
    includeVoided: get("voided") === "1",
  };
}

// ── Rows → DTOs ──────────────────────────────────────────────────────────────

interface CommonRow {
  id: string;
  created_by: string | null;
  firm_id: string | null;
  case_request_id: string | null;
  lawyer_client_id: string | null;
  description: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface TimeRow extends CommonRow {
  work_date: string;
  duration_min: number;
  hourly_rate_halalas: number | string;
  amount_halalas: number | string | null;
  billable: boolean;
  work_session_id: string | null;
  billed_payment_id: string | null;
  billed_at: string | null;
}

export interface ExpenseRow extends CommonRow {
  spent_on: string;
  category: string;
  amount_halalas: number | string;
  billable: boolean;
  receipt_path: string | null;
  billed_payment_id: string | null;
  billed_at: string | null;
}

export interface TrustRow extends CommonRow {
  kind: string;
  amount_halalas: number | string;
  occurred_on: string;
  reference: string;
  negative_ack: boolean;
}

export const TIME_SELECT =
  "id, created_by, firm_id, case_request_id, lawyer_client_id, work_date, duration_min, description, hourly_rate_halalas, amount_halalas, billable, work_session_id, billed_payment_id, billed_at, voided_at, voided_by, void_reason, created_at";
export const EXPENSE_SELECT =
  "id, created_by, firm_id, case_request_id, lawyer_client_id, spent_on, category, description, amount_halalas, billable, receipt_path, billed_payment_id, billed_at, voided_at, voided_by, void_reason, created_at";
export const TRUST_SELECT =
  "id, created_by, firm_id, lawyer_client_id, case_request_id, kind, amount_halalas, occurred_on, description, reference, negative_ack, voided_at, voided_by, void_reason, created_at";

/** bigint arrives from PostgREST as a number (or a string past 2^53, never reached by the CHECKs). */
const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
};

export interface Named {
  caseTitle: string | null;
  clientName: string | null;
  writerName: string | null;
}

export interface CommonDto {
  id: string;
  caseRequestId: string | null;
  lawyerClientId: string | null;
  caseTitle: string | null;
  clientName: string | null;
  writerName: string | null;
  firmId: string | null;
  description: string;
  mine: boolean;
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

function commonDto(r: CommonRow, uid: string, names: Named): CommonDto {
  return {
    id: r.id,
    caseRequestId: r.case_request_id,
    lawyerClientId: r.lawyer_client_id,
    caseTitle: names.caseTitle,
    clientName: names.clientName,
    writerName: names.writerName,
    firmId: r.firm_id,
    description: r.description,
    mine: r.created_by === uid,
    voided: r.voided_at !== null,
    voidedAt: r.voided_at,
    voidReason: r.void_reason,
    createdAt: r.created_at,
  };
}

export interface TimeDto extends CommonDto {
  workDate: string;
  durationMin: number;
  hourlyRateHalalas: number;
  amountHalalas: number;
  billable: boolean;
  billed: boolean;
  billedPaymentId: string | null;
  workSessionId: string | null;
}

export function toTimeDto(r: TimeRow, uid: string, names: Named): TimeDto {
  const rate = num(r.hourly_rate_halalas);
  return {
    ...commonDto(r, uid, names),
    workDate: r.work_date,
    durationMin: r.duration_min,
    hourlyRateHalalas: rate,
    amountHalalas: r.amount_halalas === null || r.amount_halalas === undefined ? timeAmountHalalas(r.duration_min, rate) : num(r.amount_halalas),
    billable: r.billable,
    billed: r.billed_payment_id !== null,
    billedPaymentId: r.billed_payment_id,
    workSessionId: r.work_session_id,
  };
}

export interface ExpenseDto extends CommonDto {
  spentOn: string;
  category: ExpenseCategory | "other";
  amountHalalas: number;
  billable: boolean;
  billed: boolean;
  billedPaymentId: string | null;
  hasReceipt: boolean;
}

export function toExpenseDto(r: ExpenseRow, uid: string, names: Named): ExpenseDto {
  return {
    ...commonDto(r, uid, names),
    spentOn: r.spent_on,
    category: isExpenseCategory(r.category) ? r.category : "other",
    amountHalalas: num(r.amount_halalas),
    billable: r.billable,
    billed: r.billed_payment_id !== null,
    billedPaymentId: r.billed_payment_id,
    hasReceipt: !!r.receipt_path,
  };
}

export interface TrustDto extends CommonDto {
  kind: TrustKind;
  amountHalalas: number;
  occurredOn: string;
  reference: string;
  negativeAck: boolean;
}

export function toTrustDto(r: TrustRow, uid: string, names: Named): TrustDto {
  return {
    ...commonDto(r, uid, names),
    kind: r.kind === "disbursement" ? "disbursement" : "deposit",
    amountHalalas: num(r.amount_halalas),
    occurredOn: r.occurred_on,
    reference: r.reference ?? "",
    negativeAck: r.negative_ack === true,
  };
}

// ── Trust running balance (per client card) ─────────────────────────────────

export interface TrustWithBalance extends TrustDto {
  /** Balance of this client card after this row, counting live rows only (null on a voided row). */
  balanceAfterHalalas: number | null;
}

/**
 * Oldest first per client card, by occurredOn then createdAt. Voided rows keep
 * their place but do not move the balance. The balance is of the rows GIVEN —
 * the screen says so when it shows a partial list.
 */
export function withRunningBalance(rows: readonly TrustDto[]): TrustWithBalance[] {
  const sorted = [...rows].sort((a, b) =>
    a.occurredOn === b.occurredOn ? a.createdAt.localeCompare(b.createdAt) : a.occurredOn.localeCompare(b.occurredOn),
  );
  const balances = new Map<string, number>();
  return sorted.map((r) => {
    const key = r.lawyerClientId ?? "—";
    if (r.voided) return { ...r, balanceAfterHalalas: null };
    const next = trustBalanceAfter(balances.get(key) ?? 0, r.kind, r.amountHalalas);
    balances.set(key, next);
    return { ...r, balanceAfterHalalas: next };
  });
}

// ── Fee statement («بيان أتعاب») ─────────────────────────────────────────────

export interface StatementLine {
  source: "time" | "expense";
  id: string;
  date: string;
  description: string;
  /** time: minutes; expense: null */
  durationMin: number | null;
  /** time: the hourly rate; expense: null */
  rateHalalas: number | null;
  /** expense category label; time: null */
  categoryLabel: string | null;
  amountHalalas: number;
  caseTitle: string | null;
}

export interface FeeStatement {
  from: string | null;
  to: string | null;
  timeLines: StatementLine[];
  expenseLines: StatementLine[];
  totalMinutes: number;
  timeTotalHalalas: number;
  expenseTotalHalalas: number;
  totalHalalas: number;
  /** Rows in the period that are NOT on the statement, and why. */
  excluded: { voided: number; notBillable: number; alreadyBilled: number };
  /** time entries without an hourly rate (amount 0) — the screen warns. */
  unpricedTimeCount: number;
}

const inPeriod = (d: string, from: string | null, to: string | null) => (!from || d >= from) && (!to || d <= to);

/**
 * The statement of the given rows for [from, to]: billable, live, not yet
 * billed. Everything else is counted in `excluded`, never silently dropped.
 */
export function buildFeeStatement(
  time: readonly TimeDto[],
  expenses: readonly ExpenseDto[],
  from: string | null,
  to: string | null,
): FeeStatement {
  const excluded = { voided: 0, notBillable: 0, alreadyBilled: 0 };
  const keep = (r: { voided: boolean; billable: boolean; billed: boolean }) => {
    if (r.voided) { excluded.voided++; return false; }
    if (!r.billable) { excluded.notBillable++; return false; }
    if (r.billed) { excluded.alreadyBilled++; return false; }
    return true;
  };
  const timeLines: StatementLine[] = time
    .filter((t) => inPeriod(t.workDate, from, to))
    .filter(keep)
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.createdAt.localeCompare(b.createdAt))
    .map((t) => ({
      source: "time",
      id: t.id,
      date: t.workDate,
      description: t.description,
      durationMin: t.durationMin,
      rateHalalas: t.hourlyRateHalalas,
      categoryLabel: null,
      amountHalalas: t.amountHalalas,
      caseTitle: t.caseTitle,
    }));
  const expenseLines: StatementLine[] = expenses
    .filter((e) => inPeriod(e.spentOn, from, to))
    .filter(keep)
    .sort((a, b) => a.spentOn.localeCompare(b.spentOn) || a.createdAt.localeCompare(b.createdAt))
    .map((e) => ({
      source: "expense",
      id: e.id,
      date: e.spentOn,
      description: e.description,
      durationMin: null,
      rateHalalas: null,
      categoryLabel: EXPENSE_CATEGORY_LABEL_AR[e.category] ?? EXPENSE_CATEGORY_LABEL_AR.other,
      amountHalalas: e.amountHalalas,
      caseTitle: e.caseTitle,
    }));
  const timeTotalHalalas = timeLines.reduce((s, l) => s + l.amountHalalas, 0);
  const expenseTotalHalalas = expenseLines.reduce((s, l) => s + l.amountHalalas, 0);
  return {
    from,
    to,
    timeLines,
    expenseLines,
    totalMinutes: timeLines.reduce((s, l) => s + (l.durationMin ?? 0), 0),
    timeTotalHalalas,
    expenseTotalHalalas,
    totalHalalas: timeTotalHalalas + expenseTotalHalalas,
    excluded,
    unpricedTimeCount: timeLines.filter((l) => !l.rateHalalas).length,
  };
}

/**
 * The invoice idempotency key of a statement: the same lines with the same
 * amounts → the same key, so a retry after a lost reply (or after a failed
 * «mark billed» step) returns the SAME invoice instead of issuing a second.
 * Any changed line or amount → a new key. 8..100 characters (the API's rule).
 */
export function statementIdempotencyKey(lines: readonly Pick<StatementLine, "source" | "id" | "amountHalalas">[]): string {
  const canon = lines
    .map((l) => `${l.source}:${l.id}:${l.amountHalalas}`)
    .sort()
    .join("|");
  // FNV-1a, two independent 32-bit lanes → 16 hex characters.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ canon.length;
  for (let i = 0; i < canon.length; i++) {
    const c = canon.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `fee-stmt-${lines.length}-${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** The invoice description of a statement (the invoice API caps it at 2000). */
export function statementInvoiceDescription(s: FeeStatement, subject: string): string {
  const period = s.from || s.to ? ` (${s.from ?? "…"} → ${s.to ?? "…"})` : "";
  const parts = [`بيان أتعاب: ${subject}${period}`];
  if (s.timeLines.length) parts.push(`${s.timeLines.length} قيد وقت، ${formatDuration(s.totalMinutes)} — ${formatSar(s.timeTotalHalalas)} ر.س`);
  if (s.expenseLines.length) parts.push(`${s.expenseLines.length} مصروف — ${formatSar(s.expenseTotalHalalas)} ر.س`);
  return parts.join(" · ").slice(0, 2000);
}

/** The body of the mark-billed call: which rows went into which invoice. */
export function parseMarkBilled(raw: unknown): Parsed<{ paymentId: string; timeIds: string[]; expenseIds: string[] }> {
  const r = isRecord(raw) ? raw : {};
  if (typeof r.paymentId !== "string" || !r.paymentId.trim() || r.paymentId.length > MAX_ID) {
    return { ok: false, error: "الفاتورة غير صالحة." };
  }
  const ids = (v: unknown): string[] | null => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > LIST_PAGE_SIZE) return null;
    const out: string[] = [];
    for (const x of v) {
      if (typeof x !== "string" || !UUID_RE.test(x)) return null;
      out.push(x.toLowerCase());
    }
    return [...new Set(out)];
  };
  const timeIds = ids(r.timeIds);
  const expenseIds = ids(r.expenseIds);
  if (!timeIds || !expenseIds) return { ok: false, error: "القيود غير صالحة." };
  if (timeIds.length + expenseIds.length === 0) return { ok: false, error: "لا قيود في البيان." };
  return { ok: true, value: { paymentId: r.paymentId.trim(), timeIds, expenseIds } };
}

/** Riyadh calendar day of an instant, "YYYY-MM-DD". */
export function riyadhDay(ms: number): string {
  return new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
}
