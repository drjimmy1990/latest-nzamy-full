/**
 * libraryEmailReminders.ts — the e-mail of the 7- and 3-day library
 * reminders (owner note ١٨ C06), sent by POST /api/v1/cron/library-grant-reminders
 * next to the in-app notice. Same plan (planLibraryReminders: the END OF THE
 * USER'S CHAIN, one per user), same wording as the in-app notice
 * (libraryReminderNotice), its own once-only row in email_reminder_log
 * (kind library_7d / library_3d, subject = the chain-end grant, due_on = the
 * chain end's Riyadh day).
 *
 * Relative imports only: `node --test` loads it.
 */

import { libraryReminderNotice, type PlannedLibraryReminder } from "../libraryAccessReminders.ts";
import { renderEmailAr, siteLink, REMINDER_FOOTER_AR, type EmailEnv } from "./sendEmail.ts";
import type { ReminderKey } from "./reminderDelivery.ts";

/** The chain end's calendar day in Riyadh (YYYY-MM-DD), or null. */
export function riyadhDayOf(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
}

export function libraryEmailKey(r: PlannedLibraryReminder): ReminderKey | null {
  const dueOn = riyadhDayOf(r.endsAt);
  if (!dueOn) return null;
  return {
    kind: r.offset === 3 ? "library_3d" : "library_7d",
    subjectId: r.grantId,
    recipientUserId: r.userId,
    dueOn,
  };
}

export function libraryEmailMessage(
  r: PlannedLibraryReminder,
  now: Date,
  env: EmailEnv = process.env,
): { subject: string; html: string; text: string } {
  const notice = libraryReminderNotice(r, now);
  const href = siteLink(notice.href, env);
  const { html, text } = renderEmailAr({
    heading: notice.title,
    paragraphs: [notice.body],
    action: href ? { label: "جدّد اشتراك المكتبة", href } : null,
    footer: REMINDER_FOOTER_AR,
  });
  return { subject: notice.title, html, text };
}
