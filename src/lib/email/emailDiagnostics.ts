/**
 * emailDiagnostics.ts — what the admin's «اختبار إرسال بريد» shows (batch
 * l19, LIVE-18). Pure: no sender code, no network.
 *
 *   emailEnvReport(env)        which e-mail variables the server has — SET or
 *                              not, never a secret's value — the provider the
 *                              sender would use, and what SMTP still lacks.
 *   explainEmailSend(detail)   one honest Arabic sentence and a short class
 *                              for a sendEmailDetailed answer.
 *
 * The names are exactly the ones emailConfig.ts / sendEmail.ts read.
 * Relative imports only: `node --test` loads this file.
 */

import {
  emailProvider,
  smtpPort,
  smtpSecure,
  smtpSenderAddress,
  smtpSenderName,
  type EmailEnv,
  type EmailProvider,
} from "./emailConfig.ts";
import type { EmailSendDetail } from "./sendEmail.ts";

/** Every variable the app's e-mail reads, in the order an operator checks them. */
export const EMAIL_ENV_NAMES = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
  "EMAIL_FROM",
  "SMTP_ADMIN_EMAIL",
  "EMAIL_FROM_NAME",
  "SMTP_SENDER_NAME",
  "RESEND_API_KEY",
] as const;
export type EmailEnvName = (typeof EMAIL_ENV_NAMES)[number];

export interface EmailEnvReport {
  provider: EmailProvider | null;
  /** name → set (non-blank). Never the value. */
  set: Record<EmailEnvName, boolean>;
  /** What SMTP still needs (empty when SMTP is complete). «EMAIL_FROM أو SMTP_ADMIN_EMAIL» counts once. */
  smtpMissing: string[];
  /** The mail server's host name (not a secret), or null when unset. */
  host: string | null;
  port: number;
  /** "tls" = implicit TLS from the first byte; "starttls" = STARTTLS required. */
  security: "tls" | "starttls";
  /** The From address (the platform's sending mailbox, on every mail anyway), or null. */
  senderAddress: string | null;
  senderName: string | null;
}

const isSet = (v: string | undefined) => (v ?? "").trim() !== "";

export function emailEnvReport(env: EmailEnv): EmailEnvReport {
  const set = Object.fromEntries(EMAIL_ENV_NAMES.map((n) => [n, isSet(env[n])])) as Record<EmailEnvName, boolean>;
  const smtpMissing: string[] = [];
  if (!set.SMTP_HOST) smtpMissing.push("SMTP_HOST");
  if (!set.SMTP_USER) smtpMissing.push("SMTP_USER");
  if (!set.SMTP_PASS) smtpMissing.push("SMTP_PASS");
  if (smtpSenderAddress(env) === "") smtpMissing.push("EMAIL_FROM");
  const port = smtpPort(env);
  return {
    provider: emailProvider(env),
    set,
    smtpMissing,
    host: set.SMTP_HOST ? (env.SMTP_HOST ?? "").trim() : null,
    port,
    security: smtpSecure(env, port) ? "tls" : "starttls",
    senderAddress: smtpSenderAddress(env) || null,
    senderName: smtpSenderName(env) || null,
  };
}

export type EmailTestClass =
  | "sent"
  | "sunk"
  | "not_configured"
  | "bad_recipient"
  | "module"
  | "auth"
  | "dns"
  | "connect"
  | "tls"
  | "refused"
  | "temporary"
  | "timeout"
  | "provider"
  | "unexpected";

export interface EmailTestExplanation {
  ok: boolean;
  errorClass: EmailTestClass;
  messageAr: string;
}

const MODULE_CODES = new Set(["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND", "EMODULE"]);
const AUTH_CODES = new Set(["EAUTH", "ENOAUTH", "EOAUTH2"]);
const CONNECT_CODES = new Set(["ECONNECTION", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EPIPE"]);
const DNS_CODES = new Set(["EDNS", "ENOTFOUND", "EAI_AGAIN"]);
const TLS_CODES = new Set(["ETLS", "ESOCKET", "EREQUIRETLS", "EPROTO"]);
/** Node's TLS / certificate error codes (ERR_SSL_WRONG_VERSION_NUMBER, CERT_HAS_EXPIRED, …). */
const isTlsCode = (c: string) =>
  /^(ERR_SSL_|ERR_TLS_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_)/.test(c) || c === "EPROTO";

/**
 * One sentence for the admin. `missing` = emailEnvReport().smtpMissing (shown
 * when nothing is set up). Never repeats an address, a host or a secret.
 */
export function explainEmailSend(detail: EmailSendDetail, missing: readonly string[] = []): EmailTestExplanation {
  if (detail.result === "sent") {
    return {
      ok: true,
      errorClass: "sent",
      messageAr:
        "قبِل خادم البريد رسالة الاختبار. افحص صندوق الوارد والبريد غير المرغوب فيه خلال دقائق؛ إن لم تصل فالسبب بعد خادمنا (سجلات النطاق أو تصنيف المستلم).",
    };
  }
  if (detail.result === "sunk") {
    return {
      ok: false,
      errorClass: "sunk",
      messageAr: "لم تُرسل: عنوانك أو حسابك مصنّف للاختبار، فحُفظت الرسالة في صندوق بريد الاختبار لدى الإدارة.",
    };
  }
  if (detail.result === "unavailable") {
    return {
      ok: false,
      errorClass: "not_configured",
      messageAr: `لم تُرسل: إعدادات البريد غير مكتملة على الخادم${missing.length ? ` — الناقص: ${missing.join("، ")}` : ""}.`,
    };
  }

  const f = detail.failure;
  // nodemailer 10 files a system error under its own class (ESOCKET,
  // ECONNECTION…) and keeps the system code apart: that one says more.
  const original = f?.originalCode ?? "";
  const code = (original && (DNS_CODES.has(original) || CONNECT_CODES.has(original) || isTlsCode(original)) ? original : f?.code) ?? "";
  const reply = f?.responseCode ?? null;
  const fail = (errorClass: EmailTestClass, messageAr: string): EmailTestExplanation => ({ ok: false, errorClass, messageAr });

  if (!f || f.stage === "threw") {
    return fail("unexpected", "لم تُرسل: خطأ غير متوقع أثناء الإرسال. راجع سجل أخطاء التطبيق على الخادم (السطور التي تبدأ بـ [email]).");
  }
  if (f.stage === "input") return fail("bad_recipient", "لم تُرسل: لا يوجد عنوان بريد صالح في حسابك.");
  if (f.stage === "timeout") {
    return fail("timeout", "لم تُرسل: لم يُكمل خادم البريد الإرسال خلال ٢٠ ثانية — غالبًا منفذ محجوب من الاستضافة أو خادم لا يرد.");
  }
  if (f.stage === "rejected") {
    return fail("refused", "لم تُرسل: ردّ خادم البريد لكنه لم يقبل عنوان المستلم.");
  }
  if (f.stage === "http") {
    const s = f.httpStatus ?? 0;
    if (s === 401 || s === 403) return fail("auth", "لم تُرسل: مزوّد البريد رفض مفتاح الإرسال (RESEND_API_KEY).");
    if (s === 422) return fail("refused", "لم تُرسل: مزوّد البريد رفض عنوان المرسل — النطاق غير موثّق لديه (EMAIL_FROM).");
    if (s === 429) return fail("temporary", "لم تُرسل: تجاوزنا حد الإرسال لدى مزوّد البريد مؤقتًا.");
    return fail("provider", `لم تُرسل: ردّ مزوّد البريد بخطأ (HTTP ${s || "—"}).`);
  }
  if (f.stage === "transport" || MODULE_CODES.has(code)) {
    return fail(
      "module",
      "لم تُرسل: تعذّر تحميل مكوّن إرسال البريد على الخادم (nodemailer). يلزم تثبيت الحزم على الخادم (npm ci) ثم إعادة النشر.",
    );
  }
  // stage "send": the SMTP conversation.
  if (AUTH_CODES.has(code) || reply === 530 || reply === 534 || reply === 535) {
    return fail("auth", "لم تُرسل: رفض خادم البريد اسم المستخدم أو كلمة المرور (SMTP_USER / SMTP_PASS)، أو أن الدخول بكلمة المرور معطّل في الصندوق.");
  }
  if (DNS_CODES.has(code)) return fail("dns", "لم تُرسل: تعذّر العثور على خادم البريد باسمه (SMTP_HOST).");
  if (CONNECT_CODES.has(code)) {
    return fail("connect", "لم تُرسل: تعذّر الاتصال بخادم البريد — المنفذ مغلق أو محجوب من الاستضافة، أو العنوان خاطئ (SMTP_HOST / SMTP_PORT).");
  }
  if (TLS_CODES.has(code) || isTlsCode(code)) {
    return fail("tls", "لم تُرسل: انقطع الاتصال أو فشل التشفير مع خادم البريد — راجع المنفذ مع SMTP_SECURE (465 = تشفير مباشر، 587 = STARTTLS).");
  }
  if (reply !== null && reply >= 400 && reply < 500) {
    return fail("temporary", `لم تُرسل: رفض مؤقت من خادم البريد (الرمز ${reply}) — حد إرسال أو ضغط؛ أعد المحاولة لاحقًا.`);
  }
  if (code === "EENVELOPE" || (reply !== null && reply >= 500)) {
    return fail(
      "refused",
      `لم تُرسل: دخلنا خادم البريد لكنه رفض الرسالة${reply ? ` (الرمز ${reply})` : ""} — غالبًا عنوان المرسل غير مسموح لهذا الصندوق (EMAIL_FROM).`,
    );
  }
  return fail("unexpected", `لم تُرسل: خطأ من خادم البريد${code ? ` (${code})` : ""}. راجع سجل أخطاء التطبيق على الخادم (السطور التي تبدأ بـ [email]).`);
}
