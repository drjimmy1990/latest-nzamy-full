/**
 * emailConfig.ts — which e-mail provider this server is set up for.
 * ─────────────────────────────────────────────────────────────────────────
 * Pure (no sender code, no network, no imports), so a module that only asks
 * "is e-mail set up?" (lawyerSignup/providerConfig.ts, the admin status
 * screens) does not reach the sender src/lib/email/sendEmail.ts.
 *
 * The rule, in order:
 *   1. SMTP (the operator's own mailbox) — SMTP_HOST + SMTP_USER + SMTP_PASS
 *      + a sender address (EMAIL_FROM, else SMTP_ADMIN_EMAIL). The names
 *      match the self-hosted Supabase .env, so the same lines can be copied.
 *      A half-filled SMTP block (no password, no sender…) is NOT SMTP: it
 *      falls through to Resend, then to "not set up".
 *   2. Resend — RESEND_API_KEY + EMAIL_FROM (as before).
 *   3. Neither → not set up: sendEmail answers 'unavailable'.
 *
 * Nothing here returns or logs a secret's value: SMTP_PASS is read only by
 * smtpSettings(), which sendEmail.ts hands straight to the transport.
 */

export type EmailEnv = Record<string, string | undefined>;
export type EmailProvider = "smtp" | "resend";

export const SMTP_DEFAULT_PORT = 587;
/** Implicit TLS («SMTPS») is the default on this port; any other port uses STARTTLS. */
export const SMTP_IMPLICIT_TLS_PORT = 465;

const has = (v: string | undefined) => (v ?? "").trim() !== "";
const trimmed = (v: string | undefined) => (v ?? "").trim();

/** The SMTP sender address: EMAIL_FROM, else the Supabase name SMTP_ADMIN_EMAIL. */
export function smtpSenderAddress(env: EmailEnv): string {
  return trimmed(env.EMAIL_FROM) || trimmed(env.SMTP_ADMIN_EMAIL);
}

/** The SMTP display name: EMAIL_FROM_NAME, else the Supabase name SMTP_SENDER_NAME. */
export function smtpSenderName(env: EmailEnv): string {
  return trimmed(env.EMAIL_FROM_NAME) || trimmed(env.SMTP_SENDER_NAME);
}

/** SMTP_PORT as a port number; missing or unusable → 587. */
export function smtpPort(env: EmailEnv): number {
  const raw = trimmed(env.SMTP_PORT);
  if (!/^\d{1,5}$/.test(raw)) return SMTP_DEFAULT_PORT;
  const n = Number(raw);
  return n >= 1 && n <= 65535 ? n : SMTP_DEFAULT_PORT;
}

/**
 * Implicit TLS or not: SMTP_SECURE "true" / "false" decides; unset (or any
 * other value) → implicit TLS on port 465 only, STARTTLS elsewhere.
 */
export function smtpSecure(env: EmailEnv, port: number = smtpPort(env)): boolean {
  const raw = trimmed(env.SMTP_SECURE).toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return port === SMTP_IMPLICIT_TLS_PORT;
}

/** True when the operator's SMTP mailbox is fully set up. */
export function smtpConfigured(env: EmailEnv): boolean {
  return has(env.SMTP_HOST) && has(env.SMTP_USER) && has(env.SMTP_PASS) && smtpSenderAddress(env) !== "";
}

/** True when Resend is set up (unchanged rule). */
export function resendConfigured(env: EmailEnv): boolean {
  return has(env.RESEND_API_KEY) && has(env.EMAIL_FROM);
}

/** The provider a send goes through: SMTP first, then Resend; null = e-mail is not set up. */
export function emailProvider(env: EmailEnv = process.env): EmailProvider | null {
  if (smtpConfigured(env)) return "smtp";
  if (resendConfigured(env)) return "resend";
  return null;
}

/** True when the variables a send needs are present (SMTP or Resend). */
export function emailConfigured(env: EmailEnv = process.env): boolean {
  return emailProvider(env) !== null;
}

export interface SmtpSettings {
  host: string;
  port: number;
  /** true = implicit TLS from the first byte; false = STARTTLS (required, see sendEmail.ts). */
  secure: boolean;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
}

/** The SMTP settings, or null when SMTP is not fully set up. */
export function smtpSettings(env: EmailEnv): SmtpSettings | null {
  if (!smtpConfigured(env)) return null;
  const port = smtpPort(env);
  return {
    host: trimmed(env.SMTP_HOST),
    port,
    secure: smtpSecure(env, port),
    user: trimmed(env.SMTP_USER),
    // A password may legitimately start or end with a space: kept as given.
    pass: env.SMTP_PASS ?? "",
    fromAddress: smtpSenderAddress(env),
    fromName: smtpSenderName(env),
  };
}
