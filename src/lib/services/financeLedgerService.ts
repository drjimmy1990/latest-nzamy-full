/**
 * financeLedgerService.ts — the browser half of the l6-ledger registers:
 * «الوقت» (/api/v1/lawyer/time-entries), «المصروفات» (/api/v1/lawyer/expenses),
 * «الأمانات» (/api/v1/lawyer/trust) and «بيان أتعاب» (/api/v1/lawyer/fee-statement).
 *
 * «تحويل إلى فاتورة» uses the invoice call that already exists
 * (POST /api/v1/lawyer/finance — owned by the invoice batch, not changed
 * here) with an idempotency key derived from the statement's lines, then
 * stamps the lines with the invoice id.
 */

import { apiGet, apiMutate } from "@/lib/services/api";
import { isDemoMode } from "@/lib/runtimeMode";
import type {
  ExpenseDto, FeeStatement, TimeDto, TrustDto,
} from "@/lib/financeLedger/financeLedgerRules";
import { statementIdempotencyKey, statementInvoiceDescription } from "@/lib/financeLedger/financeLedgerRules";

export interface ListFilter {
  caseId?: string;
  clientId?: string;
  from?: string;
  to?: string;
  voided?: boolean;
}

const q = (f: ListFilter) => ({
  caseId: f.caseId || undefined,
  clientId: f.clientId || undefined,
  from: f.from || undefined,
  to: f.to || undefined,
  voided: f.voided ? "1" : undefined,
});

// ── time ──
export async function listTimeEntries(f: ListFilter = {}) {
  return apiGet<{ data: TimeDto[]; truncated: boolean }>("/api/v1/lawyer/time-entries", q(f));
}
export async function createTimeEntry(body: Record<string, unknown>) {
  return (await apiMutate<{ data: TimeDto }>("/api/v1/lawyer/time-entries", "POST", body)).data;
}
export async function patchTimeEntry(id: string, body: Record<string, unknown>) {
  return (await apiMutate<{ data: TimeDto }>(`/api/v1/lawyer/time-entries/${encodeURIComponent(id)}`, "PATCH", body)).data;
}

// ── expenses ──
export async function listExpenses(f: ListFilter = {}) {
  return apiGet<{ data: ExpenseDto[]; truncated: boolean }>("/api/v1/lawyer/expenses", q(f));
}
export async function createExpense(body: Record<string, unknown>) {
  return (await apiMutate<{ data: ExpenseDto }>("/api/v1/lawyer/expenses", "POST", body)).data;
}
export async function patchExpense(id: string, body: Record<string, unknown>) {
  return (await apiMutate<{ data: ExpenseDto }>(`/api/v1/lawyer/expenses/${encodeURIComponent(id)}`, "PATCH", body)).data;
}
export async function uploadExpenseReceipt(id: string, file: File): Promise<void> {
  if (isDemoMode) throw new Error("وضع العرض التجريبي محلي بالكامل: لا يُرفع أي ملف.");
  const form = new FormData();
  form.set("file", file);
  const res = await fetch(`/api/v1/lawyer/expenses/${encodeURIComponent(id)}/receipt`, {
    method: "POST",
    body: form,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "تعذّر رفع الإيصال.");
  }
}
export async function receiptUrl(id: string): Promise<string> {
  return (await apiGet<{ url: string }>(`/api/v1/lawyer/expenses/${encodeURIComponent(id)}/receipt`)).url;
}

// ── trust ──
export async function listTrust(f: ListFilter = {}) {
  return apiGet<{ data: TrustDto[]; truncated: boolean; balances: Record<string, number> }>("/api/v1/lawyer/trust", q(f));
}

/** The 409 «the balance goes below zero» — resend with confirmNegative: true. */
export class TrustNegativeError extends Error {
  constructor(message: string, readonly balanceHalalas: number, readonly afterHalalas: number) {
    super(message);
    this.name = "TrustNegativeError";
  }
}

export async function createTrustEntry(body: Record<string, unknown>): Promise<{ data: TrustDto; balanceHalalas: number }> {
  if (isDemoMode) throw new Error("وضع العرض التجريبي محلي بالكامل: لا يُرسَل أي حفظ إلى الخادم.");
  const res = await fetch("/api/v1/lawyer/trust", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 409 && json.code === "trust_negative") {
    throw new TrustNegativeError(String(json.error ?? ""), Number(json.balanceHalalas ?? 0), Number(json.afterHalalas ?? 0));
  }
  if (!res.ok) throw new Error(String(json.error ?? "تعذّر حفظ حركة الأمانة."));
  return json as unknown as { data: TrustDto; balanceHalalas: number };
}
export async function voidTrustEntry(id: string, reason: string) {
  return (await apiMutate<{ data: TrustDto }>(`/api/v1/lawyer/trust/${encodeURIComponent(id)}`, "PATCH", { void: true, reason })).data;
}

// ── fee statement ──
export interface FeeStatementRead {
  subject: { caseId: string | null; caseTitle: string | null; clientId: string | null; clientName: string | null };
  statement: FeeStatement;
  scope: "own" | "firm";
  truncated: boolean;
  invoiceClientId: string | null;
}

export async function getFeeStatement(f: ListFilter) {
  return (await apiGet<{ data: FeeStatementRead }>("/api/v1/lawyer/fee-statement", q(f))).data;
}

/**
 * «تحويل إلى فاتورة»: one invoice for the statement's total through the
 * existing invoice API, then the lines are stamped with it. The key is the
 * statement's own (same lines + amounts → same key), so pressing again after
 * a lost reply or a failed stamp returns the SAME invoice, never a second.
 */
export async function convertStatementToInvoice(read: FeeStatementRead): Promise<{ invoiceId: string; stamped: number; requested: number }> {
  const s = read.statement;
  const lines = [...s.timeLines, ...s.expenseLines];
  if (!read.invoiceClientId) throw new Error("لا موكل مرتبط بهذا البيان — اربط القضية ببطاقة موكل أولاً.");
  if (lines.length === 0 || s.totalHalalas <= 0) throw new Error("لا مبالغ في البيان لتحويلها إلى فاتورة.");
  const subject = read.subject.caseTitle ?? read.subject.clientName ?? "موكل";
  let created: { data: { id: string } };
  try {
    created = await apiMutate<{ data: { id: string } }>("/api/v1/lawyer/finance", "POST", {
      idempotencyKey: statementIdempotencyKey(lines),
      amountHalalas: s.totalHalalas,
      clientId: read.invoiceClientId,
      caseId: read.subject.caseId ?? undefined,
      caseTitle: read.subject.caseTitle ?? undefined,
      description: statementInvoiceDescription(s, subject),
      feeType: "full",
    });
  } catch (err) {
    // The invoice function (20261124_40) issues only for the case's assignee
    // who also owns the client card — say so instead of a bare "Forbidden".
    if (err instanceof Error && err.message === "Forbidden") {
      throw new Error("تصدر الفاتورة باسم المحامي المسندة إليه القضية وصاحب بطاقة الموكل — اطلب منه التحويل، أو اطبع البيان.");
    }
    throw err;
  }
  const invoiceId = String(created?.data?.id ?? "");
  if (!invoiceId) throw new Error("صدرت الفاتورة لكن لم يصل رقمها — افتح «إدارة بيانات الأتعاب» للتحقق قبل إعادة المحاولة.");
  const stamped = await apiMutate<{ data: { time: number; expenses: number; requested: number } }>(
    "/api/v1/lawyer/fee-statement/billed",
    "POST",
    {
      paymentId: invoiceId,
      timeIds: s.timeLines.map((l) => l.id),
      expenseIds: s.expenseLines.map((l) => l.id),
    },
  );
  return { invoiceId, stamped: stamped.data.time + stamped.data.expenses, requested: stamped.data.requested };
}

// ── pomodoro sessions (the existing timer) → time entries ──
export interface RecentSession {
  id: string;
  mode: string;
  startedAt: string;
  durationMin: number;
  label: string;
}
export async function listRecentFocusSessions(): Promise<RecentSession[]> {
  const res = await apiGet<{ data: RecentSession[] }>("/api/v1/lawyer/work-sessions", { limit: 30 });
  return (res.data ?? []).filter((s) => s.mode === "focus");
}
