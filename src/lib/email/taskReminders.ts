/**
 * taskReminders.ts — the pure half of POST /api/v1/cron/task-reminders
 * (owner TODO N01-15, batch l11-remind): a task that falls due Riyadh TODAY or
 * TOMORROW (tasks.due_date is a plain date — «within the next 24 hours» read
 * on whole days) is reminded to its OWNER and to its ASSIGNEE, in the app and
 * by e-mail, ONCE per (task, due date, recipient) and channel
 * (public.email_reminder_log, kinds task_due_1d and task_due_1d_app,
 * 20261201_45). A task reminded yesterday as «tomorrow» is not reminded again
 * today: the due date is the key. A re-dated task is a new reminder.
 *
 * Open tasks only: status todo / in_progress (done and archived are not).
 *
 * The assignee is reminded only while he may still read the task — he is an
 * ACTIVE member of the task's firm (tasks.firm_id; the tasks route only lets a
 * manager assign a member of his own roster). The hearing reminders use the
 * same rule (hearingEmailReminders.ts).
 *
 * OWNER ٤٥: the e-mail is GENERIC — «لديك مهمة مستحقة غداً — افتحها من
 * نظامي» and a link to the tasks page; no task title, no case, no client. The
 * e-mail builder takes only who / when / the date, never the row. The in-app
 * notice (inside the platform, like every other in-app reminder) names the
 * task.
 *
 * Relative imports only: `node --test` loads it (taskReminders.test.ts).
 */

import { toArabicDigits } from "../services/arabicCount.ts";
import { renderEmailAr, siteLink, REMINDER_FOOTER_AR, type EmailEnv } from "./sendEmail.ts";
import type { InAppNotice } from "./reminderDelivery.ts";

export const TASK_OPEN_STATUSES = ["todo", "in_progress"] as const;

/** The columns the route reads. `title` feeds the IN-APP notice only. */
export interface TaskReminderRow {
  id: string;
  owner_user_id: string | null;
  assignee_user_id: string | null;
  firm_id: string | null;
  title: string | null;
  due_date: string | null;
  status: string | null;
}

/** The route's select list, kept next to the row type (pinned by a test). */
export const TASK_REMINDER_COLUMNS = "id, owner_user_id, assignee_user_id, firm_id, title, due_date, status";

export type TaskReminderVia = "owner" | "assignee";
export type TaskDueWhen = "today" | "tomorrow";

/** The key of an active firm membership in the set the route builds. */
export const taskMemberKey = (firmId: string, userId: string) => `${firmId}|${userId}`;

export interface PlannedTaskReminder {
  task: TaskReminderRow;
  userId: string;
  via: TaskReminderVia;
  when: TaskDueWhen;
  dueOn: string;
}

/** The assignees whose firm membership the route must check. */
export function taskAssigneesToCheck(rows: readonly TaskReminderRow[]): Array<{ firmId: string; userId: string }> {
  const seen = new Set<string>();
  const out: Array<{ firmId: string; userId: string }> = [];
  for (const t of rows) {
    const a = t.assignee_user_id;
    if (!a || a === t.owner_user_id || !t.firm_id) continue;
    const k = taskMemberKey(t.firm_id, a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ firmId: t.firm_id, userId: a });
  }
  return out;
}

/**
 * Who is reminded of which open task due today or tomorrow. The owner always
 * (when set); the assignee when he is someone else AND an active member of the
 * task's firm. One entry per person and task.
 */
export function planTaskReminders(
  rows: readonly TaskReminderRow[],
  today: string,
  tomorrow: string,
  activeMembers: ReadonlySet<string>,
): PlannedTaskReminder[] {
  const out: PlannedTaskReminder[] = [];
  for (const t of rows) {
    if (!t?.id || !t.due_date) continue;
    if (!t.status || !(TASK_OPEN_STATUSES as readonly string[]).includes(t.status)) continue;
    const when: TaskDueWhen | null = t.due_date === today ? "today" : t.due_date === tomorrow ? "tomorrow" : null;
    if (!when) continue;
    if (t.owner_user_id) out.push({ task: t, userId: t.owner_user_id, via: "owner", when, dueOn: t.due_date });
    const a = t.assignee_user_id;
    if (a && a !== t.owner_user_id && t.firm_id && activeMembers.has(taskMemberKey(t.firm_id, a))) {
      out.push({ task: t, userId: a, via: "assignee", when, dueOn: t.due_date });
    }
  }
  return out;
}

const WHEN_AR: Record<TaskDueWhen, string> = { today: "اليوم", tomorrow: "غداً" };

/** The Arabic e-mail of one task reminder — generic, no task or case data (owner ٤٥). */
export function taskEmailMessage(
  via: TaskReminderVia,
  when: TaskDueWhen,
  dueOn: string,
  env: EmailEnv = process.env,
  dashboardRoot: "/dashboard/lawyer" | "/dashboard/firm" = "/dashboard/lawyer",
): { subject: string; html: string; text: string } {
  const w = WHEN_AR[when];
  const href = siteLink(`${dashboardRoot}/tasks`, env);
  const { html, text } = renderEmailAr({
    heading: `لديك مهمة مستحقة ${w} — افتحها من نظامي`,
    paragraphs: [
      via === "assignee" ? `لديك مهمة مُسندة إليك موعدها ${w}.` : `لديك مهمة موعدها ${w}.`,
      "تفاصيل المهمة والقضية لا تُرسل بالبريد حفاظاً على سريتها؛ افتحها من حسابك في نظامي.",
    ],
    details: [["التاريخ", toArabicDigits(dueOn)]],
    action: href ? { label: "افتح مهامي في نظامي", href } : null,
    footer: REMINDER_FOOTER_AR,
  });
  return { subject: `تذكير: لديك مهمة مستحقة ${w}`, html, text };
}

function shortTitle(title: string | null | undefined): string {
  const t = (title ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "مهمة بلا عنوان";
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

/** The in-app notice of one task reminder (inside the platform: it names the task). */
export function taskInAppNotice(
  r: PlannedTaskReminder,
  dashboardRoot: "/dashboard/lawyer" | "/dashboard/firm" = "/dashboard/lawyer",
): InAppNotice {
  const w = WHEN_AR[r.when];
  return {
    title: `تذكير بمهمة: ${shortTitle(r.task.title)}`,
    body:
      (r.via === "assignee" ? `مهمة مُسندة إليك موعدها ${w}` : `موعد هذه المهمة ${w}`) +
      ` (${toArabicDigits(r.dueOn)}).`,
    href: `${dashboardRoot}/tasks`,
  };
}
