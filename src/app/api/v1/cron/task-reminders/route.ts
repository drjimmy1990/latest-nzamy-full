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
  TASK_OPEN_STATUSES,
  TASK_REMINDER_COLUMNS,
  planTaskReminders,
  taskAssigneesToCheck,
  taskEmailMessage,
  taskInAppNotice,
  taskMemberKey,
  type PlannedTaskReminder,
  type TaskReminderRow,
} from "@/lib/email/taskReminders";

/**
 * POST /api/v1/cron/task-reminders — tasks due within a day (owner TODO
 * N01-15, batch l11-remind).
 *
 *   1. every open task (todo / in_progress) whose due_date is Riyadh today or
 *      tomorrow (paged, capped);
 *   2. recipients: the owner, and the assignee only while he is an ACTIVE
 *      member of the task's firm (src/lib/email/taskReminders.ts);
 *   3. IN-APP: one notice per (task, due date, recipient) — claim → insert →
 *      record in public.email_reminder_log, kind task_due_1d_app
 *      (notifyReminderOnce). Runs whether or not e-mail is set up;
 *   4. E-MAIL: generic (owner ٤٥: no task title, case or client), skipped for
 *      an account that turned e-mail or the «reminders» category off or has
 *      no address; once per (task, due date, recipient), kind task_due_1d.
 *      Without RESEND_API_KEY + EMAIL_FROM: email {skipped:
 *      "email_unavailable"}, nothing written for it.
 *
 * Before 20261201_45 runs the claim is refused (the old kind CHECK) and the
 * route answers 200 {skipped: "schema_missing"} — nothing is sent on either
 * channel, so nothing can repeat.
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches). Unset
 * secret or a wrong header → 401.
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Once a day in the Riyadh morning (e.g. 08:00): n8n Schedule Trigger → HTTP
 * Request POST https://nezamy.sa/api/v1/cron/task-reminders, header
 * x-cron-secret. Hourly is harmless (once-only per recipient and due date)
 * and also catches a task added during the day for today or tomorrow.
 */

export const dynamic = "force-dynamic";

const PAGE = 1000;
/** At most this many tasks a run (two days' worth — never close). */
const MAX_TASKS = 5000;
const ID_CHUNK = 150;

type Admin = Awaited<ReturnType<typeof createServiceClient>>;

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const now = new Date();
  const today = riyadhDayPlus(now, 0);
  const tomorrow = riyadhDayPlus(now, 1);

  // 1. open tasks due today or tomorrow
  const tasks: TaskReminderRow[] = [];
  for (let offset = 0; offset < MAX_TASKS; offset += PAGE) {
    const { data, error } = await admin
      .from("tasks")
      .select(TASK_REMINDER_COLUMNS)
      .in("status", [...TASK_OPEN_STATUSES])
      .gte("due_date", today)
      .lte("due_date", tomorrow)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[cron/task-reminders] tasks:", error.code, error.message);
      return NextResponse.json({ ok: false, error: "tasks_failed" }, { status: 500 });
    }
    const page = (data ?? []) as TaskReminderRow[];
    tasks.push(...page);
    if (page.length < PAGE) break;
  }
  if (tasks.length === 0) {
    return NextResponse.json({ ok: true, date: today, tasks: 0, due: 0, inApp: emptyInApp(), email: emptyEmailReport() });
  }

  // 2. which assignees are still active members of the task's firm
  const activeMembers = new Set<string>();
  let assigneeCheck: string | undefined;
  const toCheck = taskAssigneesToCheck(tasks);
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
      // Fail closed for assignees only: the owners are still reminded.
      console.error("[cron/task-reminders] firm_members:", error.code, error.message);
      activeMembers.clear();
      assigneeCheck = "assignee_check_failed";
      break;
    }
    for (const m of (data ?? []) as Array<{ firm_id: string; user_id: string }>) activeMembers.add(taskMemberKey(m.firm_id, m.user_id));
  }

  const planned = planTaskReminders(tasks, today, tomorrow, activeMembers);

  // 3. in-app
  const inApp = await sendInApp(admin, planned);
  if (inApp.skipped === "schema_missing") {
    return NextResponse.json({ ok: true, skipped: "schema_missing", date: today, tasks: tasks.length, due: planned.length });
  }

  // 4. e-mail
  const email = await sendEmails(admin, planned);

  return NextResponse.json({
    ok: true,
    date: today,
    tasks: tasks.length,
    due: planned.length,
    ...(assigneeCheck ? { error: assigneeCheck } : {}),
    inApp,
    email,
  });
}

interface InAppReport {
  sent: number;
  already: number;
  failed: number;
  skipped?: "schema_missing";
}

function emptyInApp(): InAppReport {
  return { sent: 0, already: 0, failed: 0 };
}

async function sendInApp(admin: Admin, planned: PlannedTaskReminder[]): Promise<InAppReport> {
  const report = emptyInApp();
  if (planned.length === 0) return report;
  const types = await loadUserTypes(admin, planned.map((p) => p.userId));
  for (const p of planned) {
    const outcome = await notifyReminderOnce(
      admin,
      { kind: "task_due_1d_app", subjectId: p.task.id, recipientUserId: p.userId, dueOn: p.dueOn },
      taskInAppNotice(p, dashboardRootFor(types.get(p.userId))),
    );
    if (outcome === "schema_missing") return { ...report, skipped: "schema_missing" };
    if (outcome === "sent") report.sent++;
    else if (outcome === "already") report.already++;
    else report.failed++;
  }
  return report;
}

async function sendEmails(admin: Admin, planned: PlannedTaskReminder[]): Promise<EmailStepReport> {
  const report = emptyEmailReport();
  if (!emailConfigured(process.env)) return { ...report, skipped: "email_unavailable" };
  if (planned.length === 0) return report;
  report.due = planned.length;
  const lookup = await loadEmailRecipients(admin, planned.map((p) => p.userId), ["reminders"]);
  if (lookup.error) {
    console.error("[cron/task-reminders] recipients:", lookup.error);
    return { ...report, ok: false, error: "recipients_failed" };
  }
  report.muted = lookup.muted;
  report.noAddress = lookup.noAddress;
  for (const p of planned) {
    const to = lookup.addresses.get(p.userId);
    if (!to) continue;
    const outcome = await sendReminderOnce(
      admin,
      { kind: "task_due_1d", subjectId: p.task.id, recipientUserId: p.userId, dueOn: p.dueOn },
      // Owner ٤٥: only who / when / the date — never the task row.
      { to, ...taskEmailMessage(p.via, p.when, p.dueOn, process.env, dashboardRootFor(lookup.userTypes.get(p.userId))) },
    );
    if (outcome === "schema_missing") return { ...report, skipped: "schema_missing" };
    if (outcome === "sent") report.sent++;
    else if (outcome === "already") report.already++;
    else report.failed++;
  }
  return report;
}
