/**
 * sendEmail.ts — the ONE e-mail sender of the platform (owner TODO F1). Server only.
 * ─────────────────────────────────────────────────────────────────────────
 * Provider: Resend's REST API (POST https://api.resend.com/emails), the
 * provider the lawyer-signup e-mail code (src/lib/lawyerSignup/channels.ts)
 * and the n8n workflows already use.
 *
 *   sendEmail({ to, subject, html?, text, tag?, idempotencyKey? })
 *     → 'sent'        Resend accepted the message (2xx)
 *     → 'unavailable' e-mail is not set up here (RESEND_API_KEY or EMAIL_FROM
 *                     missing) — nothing was attempted
 *     → 'failed'      an attempt was made (or the input was unusable) and it
 *                     did not succeed
 *   It NEVER throws.
 *
 * Environment (names only, never logged):
 *   RESEND_API_KEY   the Resend API key
 *   EMAIL_FROM       the sending address on a domain verified in Resend
 *   EMAIL_FROM_NAME  optional display name («نظامي»)
 *
 * Privacy: nothing here logs a message body or a full address — a failure
 * logs the status, the tag and the MASKED address (maskEmail).
 *
 * Relative imports only (none needed): `node --test` loads this file
 * (sendEmail.test.ts). `env` and `fetchImpl` are injectable for the tests.
 */

export type EmailSendResult = "sent" | "unavailable" | "failed";
export type EmailEnv = Record<string, string | undefined>;

export interface EmailMessage {
  /** One recipient address. */
  to: string;
  subject: string;
  /** Plain-text body — always sent (the alternative for clients without HTML). */
  text: string;
  /** Optional HTML body (renderEmailAr builds an RTL one). */
  html?: string;
  /** A short label for Resend's dashboard: [A-Za-z0-9_-], other characters become «_». */
  tag?: string;
  /** Resend's Idempotency-Key header: a retry with the same key is not sent twice (24 h). */
  idempotencyKey?: string;
}

export interface SendEmailDeps {
  env?: EmailEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const EMAIL_TIMEOUT_MS = 8000;

const has = (v: string | undefined) => (v ?? "").trim() !== "";

/** True when the variables a send needs are present. */
export function emailConfigured(env: EmailEnv = process.env): boolean {
  return has(env.RESEND_API_KEY) && has(env.EMAIL_FROM);
}

/** A single plain address: no spaces, no list, no header injection. */
export function isPlainEmail(addr: unknown): addr is string {
  return (
    typeof addr === "string" &&
    addr.length <= 254 &&
    /^[^\s@,;<>"()[\]\\]+@[^\s@,;<>"()[\]\\]+\.[^\s@,;<>"()[\]\\]+$/.test(addr)
  );
}

/** «m***@e***.sa» — enough to tell two recipients apart in a log, no more. */
export function maskEmail(addr: unknown): string {
  if (typeof addr !== "string" || !addr.includes("@")) return "(no address)";
  const at = addr.lastIndexOf("@");
  const local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local.slice(0, 1) || "?"}***@${host.slice(0, 1) || "?"}***${tld}`;
}

/** Resend accepts tag names/values of ASCII letters, digits, «_» and «-» (≤ 256). */
export function sanitizeTag(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

/** One header line: no CR/LF, trimmed. */
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

/** The From header: «Name <address>», the name stripped of characters that would break it. */
export function fromHeader(env: EmailEnv): string {
  const address = oneLine(env.EMAIL_FROM ?? "");
  const name = oneLine(env.EMAIL_FROM_NAME ?? "").replace(/[<>"\\]/g, "");
  return name ? `${name} <${address}>` : address;
}

export async function sendEmail(message: EmailMessage, deps: SendEmailDeps = {}): Promise<EmailSendResult> {
  const env = deps.env ?? process.env;
  if (!emailConfigured(env)) return "unavailable";
  const tag = message?.tag ? sanitizeTag(message.tag) : "";
  try {
    const to = typeof message?.to === "string" ? message.to.trim() : "";
    if (!isPlainEmail(to)) {
      console.error("[email] not sent: unusable recipient address", tag || "-", maskEmail(to));
      return "failed";
    }
    const subject = oneLine(message.subject ?? "");
    const text = typeof message.text === "string" ? message.text : "";
    if (!subject || !text.trim()) {
      console.error("[email] not sent: empty subject or text", tag || "-", maskEmail(to));
      return "failed";
    }
    const body: Record<string, unknown> = { from: fromHeader(env), to: [to], subject, text };
    if (typeof message.html === "string" && message.html.trim()) body.html = message.html;
    if (tag) body.tags = [{ name: "category", value: tag }];

    const headers: Record<string, string> = {
      Authorization: `Bearer ${(env.RESEND_API_KEY ?? "").trim()}`,
      "Content-Type": "application/json",
    };
    if (message.idempotencyKey) headers["Idempotency-Key"] = oneLine(message.idempotencyKey).slice(0, 256);

    const res = await (deps.fetchImpl ?? fetch)(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(deps.timeoutMs ?? EMAIL_TIMEOUT_MS),
    });
    if (res.ok) return "sent";
    // The response body is not logged: Resend may echo the address back.
    console.error("[email] send failed: status", res.status, tag || "-", maskEmail(to));
    return "failed";
  } catch (err) {
    const name = err instanceof Error ? err.name : "error";
    console.error("[email] send threw:", name, tag || "-", maskEmail(message?.to));
    return "failed";
  }
}

// ── Arabic RTL template ──────────────────────────────────────────────────────

/** Escape a value for HTML text or a double-quoted attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailTemplateInput {
  /** The heading of the message. */
  heading: string;
  /** Paragraphs, plain text (escaped here). */
  paragraphs: readonly string[];
  /** Label / value rows (e.g. «التاريخ» / «٢٠٢٦-١١-٢٠»). Empty values are dropped. */
  details?: ReadonlyArray<readonly [string, string | null | undefined]>;
  /** One call to action. Only an absolute https link is rendered. */
  action?: { label: string; href: string } | null;
  /** Small print under the message (why it was sent, how to stop it). */
  footer?: readonly string[];
}

function httpsHref(href: string | undefined | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A simple accessible RTL message: lang="ar" dir="rtl", system fonts, no
 * remote images or fonts, no brand colours, dark text on white (contrast
 * well above 4.5:1), layout tables marked role="presentation". Returns the
 * HTML and the plain-text alternative built from the same input.
 */
export function renderEmailAr(input: EmailTemplateInput): { html: string; text: string } {
  const details = (input.details ?? []).filter(
    (d): d is readonly [string, string] => typeof d[1] === "string" && d[1].trim() !== "",
  );
  const href = httpsHref(input.action?.href);
  const footer = input.footer ?? [];

  const font = "Tahoma, Arial, 'Segoe UI', sans-serif";
  const p = (s: string) =>
    `<p style="margin:0 0 14px;font-size:16px;line-height:1.8;color:#1a1a1a;">${escapeHtml(s)}</p>`;
  const rows = details
    .map(
      ([k, v]) =>
        `<tr><th scope="row" style="text-align:right;padding:6px 0 6px 12px;font-size:15px;font-weight:bold;color:#1a1a1a;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</th>` +
        `<td style="text-align:right;padding:6px 0;font-size:15px;color:#1a1a1a;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html =
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><title>${escapeHtml(input.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f4f4f4;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:560px;background:#ffffff;border:1px solid #d6d6d6;border-radius:8px;font-family:${font};text-align:right;">` +
    `<tr><td style="padding:28px 24px;">` +
    `<h1 style="margin:0 0 18px;font-size:21px;line-height:1.5;color:#111111;">${escapeHtml(input.heading)}</h1>` +
    input.paragraphs.map(p).join("") +
    (rows
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-collapse:collapse;">${rows}</table>`
      : "") +
    (href && input.action
      ? `<p style="margin:8px 0 6px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 20px;border:2px solid #111111;border-radius:6px;color:#111111;font-size:16px;font-weight:bold;text-decoration:underline;">${escapeHtml(input.action.label)}</a></p>`
      : "") +
    `</td></tr>` +
    (footer.length
      ? `<tr><td style="padding:16px 24px;border-top:1px solid #e2e2e2;">${footer
          .map((f) => `<p style="margin:0 0 6px;font-size:13px;line-height:1.7;color:#444444;">${escapeHtml(f)}</p>`)
          .join("")}</td></tr>`
      : "") +
    `</table></td></tr></table></body></html>`;

  const text = [
    input.heading,
    "",
    ...input.paragraphs,
    ...(details.length ? ["", ...details.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(href && input.action ? ["", `${input.action.label}: ${href}`] : []),
    ...(footer.length ? ["", "—", ...footer] : []),
  ].join("\n");

  return { html, text };
}

/** The site's https origin (NEXT_PUBLIC_SITE_URL), or null — links are then left out. */
export function siteOrigin(env: EmailEnv = process.env): string | null {
  const raw = (env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return httpsHref(raw) ? raw : null;
}

/** An absolute link on the site, or null without an https origin. */
export function siteLink(path: string, env: EmailEnv = process.env): string | null {
  const origin = siteOrigin(env);
  return origin ? `${origin}${path.startsWith("/") ? path : `/${path}`}` : null;
}

/** The footer every reminder carries: why it came, and where to turn it off. */
export const REMINDER_FOOTER_AR: readonly string[] = [
  "وصلتك هذه الرسالة لأن التنبيهات بالبريد الإلكتروني مفعّلة في حسابك على منصة نظامي.",
  "لإيقافها: الإعدادات ← الإشعارات ← البريد الإلكتروني.",
];
