/**
 * suspensionMail.ts — the e-mails of an admin suspension (owner س٢١٥): the
 * account is told why it is suspended, until when, and where to appeal; and
 * again when the suspension ends. Through src/lib/email/sendEmail.ts only.
 * Best effort: never throws, never fails the suspension or the lift.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmailAr, sendEmail, siteLink, type EmailSendResult } from "@/lib/email/sendEmail";
import type { SuspensionMail } from "@/lib/auth/suspensionTerms";

/** The page a suspended account appeals from. */
export const APPEAL_PATH = "/account-suspended";

export async function sendSuspensionMail(
  admin: Pick<SupabaseClient, "auth">,
  args: { userId: string; mail: SuspensionMail; tag: string; idempotencyKey: string; withAppealLink: boolean },
): Promise<EmailSendResult | "no_address"> {
  try {
    const { data } = await admin.auth.admin.getUserById(args.userId);
    const to = data?.user?.email ?? null;
    if (!to) return "no_address";
    const href = args.withAppealLink ? siteLink(APPEAL_PATH) : null;
    const rendered = renderEmailAr({
      heading: args.mail.heading,
      paragraphs: args.mail.paragraphs,
      details: args.mail.details,
      action: href ? { label: "تقديم اعتراض", href } : null,
      footer: args.mail.footer,
    });
    return await sendEmail({
      to,
      subject: args.mail.subject,
      text: rendered.text,
      html: rendered.html,
      tag: args.tag,
      idempotencyKey: args.idempotencyKey,
      userIds: [args.userId],
    });
  } catch (err) {
    console.error("[suspension] the e-mail to the account failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
