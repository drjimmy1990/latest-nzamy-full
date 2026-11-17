/**
 * poaEmailReminders.ts — the pure half of POST /api/v1/cron/poa-reminders
 * (owner TODO N05-L14): a power of attorney about to expire, by e-mail, 30 and
 * 7 days before its end, once each (email_reminder_log).
 *
 * WHERE THE DATE LIVES — public.contracts rows with contract_type =
 * 'power_of_attorney' («وكالة قانونية», src/lib/services/contractVocabulary.ts)
 * and their ends_on (a plain date, read as a Riyadh calendar day). It is the
 * only power-of-attorney expiry the platform stores:
 * lawyer_clients.power_of_attorney_no is a number with no date.
 * Rows already 'expired', 'terminated' or 'cancelled' are not reminded.
 * Recipient: the contract's owner_user_id (the lawyer who keeps it).
 *
 * The contract's own renewal obligation (contracts/_obligations.ts —
 * renewal_notice_days before ends_on, an in-app radar deadline) is unchanged;
 * this e-mail is in addition to it.
 *
 * Relative imports only: `node --test` loads it (poaEmailReminders.test.ts).
 */

import { toArabicDigits } from "../services/arabicCount.ts";
import { renderEmailAr, siteLink, REMINDER_FOOTER_AR, type EmailEnv } from "./sendEmail.ts";

export const POA_ENDED_STATUSES = ["expired", "terminated", "cancelled"] as const;
export const POA_HORIZON_DAYS = 30;

export interface PoaContractRow {
  id: string;
  owner_user_id: string | null;
  title: string | null;
  counterparty_name: string | null;
  ends_on: string | null;
  status: string | null;
}

export type PoaOffset = 30 | 7;

/** Whole days from `today` to `endsOn` (both YYYY-MM-DD), or null. */
export function daysBetween(today: string, endsOn: string | null | undefined): number | null {
  if (!endsOn || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${endsOn}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Which reminder is due today: 7 when 0..7 days are left, 30 when 8..30.
 * Only the latest stage: a job that was down for a week sends the 7-day
 * reminder, not a late «30 days».
 */
export function poaOffset(today: string, endsOn: string | null | undefined): PoaOffset | null {
  const d = daysBetween(today, endsOn);
  if (d === null || d < 0 || d > POA_HORIZON_DAYS) return null;
  return d <= 7 ? 7 : 30;
}

export interface PlannedPoaReminder {
  contract: PoaContractRow;
  offset: PoaOffset;
  daysLeft: number;
}

export function planPoaReminders(rows: readonly PoaContractRow[], today: string): PlannedPoaReminder[] {
  const out: PlannedPoaReminder[] = [];
  for (const c of rows) {
    if (!c?.owner_user_id || !c.ends_on) continue;
    if (c.status && (POA_ENDED_STATUSES as readonly string[]).includes(c.status)) continue;
    const offset = poaOffset(today, c.ends_on);
    const daysLeft = daysBetween(today, c.ends_on);
    if (offset === null || daysLeft === null) continue;
    out.push({ contract: c, offset, daysLeft });
  }
  return out;
}

function daysLeftAr(n: number): string {
  if (n <= 0) return "اليوم";
  if (n === 1) return "غداً";
  if (n === 2) return "بعد يومين";
  if (n <= 10) return `بعد ${toArabicDigits(String(n))} أيام`;
  return `بعد ${toArabicDigits(String(n))} يوماً`;
}

/** The Arabic e-mail of one power-of-attorney reminder. */
export function poaEmailMessage(
  r: PlannedPoaReminder,
  env: EmailEnv = process.env,
  dashboardRoot: "/dashboard/lawyer" | "/dashboard/firm" = "/dashboard/lawyer",
): { subject: string; html: string; text: string } {
  const title = (r.contract.title ?? "").trim() || "وكالة قانونية";
  const when = daysLeftAr(r.daysLeft);
  const href = siteLink(`${dashboardRoot}/contracts/${encodeURIComponent(r.contract.id)}`, env);
  const { html, text } = renderEmailAr({
    heading: "تذكير: وكالة قانونية تقترب من نهايتها",
    paragraphs: [
      `تنتهي الوكالة «${title}» ${when}.`,
      "إن كانت القضية أو المعاملة مستمرة، فاطلب من الموكل تجديدها قبل انتهائها.",
    ],
    details: [
      ["الوكالة", title],
      ["الموكل / الطرف", (r.contract.counterparty_name ?? "").trim() || null],
      ["تاريخ الانتهاء", r.contract.ends_on ? toArabicDigits(r.contract.ends_on) : null],
    ],
    action: href ? { label: "افتح الوكالة", href } : null,
    footer: REMINDER_FOOTER_AR,
  });
  return { subject: `تنتهي وكالة ${when}: ${title}`, html, text };
}
