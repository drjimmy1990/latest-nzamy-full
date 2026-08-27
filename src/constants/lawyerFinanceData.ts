/**
 * lawyerFinanceData — the vocabulary of the lawyer's finance screen. No money
 * figures live here any more.
 *
 * WHAT WAS REMOVED on 27 August 2026, and why:
 *
 * • `INVOICES` — eight invented invoices, ١٢٧,٠٠٠ ر.س of fabricated billings
 *   against named clients. Grep found no importer: /dashboard/lawyer/finance
 *   fetches /api/v1/lawyer/finance and sets `[]` when the body has no array
 *   (page.tsx:148). So this was never a fallback anyone rendered — it was a
 *   fabricated ledger one `|| INVOICES` away from being a lawyer's books.
 * • `EXPENSES`, `Expense`, `ExpenseCategory`, `EXP_CFG` — the whole expenses
 *   feature, deleted as one unit. Nothing outside this file referenced any of
 *   the four. The page's «expenses» tab is now «حركات محفظة المنصة»
 *   (page.tsx:494) — real wallet transactions from the API, which share none of
 *   this shape. There was no office-expenses feature; there was an array
 *   pretending to be one, plus the colours it would have been painted in.
 *
 * WHAT IS DELIBERATELY KEPT: `Invoice` below, even though nothing imports it.
 */
import { CheckCircle, CurrencyCircleDollar, Clock, Warning } from "@phosphor-icons/react";

export type FinanceTab = "overview" | "invoices" | "expenses" | "pl";
export type InvoiceStatus = "paid" | "pending" | "overdue" | "partial";
export type FeeType = "full" | "partial";
export type Period = "monthly" | "quarterly" | "annual";

/**
 * The invoice shape /api/v1/lawyer/finance emits and /dashboard/lawyer/finance
 * renders — kept although no module imports it, because it is the only written
 * record of that contract. `mapPaymentToInvoice` is documented against it by
 * name (src/app/api/v1/lawyer/finance/route.ts:56) and the route's own header
 * points at this file for the `InvoiceStatus` union (route.ts:19), while the
 * page holds its rows as `any[]` (finance/page.tsx:127). Deleting it because
 * the type-checker no longer needs it would leave a live route↔page agreement
 * recorded nowhere at all, and dangle both of those comments.
 *
 * The cost of keeping it is honest and small: an unimported type cannot drift
 * loudly, so treat it as documentation until the page stops using `any` and
 * starts importing it — which is the actual fix.
 */
export interface Invoice {
  id: string; client: string; clientType: "individual" | "company";
  caseTitle: string; desc: string; totalFee: number; paidAmount: number;
  feeType: FeeType; status: InvoiceStatus; date: string;
  month: number; quarter: 1 | 2 | 3 | 4; daysOver?: number;
}

export const STATUS_CFG: Record<InvoiceStatus, { label: string; color: string; icon: any }> = {
  paid:    { label: "مسدّدة كاملاً",  color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
  partial: { label: "مسدّدة جزئياً", color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          icon: CurrencyCircleDollar },
  pending: { label: "معلقة",          color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       icon: Clock },
  overdue: { label: "متأخرة",         color: "text-red-500 bg-red-500/10 border-red-500/20",             icon: Warning },
};
