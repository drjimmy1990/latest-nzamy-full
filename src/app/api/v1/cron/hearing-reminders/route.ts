import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { emailConfigured } from "@/lib/email/sendEmail";
import {
  emptyEmailReport,
  loadEmailRecipients,
  riyadhDayPlus,
  sendReminderOnce,
  type EmailStepReport,
} from "@/lib/email/reminderDelivery";
import {
  assigneesToCheck,
  hearingEmailMessage,
  hearingEmailRecipients,
  memberKey,
  type HearingEmailRow,
} from "@/lib/email/hearingEmailReminders";

/**
 * POST /api/v1/cron/hearing-reminders — the day-before hearing reminder BY
 * E-MAIL (owner TODO N01-16).
 *
 *   1. every SCHEDULED hearing dated Riyadh tomorrow (paged, capped);
 *   2. recipients: the owner, and the assignee (hearings.assignee_user_id,
 *      20261124_50) only while he is an ACTIVE member of the hearing's firm
 *      (src/lib/email/hearingEmailReminders.ts);
 *   3. per recipient: skipped when he turned e-mail (or the «hearing»
 *      category) off or has no address; else claim → send → record in
 *      public.email_reminder_log (20261125_20) — once per hearing date and
 *      recipient, whatever the number of runs.
 *
 * The in-app hearing reminders stay where they are (/api/v1/cron/deadlines).
 *
 * Without RESEND_API_KEY + EMAIL_FROM: 200 {skipped: "email_unavailable"},
 * nothing read or written — no reminder is used up before e-mail is set up.
 * Before 20261125_20 runs: 200 {skipped: "schema_missing"}, nothing sent.
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches). Unset
 * secret or a wrong header → 401.
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Once a day, in the Riyadh morning (e.g. 09:00): n8n Schedule Trigger →
 * HTTP Request POST https://nezamy.sa/api/v1/cron/hearing-reminders with
 * header x-cron-secret. Hourly is harmless (once-only per recipient) and also
 * catches a hearing added during the day for tomorrow.
 */

export const dynamic = "force-dynamic";

const PAGE = 1000;
/** At most this many hearings a run (tomorrow's — a day never comes close). */
const MAX_HEARINGS = 3000;
const ID_CHUNK = 150;

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
  const tomorrow = riyadhDayPlus(now, 1);

  // 1. tomorrow's scheduled hearings
  const hearings: HearingEmailRow[] = [];
  for (let offset = 0; offset < MAX_HEARINGS; offset += PAGE) {
    const { data, error } = await admin
      .from("hearings")
      .select("id, owner_user_id, assignee_user_id, firm_id, title, hearing_date, hearing_time, court_name, location, status")
      .eq("status", "scheduled")
      .eq("hearing_date", tomorrow)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[cron/hearing-reminders] hearings:", error.code, error.message);
      return NextResponse.json({ ...report, ok: false, error: "hearings_failed" }, { status: 500 });
    }
    const page = (data ?? []) as HearingEmailRow[];
    hearings.push(...page);
    if (page.length < PAGE) break;
  }
  if (hearings.length === 0) return NextResponse.json({ ...report, date: tomorrow, hearings: 0 });

  // 2. which assignees are still active members of the hearing's firm
  const activeMembers = new Set<string>();
  const toCheck = assigneesToCheck(hearings);
  const firmIds = Array.from(new Set(toCheck.map((c) => c.firmId)));
  const userIds = Array.from(new Set(toCheck.map((c) => c.userId)));
  for (let i = 0; i < userIds.length; i += ID_CHUNK) {
    const { data, error } = await admin
      .from("firm_members")
      .select("firm_id, user_id")
      .eq("status", "active")
      .in("firm_id", firmIds)
      .in("user_id", userIds.slice(i, i + ID_CHUNK));
    if (error) {
      // Fail closed for assignees only: the owners are still e-mailed.
      console.error("[cron/hearing-reminders] firm_members:", error.code, error.message);
      activeMembers.clear();
      report.error = "assignee_check_failed";
      break;
    }
    for (const m of (data ?? []) as Array<{ firm_id: string; user_id: string }>) activeMembers.add(memberKey(m.firm_id, m.user_id));
  }

  const planned = hearings.flatMap((h) => hearingEmailRecipients(h, activeMembers).map((r) => ({ h, ...r })));
  report.due = planned.length;

  // 3. addresses + mute, then claim → send → record
  const lookup = await loadEmailRecipients(admin, planned.map((p) => p.userId), ["hearing"]);
  if (lookup.error) {
    console.error("[cron/hearing-reminders] recipients:", lookup.error);
    return NextResponse.json({ ...report, ok: false, error: "recipients_failed" }, { status: 500 });
  }
  report.muted = lookup.muted;
  report.noAddress = lookup.noAddress;

  for (const p of planned) {
    const to = lookup.addresses.get(p.userId);
    if (!to) continue;
    const outcome = await sendReminderOnce(
      admin,
      { kind: "hearing_1d", subjectId: p.h.id, recipientUserId: p.userId, dueOn: p.h.hearing_date },
      { to, ...hearingEmailMessage(p.h, p.via) },
    );
    if (outcome === "schema_missing") return NextResponse.json({ ...report, skipped: "schema_missing" });
    if (outcome === "sent") report.sent++;
    else if (outcome === "already") report.already++;
    else report.failed++;
  }

  return NextResponse.json({ ...report, date: tomorrow, hearings: hearings.length });
}
