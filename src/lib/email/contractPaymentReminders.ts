/**
 * contractPaymentReminders.ts — the pure half of POST
 * /api/v1/cron/contract-payment-reminders (owner TODO N01-10, package 19 O24,
 * batch l11-remind): the installments of a contract's payment schedule
 * (public.contract_payments, 20260905 phase 3 — label, amount_sar, due_on,
 * status pending / paid / overdue / cancelled) remind the contract's lawyer
 * (contracts.owner_user_id) in the app and by e-mail:
 *
 *   due      an unpaid installment whose due date is Riyadh today .. +3 days
 *            (kinds contract_pay_due / contract_pay_due_app);
 *   overdue  an unpaid installment whose due date has passed — at most
 *            OVERDUE_LOOKBACK_DAYS ago, so the first run does not e-mail every
 *            old unpaid installment at once (contract_pay_overdue / _app).
 *   Each ONCE per (installment, due date, recipient) and channel
 *   (public.email_reminder_log, 20261201_45). A re-dated installment is a new
 *   reminder. «Unpaid» is status pending or overdue — the same rule as the
 *   «متأخرة» badge on the contract page (contractDates.isPaymentOverdue).
 *   Installments of a cancelled or terminated contract are not reminded; a
 *   draft or expired contract's still are (the badge shows them too).
 *
 * OWNER ٤٥: the e-mail is GENERIC — a payment in one of your contracts is due
 * / overdue, open it in the platform. No client, no contract title, no
 * installment label, no amount. The e-mail builder takes only the stage and
 * the date, never the row. The in-app notice names the installment.
 *
 * Relative imports only: `node --test` loads it (contractPaymentReminders.test.ts).
 */

import { toArabicDigits } from "../services/arabicCount.ts";
import { daysBetween } from "./poaEmailReminders.ts";
import { renderEmailAr, siteLink, REMINDER_FOOTER_AR, type EmailEnv } from "./sendEmail.ts";
import type { InAppNotice } from "./reminderDelivery.ts";

export const PAYMENT_DUE_SOON_DAYS = 3;
export const OVERDUE_LOOKBACK_DAYS = 30;
export const PAYMENT_UNPAID_STATUSES = ["pending", "overdue"] as const;
export const CONTRACT_CLOSED_STATUSES = ["cancelled", "terminated"] as const;

/** The columns the route reads. `label` feeds the IN-APP notice only. */
export interface ContractPaymentRow {
  id: string;
  contract_id: string;
  label: string | null;
  due_on: string | null;
  status: string | null;
  /** The embedded contract (many-to-one; PostgREST may hand back an array). */
  contracts:
    | { owner_user_id: string | null; status: string | null }
    | Array<{ owner_user_id: string | null; status: string | null }>
    | null;
}

/**
 * The route's select list (pinned by a test): no amount, no notes, no
 * contract title or counterparty.
 */
export const CONTRACT_PAYMENT_COLUMNS = "id, contract_id, label, due_on, status, contracts!inner(owner_user_id, status)";

export type PaymentStage = "due" | "overdue";

export interface PlannedPaymentReminder {
  payment: ContractPaymentRow;
  contractId: string;
  ownerId: string;
  stage: PaymentStage;
  /** Days from today to the due date (negative when overdue). */
  daysLeft: number;
  dueOn: string;
}

function embedded(c: ContractPaymentRow["contracts"]) {
  if (Array.isArray(c)) return c[0] ?? null;
  return c ?? null;
}

/** Which installments remind whom today. */
export function planPaymentReminders(rows: readonly ContractPaymentRow[], today: string): PlannedPaymentReminder[] {
  const out: PlannedPaymentReminder[] = [];
  for (const p of rows) {
    if (!p?.id || !p.contract_id || !p.due_on) continue;
    if (!p.status || !(PAYMENT_UNPAID_STATUSES as readonly string[]).includes(p.status)) continue;
    const contract = embedded(p.contracts);
    const ownerId = contract?.owner_user_id;
    if (!ownerId) continue;
    if (contract?.status && (CONTRACT_CLOSED_STATUSES as readonly string[]).includes(contract.status)) continue;
    const d = daysBetween(today, p.due_on);
    if (d === null) continue;
    let stage: PaymentStage;
    if (d >= 0 && d <= PAYMENT_DUE_SOON_DAYS) stage = "due";
    else if (d < 0 && d >= -OVERDUE_LOOKBACK_DAYS) stage = "overdue";
    else continue;
    out.push({ payment: p, contractId: p.contract_id, ownerId, stage, daysLeft: d, dueOn: p.due_on });
  }
  return out;
}

function whenAr(daysLeft: number): string {
  if (daysLeft <= 0) return "اليوم";
  if (daysLeft === 1) return "غداً";
  if (daysLeft === 2) return "بعد يومين";
  return `بعد ${toArabicDigits(String(daysLeft))} أيام`;
}

/** The Arabic e-mail of one installment reminder — generic, no client or contract data (owner ٤٥). */
export function paymentEmailMessage(
  stage: PaymentStage,
  daysLeft: number,
  dueOn: string,
  contractId: string,
  env: EmailEnv = process.env,
  dashboardRoot: "/dashboard/lawyer" | "/dashboard/firm" = "/dashboard/lawyer",
): { subject: string; html: string; text: string } {
  const href = siteLink(`${dashboardRoot}/contracts/${encodeURIComponent(contractId)}`, env);
  const overdue = stage === "overdue";
  const { html, text } = renderEmailAr({
    heading: overdue
      ? "لديك دفعة متأخرة في أحد عقودك — افتحها من نظامي"
      : "لديك دفعة مستحقة في أحد عقودك — افتحها من نظامي",
    paragraphs: [
      overdue
        ? "تجاوزت دفعةٌ من دفعات أحد عقودك موعدها ولم تُسجَّل مدفوعة بعد."
        : `يحلّ موعد دفعةٍ من دفعات أحد عقودك ${whenAr(daysLeft)}.`,
      "تفاصيل العقد والموكل لا تُرسل بالبريد حفاظاً على سريتها؛ افتح العقد من حسابك في نظامي لمتابعة التحصيل أو تسجيل السداد.",
    ],
    details: [["تاريخ الاستحقاق", toArabicDigits(dueOn)]],
    action: href ? { label: "افتح العقد في نظامي", href } : null,
    footer: REMINDER_FOOTER_AR,
  });
  return {
    subject: overdue ? "تذكير: دفعة متأخرة في أحد عقودك" : `تذكير: دفعة مستحقة ${whenAr(daysLeft)} في أحد عقودك`,
    html,
    text,
  };
}

function shortLabel(label: string | null | undefined): string {
  const t = (label ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "دفعة";
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

/** The in-app notice of one installment reminder (inside the platform: it names the installment). */
export function paymentInAppNotice(
  r: PlannedPaymentReminder,
  dashboardRoot: "/dashboard/lawyer" | "/dashboard/firm" = "/dashboard/lawyer",
): InAppNotice {
  const date = toArabicDigits(r.dueOn);
  return r.stage === "overdue"
    ? {
        title: `دفعة متأخرة: ${shortLabel(r.payment.label)}`,
        body: `تجاوزت هذه الدفعة موعدها (${date}) ولم تُسجَّل مدفوعة بعد.`,
        href: `${dashboardRoot}/contracts/${encodeURIComponent(r.contractId)}`,
      }
    : {
        title: `دفعة مستحقة: ${shortLabel(r.payment.label)}`,
        body: `يحلّ موعد هذه الدفعة ${whenAr(r.daysLeft)} (${date}). سجّل السداد عند استلامه.`,
        href: `${dashboardRoot}/contracts/${encodeURIComponent(r.contractId)}`,
      };
}
