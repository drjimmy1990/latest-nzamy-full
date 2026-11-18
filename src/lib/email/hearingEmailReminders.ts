/**
 * hearingEmailReminders.ts — the pure half of POST /api/v1/cron/hearing-reminders
 * (owner TODO N01-16): the day before a scheduled hearing (Riyadh dates), an
 * e-mail to the hearing's OWNER and to its ASSIGNEE (hearings.assignee_user_id,
 * 20261124_50) — once per hearing date per recipient (email_reminder_log).
 *
 * The assignee is e-mailed only while he may still read the hearing: he is
 * the owner, or an ACTIVE member of the hearing's firm. The assignee trigger
 * checks membership only when the column is set, so a member removed later
 * keeps the value (the same reason 20261124_50 added no assignee-only read
 * policy).
 *
 * OWNER ٤٥ (18 Nov 2026, batch l8): the e-mail is GENERIC — «لديك جلسة غداً —
 * افتحها من نظامي» and a link to the platform. No case title, no court, no
 * place, no time, no client: no case data travels through the e-mail
 * provider. The route does not even read those columns.
 *
 * In-app hearing reminders are separate (src/lib/hearingReminders.ts, the
 * hourly /api/v1/cron/deadlines) and unchanged.
 *
 * Relative imports only: `node --test` loads it (hearingEmailReminders.test.ts).
 */

import { toArabicDigits } from "../services/arabicCount.ts";
import { renderEmailAr, siteLink, REMINDER_FOOTER_AR, type EmailEnv } from "./sendEmail.ts";

/** The columns the route reads — deliberately no title, court, place or time (owner ٤٥). */
export interface HearingEmailRow {
  id: string;
  owner_user_id: string | null;
  assignee_user_id: string | null;
  firm_id: string | null;
  hearing_date: string;
  status?: string | null;
}

/** The route's select list, kept next to the row type (pinned by a test). */
export const HEARING_EMAIL_COLUMNS = "id, owner_user_id, assignee_user_id, firm_id, hearing_date, status";

export type HearingEmailVia = "owner" | "assignee";

/** The key of an active firm membership in the set the route builds. */
export const memberKey = (firmId: string, userId: string) => `${firmId}|${userId}`;

/**
 * Who is e-mailed about this hearing. The owner always (when set); the
 * assignee when he is someone else AND an active member of the hearing's firm.
 * One entry per person.
 */
export function hearingEmailRecipients(
  h: HearingEmailRow,
  activeMembers: ReadonlySet<string>,
): Array<{ userId: string; via: HearingEmailVia }> {
  const out: Array<{ userId: string; via: HearingEmailVia }> = [];
  if (h.status && h.status !== "scheduled") return out;
  if (h.owner_user_id) out.push({ userId: h.owner_user_id, via: "owner" });
  const a = h.assignee_user_id;
  if (a && a !== h.owner_user_id && h.firm_id && activeMembers.has(memberKey(h.firm_id, a))) {
    out.push({ userId: a, via: "assignee" });
  }
  return out;
}

/** The assignees whose firm membership the route must check. */
export function assigneesToCheck(rows: readonly HearingEmailRow[]): Array<{ firmId: string; userId: string }> {
  const seen = new Set<string>();
  const out: Array<{ firmId: string; userId: string }> = [];
  for (const h of rows) {
    const a = h.assignee_user_id;
    if (!a || a === h.owner_user_id || !h.firm_id) continue;
    const k = memberKey(h.firm_id, a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ firmId: h.firm_id, userId: a });
  }
  return out;
}

/** The heading and subject of every hearing reminder (owner ٤٥). */
export const HEARING_EMAIL_HEADING_AR = "لديك جلسة غداً — افتحها من نظامي";

/** The Arabic e-mail of one hearing reminder — generic, no case data (owner ٤٥). */
export function hearingEmailMessage(
  h: HearingEmailRow,
  via: HearingEmailVia,
  env: EmailEnv = process.env,
  dashboardRoot: "/dashboard/lawyer" | "/dashboard/firm" = "/dashboard/lawyer",
): { subject: string; html: string; text: string } {
  const href = siteLink(`${dashboardRoot}/hearings`, env);
  const { html, text } = renderEmailAr({
    heading: HEARING_EMAIL_HEADING_AR,
    paragraphs: [
      via === "assignee" ? "لديك جلسة مُسندة إليك موعدها غداً." : "لديك جلسة موعدها غداً.",
      "تفاصيل الجلسة والقضية لا تُرسل بالبريد حفاظاً على سريتها؛ افتحها من حسابك في نظامي.",
    ],
    details: [["التاريخ", toArabicDigits(h.hearing_date)]],
    action: href ? { label: "افتح جلساتي في نظامي", href } : null,
    footer: REMINDER_FOOTER_AR,
  });
  return { subject: "تذكير: لديك جلسة غداً", html, text };
}
