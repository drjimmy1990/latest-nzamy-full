/**
 * sendEmail.ts — the ONE e-mail sender of the platform (owner TODO F1). Server only.
 * ─────────────────────────────────────────────────────────────────────────
 * Providers (the choice is emailConfig.ts emailProvider, in this order):
 *   1. SMTP — the operator's own mailbox (decision of 20 Nov 2026: no Resend
 *      for now), through nodemailer, loaded only when a mail goes out.
 *   2. Resend's REST API (POST https://api.resend.com/emails) — kept working
 *      exactly as before for a server that has only the Resend key.
 *   3. Neither → 'unavailable'.
 *
 *   sendEmail({ to, subject, html?, text, tag?, idempotencyKey? })
 *     → 'sent'        the provider accepted the message (Resend 2xx; SMTP:
 *                     the server accepted the recipient)
 *     → 'unavailable' e-mail is not set up here (neither SMTP nor Resend is
 *                     fully configured) — nothing was attempted
 *     → 'failed'      an attempt was made (or the input was unusable) and it
 *                     did not succeed
 *     → 'sunk'        NOT sent: the mail went to a test account, was caused by
 *                     one (`userIds`), or went to a reserved test domain — the
 *                     database stored it in its test mail sink instead
 *                     (owner file 19 §1ج.2, l9 testinfra; 20261129_90)
 *   It NEVER throws.
 *
 * The test mail sink: before every send, public.test_mail_sink_check is asked
 * through PostgREST with the service role (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY). No such env, the function missing (before
 * 20261129_90) or any error → the mail is sent as before (fail-open, logged):
 * silently dropping a real user's mail is the worse failure. Staff are never
 * test accounts. `deps.sinkCheck` replaces the lookup in tests.
 *
 * Environment (names only, never logged). SMTP — the same names as the
 * self-hosted Supabase .env, so its lines can be copied:
 *   SMTP_HOST        the mail server's host name
 *   SMTP_PORT        optional, default 587
 *   SMTP_USER        the mailbox user name
 *   SMTP_PASS        the mailbox password
 *   SMTP_SECURE      optional "true" / "false": implicit TLS. Default: true on
 *                    port 465, else STARTTLS — and STARTTLS is then REQUIRED
 *                    (requireTLS), so the password never travels in clear
 *   EMAIL_FROM       the sending address (fallback: SMTP_ADMIN_EMAIL)
 *   EMAIL_FROM_NAME  optional display name «نظامي» (fallback: SMTP_SENDER_NAME)
 * Resend (used only when SMTP is not fully set):
 *   RESEND_API_KEY   the Resend API key
 *   EMAIL_FROM       the sending address on a domain verified in Resend
 *   EMAIL_FROM_NAME  optional display name
 *
 * SMTP has no idempotency header: with an idempotencyKey the mail carries a
 * stable Message-ID (a hash of the key and the recipient — never the key
 * itself), so a retry is recognisably the same message; the callers' own
 * once-only logs stay the real guard. One nodemailer transport per process
 * and per settings; connection/greeting ≤ 10 s, socket ≤ 20 s, and the whole
 * send is cut at 20 s, so a dead mail server cannot hang a cron route.
 *
 * Privacy: nothing here logs a message body or a full address — a failure
 * logs the status (SMTP: the error code and reply code only, never the
 * server's reply text, which can echo an address or the user name), the tag
 * and the MASKED address (maskEmail).
 *
 * Relative imports only: `node --test` loads this file (sendEmail.test.ts).
 * `env`, `fetchImpl` and `createSmtpTransport` are injectable for the tests.
 */

import { emailProvider, smtpSettings, type EmailEnv, type EmailProvider, type SmtpSettings } from "./emailConfig.ts";

export type EmailSendResult = "sent" | "unavailable" | "failed" | "sunk";

/**
 * Where a failed send stopped (batch l19, LIVE-18 — the admin's test send
 * shows it; the ordinary callers only see the EmailSendResult):
 *   input      the recipient / subject / text was unusable — nothing attempted
 *   transport  the SMTP transport could not be made (nodemailer not loadable)
 *   send       the SMTP conversation failed (connect, TLS, login, envelope…)
 *   timeout    the whole SMTP send passed SMTP_SEND_TIMEOUT_MS
 *   rejected   the SMTP server answered but did not accept the recipient
 *   http       Resend answered a non-2xx status
 *   threw      anything else (Resend unreachable, an unexpected error)
 */
export type EmailFailureStage = "input" | "transport" | "send" | "timeout" | "rejected" | "http" | "threw";

/** The loggable facts of a failure — codes only, never a message text, an address or a secret. */
export interface EmailFailureDetail {
  stage: EmailFailureStage;
  /** nodemailer / Node error code (EAUTH, ECONNECTION, ESOCKET, MODULE_NOT_FOUND…), or null. */
  code: string | null;
  /** The system error under nodemailer's class (ECONNREFUSED, ENOTFOUND, ERR_SSL_…), or null. */
  originalCode: string | null;
  /** The SMTP server's reply code (535, 550…), or null. */
  responseCode: number | null;
  /** Resend's HTTP status, or null. */
  httpStatus: number | null;
}

/** sendEmailDetailed's answer: the result, the provider used, and why it failed (null unless "failed"). */
export interface EmailSendDetail {
  result: EmailSendResult;
  provider: EmailProvider | null;
  failure: EmailFailureDetail | null;
}

const failure = (
  provider: EmailProvider | null,
  stage: EmailFailureStage,
  parts: Partial<Omit<EmailFailureDetail, "stage">> = {},
): EmailSendDetail => ({
  result: "failed",
  provider,
  failure: {
    stage,
    code: parts.code ?? null,
    originalCode: parts.originalCode ?? null,
    responseCode: parts.responseCode ?? null,
    httpStatus: parts.httpStatus ?? null,
  },
});
export type { EmailEnv, EmailProvider, SmtpSettings } from "./emailConfig.ts";
// "Is e-mail set up?" lives in emailConfig.ts (pure, no sender code).
export {
  emailConfigured,
  emailProvider,
  resendConfigured,
  smtpConfigured,
  smtpPort,
  smtpSecure,
  smtpSenderAddress,
  smtpSenderName,
} from "./emailConfig.ts";

export interface EmailMessage {
  /** One recipient address. */
  to: string;
  subject: string;
  /** Plain-text body — always sent (the alternative for clients without HTML). */
  text: string;
  /** Optional HTML body (renderEmailAr builds an RTL one). */
  html?: string;
  /** A short label (Resend: its dashboard tag; SMTP: an X-Nzamy-Category header): [A-Za-z0-9_-], other characters become «_». */
  tag?: string;
  /**
   * Resend: its Idempotency-Key header (a retry with the same key is not sent
   * twice, 24 h). SMTP: a stable Message-ID derived from it (no server-side
   * dedupe — the callers' once-only logs are the guard).
   */
  idempotencyKey?: string;
  /**
   * The accounts this mail is about — the recipient's id and/or the id of
   * the account whose action caused it. Any test account among them → the
   * mail is sunk, never sent (a test lawyer's statement never reaches a real
   * address). The recipient's address is checked as well.
   */
  userIds?: readonly (string | null | undefined)[];
}

export interface TestMailSinkInput {
  to: string;
  userIds: string[];
  subject: string;
  text: string;
  tag: string | null;
}

/** sink: true → stored in the test mail sink, do not send. */
export interface TestMailSinkDecision {
  sink: boolean;
  reason?: string;
}

/** The options handed to the SMTP transport factory (nodemailer.createTransport). */
export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  /** STARTTLS is mandatory when the connection does not start in TLS. */
  requireTLS: boolean;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  /** No attachment may read a local file or a URL (none are sent; defence in depth). */
  disableFileAccess: true;
  disableUrlAccess: true;
}

/** One SMTP message as nodemailer's sendMail takes it. */
export interface SmtpMail {
  from: { name: string; address: string } | string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId?: string;
  headers?: Record<string, string>;
}

/** What the sender needs from a transport (a nodemailer Transporter fits). */
export interface SmtpTransportLike {
  sendMail(mail: SmtpMail): Promise<unknown>;
}

export type SmtpTransportFactory = (options: SmtpTransportOptions) => SmtpTransportLike | Promise<SmtpTransportLike>;

export interface SendEmailDeps {
  env?: EmailEnv;
  fetchImpl?: typeof fetch;
  /** The Resend request's timeout. */
  timeoutMs?: number;
  /** Replaces the database lookup of the test mail sink (tests). */
  sinkCheck?: (input: TestMailSinkInput) => Promise<TestMailSinkDecision>;
  /** Replaces nodemailer.createTransport (tests). Transports are cached per factory and settings. */
  createSmtpTransport?: SmtpTransportFactory;
  /** The cap on one whole SMTP send (default SMTP_SEND_TIMEOUT_MS). */
  smtpTimeoutMs?: number;
}

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const EMAIL_TIMEOUT_MS = 8000;
export const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
export const SMTP_GREETING_TIMEOUT_MS = 10_000;
export const SMTP_SOCKET_TIMEOUT_MS = 20_000;
/** One whole SMTP send (connect, TLS, login, message) never takes longer than this. */
export const SMTP_SEND_TIMEOUT_MS = 20_000;

/** A single plain address: no spaces, no list, no header injection. */
// isPlainEmail lives in emailAddress.ts (no sender code), so client-side
// modules can validate an address without bundling the sender.
export { isPlainEmail } from "./emailAddress.ts";
import { isPlainEmail } from "./emailAddress.ts";

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
  return (await sendEmailDetailed(message, deps)).result;
}

/**
 * sendEmail with the reason of a failure (batch l19, LIVE-18): the same send,
 * the same logs, the same "never throws" — plus the provider used and, for
 * "failed", the stage and the error / reply codes (EmailFailureDetail). Used
 * by the admin's «اختبار إرسال بريد»; every other caller uses sendEmail.
 */
export async function sendEmailDetailed(message: EmailMessage, deps: SendEmailDeps = {}): Promise<EmailSendDetail> {
  const env = deps.env ?? process.env;
  const provider = emailProvider(env);
  if (!provider) return { result: "unavailable", provider: null, failure: null };
  const tag = message?.tag ? sanitizeTag(message.tag) : "";
  try {
    const to = typeof message?.to === "string" ? message.to.trim() : "";
    if (!isPlainEmail(to)) {
      console.error("[email] not sent: unusable recipient address", tag || "-", maskEmail(to));
      return failure(provider, "input");
    }
    const subject = oneLine(message.subject ?? "");
    const text = typeof message.text === "string" ? message.text : "";
    if (!subject || !text.trim()) {
      console.error("[email] not sent: empty subject or text", tag || "-", maskEmail(to));
      return failure(provider, "input");
    }
    const fetchImpl = deps.fetchImpl ?? fetch;
    const sinkInput: TestMailSinkInput = { to, userIds: cleanUserIds(message.userIds), subject, text, tag: tag || null };
    const sink = await (deps.sinkCheck ?? ((i: TestMailSinkInput) => checkTestMailSink(i, env, fetchImpl)))(sinkInput);
    if (sink.sink) {
      console.info("[email] sunk (test mail sink):", sink.reason || "-", tag || "-", maskEmail(to));
      return { result: "sunk", provider, failure: null };
    }

    if (provider === "smtp") {
      const html = typeof message.html === "string" && message.html.trim() ? message.html : undefined;
      return await sendViaSmtp({ to, subject, text, html, tag, idempotencyKey: message.idempotencyKey }, env, deps);
    }

    const body: Record<string, unknown> = { from: fromHeader(env), to: [to], subject, text };
    if (typeof message.html === "string" && message.html.trim()) body.html = message.html;
    if (tag) body.tags = [{ name: "category", value: tag }];

    const headers: Record<string, string> = {
      Authorization: `Bearer ${(env.RESEND_API_KEY ?? "").trim()}`,
      "Content-Type": "application/json",
    };
    if (message.idempotencyKey) headers["Idempotency-Key"] = oneLine(message.idempotencyKey).slice(0, 256);

    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(deps.timeoutMs ?? EMAIL_TIMEOUT_MS),
    });
    if (res.ok) return { result: "sent", provider, failure: null };
    // The response body is not logged: Resend may echo the address back.
    console.error("[email] send failed: status", res.status, tag || "-", maskEmail(to));
    return failure(provider, "http", { httpStatus: res.status });
  } catch (err) {
    const name = err instanceof Error ? err.name : "error";
    console.error("[email] send threw:", name, tag || "-", maskEmail(message?.to));
    const code = smtpErrorParts(err)[1];
    return failure(provider, "threw", { code: code === "-" ? null : code });
  }
}

// ── SMTP: the operator's own mailbox ────────────────────────────────────────

/**
 * nodemailer, loaded on the first SMTP send only (ESM or CJS shape alike).
 * next.config.ts lists it in serverExternalPackages (l19), so the server
 * loads it from node_modules at run time instead of a bundled copy. A module
 * that cannot be loaded fails with its own code (MODULE_NOT_FOUND /
 * ERR_MODULE_NOT_FOUND) or EMODULE, at the "transport" stage.
 */
const nodemailerFactory: SmtpTransportFactory = async (options) => {
  type Mod = { createTransport?: (o: SmtpTransportOptions) => SmtpTransportLike };
  const mod = (await import("nodemailer")) as unknown as Mod & { default?: Mod };
  const lib = typeof mod.createTransport === "function" ? mod : mod.default;
  if (!lib || typeof lib.createTransport !== "function") {
    throw Object.assign(new Error("nodemailer unavailable"), { code: "EMODULE" });
  }
  return lib.createTransport(options);
};

/** The transport options for these settings (timeouts, TLS rule). */
export function smtpTransportOptions(s: SmtpSettings): SmtpTransportOptions {
  return {
    host: s.host,
    port: s.port,
    secure: s.secure,
    requireTLS: !s.secure,
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

/** One transport per process, per factory and per settings (a settings change makes a new one). */
const transportCache = new WeakMap<SmtpTransportFactory, Map<string, Promise<SmtpTransportLike>>>();

function transportFor(factory: SmtpTransportFactory, s: SmtpSettings): Promise<SmtpTransportLike> {
  let byKey = transportCache.get(factory);
  if (!byKey) {
    byKey = new Map();
    transportCache.set(factory, byKey);
  }
  const key = JSON.stringify([s.host, s.port, s.secure, s.user, s.pass]);
  const cached = byKey.get(key);
  if (cached) return cached;
  if (byKey.size >= 4) byKey.clear();
  const made = Promise.resolve().then(() => factory(smtpTransportOptions(s)));
  byKey.set(key, made);
  // A factory that failed is not kept: the next send tries again.
  made.catch(() => {
    if (byKey.get(key) === made) byKey.delete(key);
  });
  return made;
}

/** The From of an SMTP mail: { name, address }, the name stripped of characters that would break it. */
export function smtpFrom(s: Pick<SmtpSettings, "fromAddress" | "fromName">): { name: string; address: string } | string {
  const address = oneLine(s.fromAddress);
  const name = oneLine(s.fromName).replace(/[<>"\\]/g, "");
  return name ? { name, address } : address;
}

/**
 * A stable Message-ID for an idempotency key: «<sha256(key, recipient)@sender-domain>».
 * The key itself (which may hold ids) never appears in the mail.
 */
export async function smtpMessageId(idempotencyKey: string, to: string, fromAddress: string): Promise<string> {
  const data = new TextEncoder().encode(`${oneLine(idempotencyKey).slice(0, 256)}\n${to.trim().toLowerCase()}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
  const at = fromAddress.lastIndexOf("@");
  const domain = (at >= 0 ? fromAddress.slice(at + 1) : "").toLowerCase().replace(/[^a-z0-9.-]/g, "") || "localhost";
  return `<${hex}@${domain}>`;
}

/** True when the server's answer lists the recipient as accepted and not as rejected. */
function acceptedBy(info: unknown, to: string): boolean {
  if (!info || typeof info !== "object") return false;
  const { accepted, rejected } = info as { accepted?: unknown; rejected?: unknown };
  const addr = (x: unknown): string =>
    typeof x === "string"
      ? x
      : x && typeof x === "object" && typeof (x as { address?: unknown }).address === "string"
        ? (x as { address: string }).address
        : "";
  const want = to.toLowerCase();
  if (Array.isArray(rejected) && rejected.some((r) => addr(r).trim().toLowerCase() === want)) return false;
  return Array.isArray(accepted) && accepted.some((a) => addr(a).trim().toLowerCase() === want);
}

/** The loggable parts of an SMTP error: its code and reply code — never its message or the server's reply text. */
function smtpErrorParts(err: unknown): [string, string, string, string] {
  const e = (err && typeof err === "object" ? err : {}) as {
    name?: unknown;
    code?: unknown;
    responseCode?: unknown;
    originalCode?: unknown;
  };
  const okCode = (c: unknown) => (typeof c === "string" && /^[A-Z][A-Z0-9_]{0,39}$/.test(c) ? c : "-");
  const name = err instanceof Error && /^[A-Za-z]{1,40}$/.test(err.name) ? err.name : "error";
  const code = okCode(e.code);
  const reply = typeof e.responseCode === "number" && e.responseCode >= 100 && e.responseCode <= 599 ? String(e.responseCode) : "-";
  // nodemailer 10 replaces a system error's code with its own class (ESOCKET…)
  // and keeps the system code (ECONNREFUSED, ENOTFOUND, ERR_SSL_…) here.
  const original = okCode(e.originalCode);
  return [name, code, reply, original];
}

interface SmtpOutgoing {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tag: string;
  idempotencyKey?: string;
}

async function sendViaSmtp(m: SmtpOutgoing, env: EmailEnv, deps: SendEmailDeps): Promise<EmailSendDetail> {
  const settings = smtpSettings(env);
  if (!settings) return { result: "unavailable", provider: null, failure: null };
  const mail: SmtpMail = { from: smtpFrom(settings), to: m.to, subject: m.subject, text: m.text };
  if (m.html) mail.html = m.html;
  if (m.tag) mail.headers = { "X-Nzamy-Category": m.tag };
  if (m.idempotencyKey) mail.messageId = await smtpMessageId(m.idempotencyKey, m.to, settings.fromAddress);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), deps.smtpTimeoutMs ?? SMTP_SEND_TIMEOUT_MS);
  });
  // "transport" until nodemailer is loaded and the transport made, then "send".
  let stage: "transport" | "send" = "transport";
  const work = (async () => {
    const transport = await transportFor(deps.createSmtpTransport ?? nodemailerFactory, settings);
    stage = "send";
    return { info: await transport.sendMail(mail) };
  })();
  // A send that fails after the cut-off is already answered: not an unhandled rejection.
  work.catch(() => undefined);
  try {
    const outcome = await Promise.race([work, timeout]);
    if (outcome === "timeout") {
      console.error("[email] smtp send timed out", m.tag || "-", maskEmail(m.to));
      return failure("smtp", "timeout");
    }
    if (acceptedBy(outcome.info, m.to)) return { result: "sent", provider: "smtp", failure: null };
    console.error("[email] smtp: recipient not accepted", m.tag || "-", maskEmail(m.to));
    return failure("smtp", "rejected");
  } catch (err) {
    const [name, code, reply, original] = smtpErrorParts(err);
    // «stage name code reply original» — e.g. «send Error ESOCKET - ECONNREFUSED».
    console.error("[email] smtp send failed:", stage, name, code, reply, original, m.tag || "-", maskEmail(m.to));
    return failure("smtp", stage, {
      code: code === "-" ? null : code,
      originalCode: original === "-" ? null : original,
      responseCode: reply === "-" ? null : Number(reply),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── the test mail sink (20261129_90) ────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SINK_CHECK_TIMEOUT_MS = 4000;
let sinkMissingLogged = false;

function cleanUserIds(ids: EmailMessage["userIds"]): string[] {
  const out = new Set<string>();
  for (const id of ids ?? []) if (typeof id === "string" && UUID_RE.test(id.trim())) out.add(id.trim().toLowerCase());
  return [...out];
}

/**
 * Asks public.test_mail_sink_check (service role, PostgREST). The database
 * decides — a test recipient, a test account among `userIds`, or a reserved
 * test domain — and stores the sunk mail itself. Never throws; anything
 * other than an explicit { sink: true } means "send".
 */
export async function checkTestMailSink(
  input: TestMailSinkInput,
  env: EmailEnv,
  fetchImpl: typeof fetch,
  timeoutMs = SINK_CHECK_TIMEOUT_MS,
): Promise<TestMailSinkDecision> {
  const base = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!/^https?:\/\//.test(base) || !key) return { sink: false };
  try {
    const res = await fetchImpl(`${base}/rest/v1/rpc/test_mail_sink_check`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_to: input.to,
        p_user_ids: input.userIds.length ? input.userIds : null,
        p_subject: input.subject,
        p_text: input.text,
        p_tag: input.tag,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      if (res.status === 404) {
        if (!sinkMissingLogged) {
          sinkMissingLogged = true;
          console.warn("[email] test_mail_sink_check is missing (20261129_90 not run yet): no test mail sink");
        }
      } else {
        console.error("[email] test mail sink check failed: status", res.status, "— sending");
      }
      return { sink: false };
    }
    const json = (await res.json().catch(() => null)) as { sink?: unknown; reason?: unknown } | null;
    return json?.sink === true ? { sink: true, reason: typeof json.reason === "string" ? json.reason : undefined } : { sink: false };
  } catch (err) {
    console.error("[email] test mail sink check threw:", err instanceof Error ? err.name : "error", "— sending");
    return { sink: false };
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
