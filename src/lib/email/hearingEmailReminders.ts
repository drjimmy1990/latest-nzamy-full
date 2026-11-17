/**
 * hearingEmailReminders.ts — the pure half of POST /api/v1/cron/hearing-reminders
 * (owner TODO N01-16): the day before a scheduled hearing (Riyadh dates), an
 * e-mail to the hearing's OWNER and to its ASSIGNEE (hearings.assignee_user_id,
 * 20261124_50) — once per hearing date per recipient (email_reminder_log).
 *
 * The assignee is e-mailed only while he may still read the hearing: he is
 * the owner, or an ACTIVE member of the hearing's firm. The assignee trigger
 * checks membership only when the column is set, so a member removed later
 * keeps the value — and must not receive the case title and court by e-mail
 * (the same reason 20261124_50 added no assignee-only read policy).
 *
 * In-app hearing reminders are separate (src/lib/hearingReminders.ts, the
 * hourly /api/v1/cron/deadlines) and unchanged.
 *
 * Relative imports only: `node --test` loads it (hearingEmailReminders.test.ts).
 */

import { parseHearingTime } from "../calendar/hearingReminderStages.ts";
import { toArabicDigits } from "../services/arabicCount.ts";
import { formatTimeOfDayAr } from "../../app/dashboard/lawyer/hearings/_timeOfDay.ts";
import { renderEmailAr, siteLink, REMINDER_FOOTER_AR, type EmailEnv } from "./sendEmail.ts";

export interface HearingEmailRow {
  id: string;
  owner_user_id: string | null;
  assignee_user_id: string | null;
  firm_id: string | null;
  title: string | null;
  hearing_date: string;
  hearing_time: string | null;
  court_name: string | null;
  location: string | null;
  status?: string | null;
}

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

/** The Arabic e-mail of one hearing reminder. */
export function hearingEmailMessage(
  h: HearingEmailRow,
  via: HearingEmailVia,
  env: EmailEnv = process.env,
): { subject: string; html: string; text: string } {
  const title = (h.title ?? "").trim() || "جلسة";
  const t = parseHearingTime(h.hearing_time);
  const time = t ? `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}` : null;
  const place = (h.court_name ?? "").trim() || null;
  const location = (h.location ?? "").trim() || null;
  const href = siteLink("/dashboard/lawyer/hearings", env);
  const { html, text } = renderEmailAr({
    heading: "تذكير: لديك جلسة غداً",
    paragraphs: [
      via === "assignee"
        ? `أُسندت إليك جلسة «${title}» وموعدها غداً.`
        : `موعد جلسة «${title}» غداً.`,
      "راجع ملف القضية ومستنداتها قبل الموعد.",
    ],
    details: [
      ["الجلسة", title],
      ["التاريخ", toArabicDigits(h.hearing_date)],
      ["الوقت", time ? formatTimeOfDayAr(time) : null],
      ["المحكمة", place],
      ["المكان", location && location !== place ? location : null],
    ],
    action: href ? { label: "افتح جلساتي", href } : null,
    footer: REMINDER_FOOTER_AR,
  });
  return { subject: `تذكير بجلسة غداً: ${title}`, html, text };
}
