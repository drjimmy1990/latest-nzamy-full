/**
 * firmInviteEmail.ts — the pure half of the firm invitation e-mail (owner TODO
 * T10-F7 / package 19 O24, batch l11-remind). POST /api/v1/firm/invitations
 * creates the invitation (a link with a one-time token) and, when e-mail is set
 * up, sends that link to the invited address through the shared sender.
 *
 * THE TOKEN — the link is a key to join the firm, so it goes ONLY into the
 * body of the one e-mail to the invited address. It is never in the subject,
 * the Resend tag, the idempotency key, the once-only log row, or a log line:
 *   - the log row's subject_id is `<firm id>:<invitation id>:<hash of the
 *     address>` (no address, no token), kind 'firm_invite' (20261201_45);
 *   - the idempotency key is built from those same parts (reminderDelivery).
 *
 * HOW OFTEN — one e-mail per invitation; at most FIRM_INVITE_DAILY_CAP a day
 * per (firm, address): a manager who re-invites the same address again and
 * again (each re-invite cancels the old link and mints a new one) cannot turn
 * it into a stream of mail. Beyond the cap the link is still created and
 * shown to copy, as before this batch.
 *
 * Relative imports only: `node --test` loads it (firmInviteEmail.test.ts).
 */

import { createHash } from "node:crypto";
import { toArabicDigits } from "../services/arabicCount.ts";
import { renderEmailAr, type EmailEnv, siteLink } from "./sendEmail.ts";

export const FIRM_INVITE_DAILY_CAP = 3;

/** A short, stable, one-way tag of an address (the log never holds the address). */
export function inviteAddressHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/** `<firm>:<hash>:` — every invitation e-mail of this firm to this address starts with it. */
export function firmInviteSubjectPrefix(firmId: string, email: string): string {
  return `${firmId}:${inviteAddressHash(email)}:`;
}

/** The once-only log row's subject: one per invitation. */
export function firmInviteSubjectId(firmId: string, email: string, invitationId: string): string {
  return `${firmInviteSubjectPrefix(firmId, email)}${invitationId}`;
}

export interface FirmInviteEmailInput {
  firmName: string | null | undefined;
  roleLabel: string | null | undefined;
  /** The invitation page path, /invite/team/<token>. */
  path: string;
  /** ISO timestamp of the link's expiry, or null. */
  expiresAt: string | null | undefined;
}

function oneLine(s: string | null | undefined, fallback: string, max = 120): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return fallback;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * The Arabic invitation e-mail, or null when the site has no https origin
 * (NEXT_PUBLIC_SITE_URL) — an invitation without its link is not sent.
 */
export function firmInviteEmailMessage(
  input: FirmInviteEmailInput,
  env: EmailEnv = process.env,
): { subject: string; html: string; text: string } | null {
  const href = siteLink(input.path, env);
  if (!href) return null;
  const firm = oneLine(input.firmName, "مكتب محاماة");
  const role = oneLine(input.roleLabel, "عضو في الفريق", 60);
  const expires = typeof input.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(input.expiresAt)
    ? toArabicDigits(input.expiresAt.slice(0, 10))
    : null;
  const { html, text } = renderEmailAr({
    heading: "دعوة للانضمام إلى فريق مكتب محاماة على نظامي",
    paragraphs: [
      `دعاك «${firm}» للانضمام إلى فريقه على منصة نظامي بصفة «${role}».`,
      "لقبول الدعوة افتح الرابط أدناه، ثم سجّل الدخول (أو أنشئ حساباً) بهذا البريد الإلكتروني نفسه.",
      "الرابط خاص بك، فلا تشاركه مع أحد.",
    ],
    details: [["تنتهي صلاحية الدعوة", expires]],
    action: { label: "افتح الدعوة", href },
    footer: [
      "وصلتك هذه الرسالة لأن أحد مديري المكتب أدخل بريدك في دعوة فريقه على منصة نظامي.",
      "إن لم تكن تتوقعها فتجاهلها؛ لا تُنشأ أي عضوية دون قبولك.",
    ],
  });
  return { subject: "دعوة للانضمام إلى فريق مكتب محاماة على نظامي", html, text };
}
