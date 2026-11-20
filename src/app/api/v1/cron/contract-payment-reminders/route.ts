import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { emailConfigured } from "@/lib/email/sendEmail";
import {
  dashboardRootFor,
  emptyEmailReport,
  loadEmailRecipients,
  loadUserTypes,
  notifyReminderOnce,
  riyadhDayPlus,
  sendReminderOnce,
  type EmailStepReport,
} from "@/lib/email/reminderDelivery";
import {
  CONTRACT_PAYMENT_COLUMNS,
  OVERDUE_LOOKBACK_DAYS,
  PAYMENT_DUE_SOON_DAYS,
  PAYMENT_UNPAID_STATUSES,
  paymentEmailMessage,
  paymentInAppNotice,
  planPaymentReminders,
  type ContractPaymentRow,
  type PlannedPaymentReminder,
} from "@/lib/email/contractPaymentReminders";

/**
 * POST /api/v1/cron/contract-payment-reminders — contract installments due
 * soon or overdue (owner TODO N01-10, package 19 O24, batch l11-remind).
 *
 *   1. unpaid installments (public.contract_payments, status pending /
 *      overdue) whose due date is Riyadh today − 30 .. today + 3 days, with
 *      their contract's owner and status (paged, capped);
 *   2. planPaymentReminders (src/lib/email/contractPaymentReminders.ts):
 *      «due» when 0..3 days are left, «overdue» when the date passed (at most
 *      30 days ago); a cancelled or terminated contract is skipped. Recipient:
 *      the contract's lawyer (contracts.owner_user_id);
 *   3. IN-APP: one notice per (installment, due date, stage, recipient) —
 *      kinds contract_pay_due_app / contract_pay_overdue_app
 *      (notifyReminderOnce). Runs whether or not e-mail is set up;
 *   4. E-MAIL: generic (owner ٤٥: no client, title, label or amount), skipped
 *      for an account that turned e-mail or the «reminders» / «financial»
 *      category off or has no address; kinds contract_pay_due /
 *      contract_pay_overdue, once each. Without e-mail set up (SMTP or Resend):
 *      email {skipped: "email_unavailable"}.
 *
 * Before 20261201_45 runs: 200 {skipped: "schema_missing"}, nothing sent.
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches).
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Once a day (e.g. 09:00 Riyadh): n8n Schedule Trigger → HTTP Request
 * POST https://nezamy.sa/api/v1/cron/contract-payment-reminders, header
 * x-cron-secret. Hourly is harmless (once-only).
 */

export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_PAYMENTS = 5000;

type Admin = Awaited<ReturnType<typeof createServiceClient>>;

interface InAppReport {
  sent: number;
  already: number;
  failed: number;
  skipped?: "schema_missing";
}

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const now = new Date();
  const today = riyadhDayPlus(now, 0);
  const from = riyadhDayPlus(now, -OVERDUE_LOOKBACK_DAYS);
  const to = riyadhDayPlus(now, PAYMENT_DUE_SOON_DAYS);

  // 1. unpaid installments in the window
  const rows: ContractPaymentRow[] = [];
  for (let offset = 0; offset < MAX_PAYMENTS; offset += PAGE) {
    const { data, error } = await admin
      .from("contract_payments")
      // Owner ٤٥: no amount / notes / contract title / counterparty are read;
      // `label` is used by the in-app notice only.
      .select(CONTRACT_PAYMENT_COLUMNS)
      .in("status", [...PAYMENT_UNPAID_STATUSES])
      .gte("due_on", from)
      .lte("due_on", to)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[cron/contract-payment-reminders] payments:", error.code, error.message);
      return NextResponse.json({ ok: false, error: "payments_failed" }, { status: 500 });
    }
    const page = (data ?? []) as unknown as ContractPaymentRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  // 2. which stage is due, for whom
  const planned = planPaymentReminders(rows, today);
  if (planned.length === 0) {
    return NextResponse.json({ ok: true, date: today, payments: rows.length, due: 0, inApp: { sent: 0, already: 0, failed: 0 }, email: emptyEmailReport() });
  }

  // 3. in-app
  const inApp = await sendInApp(admin, planned);
  if (inApp.skipped === "schema_missing") {
    return NextResponse.json({ ok: true, skipped: "schema_missing", date: today, payments: rows.length, due: planned.length });
  }

  // 4. e-mail
  const email = await sendEmails(admin, planned);

  return NextResponse.json({ ok: true, date: today, payments: rows.length, due: planned.length, inApp, email });
}

async function sendInApp(admin: Admin, planned: PlannedPaymentReminder[]): Promise<InAppReport> {
  const report: InAppReport = { sent: 0, already: 0, failed: 0 };
  const types = await loadUserTypes(admin, planned.map((p) => p.ownerId));
  for (const p of planned) {
    const outcome = await notifyReminderOnce(
      admin,
      {
        kind: p.stage === "overdue" ? "contract_pay_overdue_app" : "contract_pay_due_app",
        subjectId: p.payment.id,
        recipientUserId: p.ownerId,
        dueOn: p.dueOn,
      },
      paymentInAppNotice(p, dashboardRootFor(types.get(p.ownerId))),
    );
    if (outcome === "schema_missing") return { ...report, skipped: "schema_missing" };
    if (outcome === "sent") report.sent++;
    else if (outcome === "already") report.already++;
    else report.failed++;
  }
  return report;
}

async function sendEmails(admin: Admin, planned: PlannedPaymentReminder[]): Promise<EmailStepReport> {
  const report = emptyEmailReport();
  if (!emailConfigured(process.env)) return { ...report, skipped: "email_unavailable" };
  report.due = planned.length;
  const lookup = await loadEmailRecipients(admin, planned.map((p) => p.ownerId), ["reminders", "financial"]);
  if (lookup.error) {
    console.error("[cron/contract-payment-reminders] recipients:", lookup.error);
    return { ...report, ok: false, error: "recipients_failed" };
  }
  report.muted = lookup.muted;
  report.noAddress = lookup.noAddress;
  for (const p of planned) {
    const addr = lookup.addresses.get(p.ownerId);
    if (!addr) continue;
    const outcome = await sendReminderOnce(
      admin,
      {
        kind: p.stage === "overdue" ? "contract_pay_overdue" : "contract_pay_due",
        subjectId: p.payment.id,
        recipientUserId: p.ownerId,
        dueOn: p.dueOn,
      },
      // Owner ٤٥: only the stage, the date and the contract link — never the row.
      {
        to: addr,
        ...paymentEmailMessage(p.stage, p.daysLeft, p.dueOn, p.contractId, process.env, dashboardRootFor(lookup.userTypes.get(p.ownerId))),
      },
    );
    if (outcome === "schema_missing") return { ...report, skipped: "schema_missing" };
    if (outcome === "sent") report.sent++;
    else if (outcome === "already") report.already++;
    else report.failed++;
  }
  return report;
}
