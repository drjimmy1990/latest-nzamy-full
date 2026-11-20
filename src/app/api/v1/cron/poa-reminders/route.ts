import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { emailConfigured } from "@/lib/email/sendEmail";
import {
  dashboardRootFor,
  emptyEmailReport,
  loadEmailRecipients,
  riyadhDayPlus,
  sendReminderOnce,
  type EmailStepReport,
} from "@/lib/email/reminderDelivery";
import {
  planPoaReminders,
  poaEmailMessage,
  POA_EMAIL_COLUMNS,
  POA_ENDED_STATUSES,
  POA_HORIZON_DAYS,
  type PoaContractRow,
} from "@/lib/email/poaEmailReminders";

/**
 * POST /api/v1/cron/poa-reminders — power-of-attorney expiry BY E-MAIL, 30 and
 * 7 days before its end (owner TODO N05-L14).
 *
 *   1. contracts with contract_type 'power_of_attorney', not expired /
 *      terminated / cancelled, whose ends_on falls Riyadh today .. +30 days
 *      (paged, capped);
 *   2. planPoaReminders (src/lib/email/poaEmailReminders.ts): 7 when 0..7
 *      days are left, 30 when 8..30 — only the latest stage;
 *   3. per contract owner: skipped when he turned e-mail (or the «reminders»
 *      category) off or has no address; else claim → send → record in
 *      public.email_reminder_log (20261125_20) — each stage once per end date.
 *
 * Without e-mail set up (SMTP or Resend): 200 {skipped: "email_unavailable"},
 * nothing read or written. Before 20261125_20 runs: 200
 * {skipped: "schema_missing"}, nothing sent.
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches).
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Once a day (e.g. 09:00 Riyadh): n8n Schedule Trigger → HTTP Request
 * POST https://nezamy.sa/api/v1/cron/poa-reminders, header x-cron-secret.
 */

export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_CONTRACTS = 5000;

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report: EmailStepReport = emptyEmailReport();
  if (!emailConfigured(process.env)) {
    return NextResponse.json({ ...report, skipped: "email_unavailable" });
  }

  const admin = await createServiceClient();
  const now = new Date();
  const today = riyadhDayPlus(now, 0);
  const horizon = riyadhDayPlus(now, POA_HORIZON_DAYS);

  // 1. powers of attorney ending within 30 days
  const rows: PoaContractRow[] = [];
  for (let offset = 0; offset < MAX_CONTRACTS; offset += PAGE) {
    const { data, error } = await admin
      .from("contracts")
      // Owner ٤٥: no title / counterparty — the e-mail carries no client data.
      .select(POA_EMAIL_COLUMNS)
      .eq("contract_type", "power_of_attorney")
      .not("status", "in", `(${POA_ENDED_STATUSES.join(",")})`)
      .not("owner_user_id", "is", null)
      .gte("ends_on", today)
      .lte("ends_on", horizon)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[cron/poa-reminders] contracts:", error.code, error.message);
      return NextResponse.json({ ...report, ok: false, error: "contracts_failed" }, { status: 500 });
    }
    const page = (data ?? []) as PoaContractRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  // 2. which stage is due
  const due = planPoaReminders(rows, today);
  report.due = due.length;
  if (due.length === 0) return NextResponse.json({ ...report, date: today, contracts: rows.length });

  // 3. addresses + mute, then claim → send → record
  const lookup = await loadEmailRecipients(admin, due.map((r) => r.contract.owner_user_id as string), ["reminders"]);
  if (lookup.error) {
    console.error("[cron/poa-reminders] recipients:", lookup.error);
    return NextResponse.json({ ...report, ok: false, error: "recipients_failed" }, { status: 500 });
  }
  report.muted = lookup.muted;
  report.noAddress = lookup.noAddress;

  for (const r of due) {
    const owner = r.contract.owner_user_id as string;
    const to = lookup.addresses.get(owner);
    if (!to) continue;
    const outcome = await sendReminderOnce(
      admin,
      { kind: r.offset === 7 ? "poa_7d" : "poa_30d", subjectId: r.contract.id, recipientUserId: owner, dueOn: r.contract.ends_on as string },
      { to, ...poaEmailMessage(r, process.env, dashboardRootFor(lookup.userTypes.get(owner))) },
    );
    if (outcome === "schema_missing") return NextResponse.json({ ...report, skipped: "schema_missing" });
    if (outcome === "sent") report.sent++;
    else if (outcome === "already") report.already++;
    else report.failed++;
  }

  return NextResponse.json({ ...report, date: today, contracts: rows.length });
}
