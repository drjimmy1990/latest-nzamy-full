/**
 * suspensionTerms.ts — the terms of an admin suspension (owner decision س٢١٥,
 * 25 Nov 2026): a flexible suspension with three ready templates (72 hours,
 * 14 days, 7 days) or a custom end, always with a written reason and an end
 * time. There is no open-ended suspension: every suspension carries `ends_at`,
 * the GoTrue ban lasts exactly until then, the app_metadata copy carries the
 * same `until`, and /api/v1/cron/suspension-lift lifts it (and gives the
 * frozen days back) once it has passed.
 *
 * Pure, with no imports, so the routes, the admin dialog (a client component)
 * and `node --test` share one copy of the rules.
 */

export type SuspensionTemplate = "72h" | "14d" | "7d" | "custom";

export interface SuspensionTemplateDef {
  id: Exclude<SuspensionTemplate, "custom">;
  hours: number;
  labelAr: string;
}

/** The three ready templates, in the owner's order. */
export const SUSPENSION_TEMPLATES: readonly SuspensionTemplateDef[] = Object.freeze([
  Object.freeze({ id: "72h", hours: 72, labelAr: "٧٢ ساعة" }),
  Object.freeze({ id: "14d", hours: 14 * 24, labelAr: "١٤ يوماً" }),
  Object.freeze({ id: "7d", hours: 7 * 24, labelAr: "٧ أيام" }),
]) as readonly SuspensionTemplateDef[];

/** A custom end: at least one hour from now, at most a year. */
export const CUSTOM_MIN_MS = 60 * 60 * 1000;
export const CUSTOM_MAX_MS = 365 * 24 * 60 * 60 * 1000;

export const REASON_MIN = 5;
export const REASON_MAX = 1000;

export const SUSPENSION_TERMS_AR = {
  missing: "اختر مدة الإيقاف واكتب سببه.",
  badTemplate: "مدة الإيقاف غير معروفة.",
  reasonShort: "اكتب سبب الإيقاف (خمسة أحرف على الأقل).",
  reasonLong: "سبب الإيقاف طويل جداً.",
  badEnd: "حدّد وقت انتهاء الإيقاف.",
  endTooSoon: "يجب أن ينتهي الإيقاف بعد ساعة على الأقل من الآن.",
  endTooLate: "لا يتجاوز الإيقاف سنة واحدة.",
} as const;

export interface SuspensionTerms {
  template: SuspensionTemplate;
  reason: string;
  /** ISO time the suspension ends. */
  endsAt: string;
}

export type SuspensionTermsResult = { ok: true; terms: SuspensionTerms } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The ready template with this id, or null. */
export function templateById(id: unknown): SuspensionTemplateDef | null {
  return SUSPENSION_TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * Reads `{ template, reason, ends_at? }` (the PATCH body's `suspension`).
 * A ready template computes its own end from `nowMs`; `custom` needs a
 * parseable `ends_at` between one hour and one year from now. Anything else —
 * no object, an unknown template, a reason too short or too long — is refused.
 */
export function parseSuspensionTerms(input: unknown, nowMs: number): SuspensionTermsResult {
  if (!isRecord(input)) return { ok: false, error: SUSPENSION_TERMS_AR.missing };
  const template = input.template;
  if (template !== "custom" && templateById(template) === null) {
    return { ok: false, error: typeof template === "string" && template !== "" ? SUSPENSION_TERMS_AR.badTemplate : SUSPENSION_TERMS_AR.missing };
  }
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < REASON_MIN) return { ok: false, error: SUSPENSION_TERMS_AR.reasonShort };
  if (reason.length > REASON_MAX) return { ok: false, error: SUSPENSION_TERMS_AR.reasonLong };

  let endsMs: number;
  if (template === "custom") {
    const raw = input.ends_at;
    const parsed = typeof raw === "string" && raw.trim() !== "" ? Date.parse(raw) : Number.NaN;
    if (!Number.isFinite(parsed)) return { ok: false, error: SUSPENSION_TERMS_AR.badEnd };
    // A minute of slack: the admin's clock and the form's rounding.
    if (parsed - nowMs < CUSTOM_MIN_MS - 60_000) return { ok: false, error: SUSPENSION_TERMS_AR.endTooSoon };
    if (parsed - nowMs > CUSTOM_MAX_MS) return { ok: false, error: SUSPENSION_TERMS_AR.endTooLate };
    endsMs = parsed;
  } else {
    endsMs = nowMs + (templateById(template) as SuspensionTemplateDef).hours * 60 * 60 * 1000;
  }
  return {
    ok: true,
    terms: { template: template as SuspensionTemplate, reason, endsAt: new Date(endsMs).toISOString() },
  };
}

/**
 * GoTrue's ban_duration for a ban that ends at `endsAtIso`: whole minutes,
 * rounded up (Go's time.ParseDuration reads "4320m"), never less than one.
 */
export function banDurationUntil(endsAtIso: string, nowMs: number): string {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const endsMs = Date.parse(endsAtIso);
  const minutes = Number.isFinite(endsMs) ? Math.ceil((endsMs - now) / 60_000) : 1;
  return `${Math.max(1, minutes)}m`;
}

/** The Arabic label of a stored template ('custom' → «مدة مخصّصة»), or null. */
export function templateLabelAr(template: unknown): string | null {
  if (template === "custom") return "مدة مخصّصة";
  return templateById(template)?.labelAr ?? null;
}

/** «٢٩ نوفمبر ٢٠٢٦، ١٠:٣٠ م» in Riyadh time, or null for an unparseable value. */
export function formatSuspensionEndAr(iso: unknown): string | null {
  if (typeof iso !== "string" || iso === "") return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(t));
}

// ── Appeals ────────────────────────────────────────────────────────────────

export const APPEAL_MESSAGE_MIN = 10;
export const APPEAL_MESSAGE_MAX = 3000;

export const APPEAL_AR = {
  required: "اكتب بريدك الإلكتروني ونص الاعتراض.",
  badEmail: "البريد الإلكتروني غير صحيح.",
  short: "اكتب اعتراضك في عشرة أحرف على الأقل.",
  long: "نص الاعتراض طويل جداً.",
  received:
    "وصلنا اعتراضك. إن كان البريد لحساب موقوف فستراجعه الإدارة وتردّ عليك على هذا البريد.",
  failed: "تعذّر إرسال الاعتراض الآن، حاول بعد قليل.",
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AppealResult = { ok: true; email: string; message: string } | { ok: false; error: string };

/** `{ email, message }` from the public appeal form. The e-mail is lower-cased. */
export function parseAppeal(input: unknown): AppealResult {
  const src = isRecord(input) ? input : {};
  const email = typeof src.email === "string" ? src.email.trim().toLowerCase() : "";
  const message = typeof src.message === "string" ? src.message.trim() : "";
  if (!email || !message) return { ok: false, error: APPEAL_AR.required };
  if (email.length > 320 || !EMAIL_RE.test(email)) return { ok: false, error: APPEAL_AR.badEmail };
  if (message.length < APPEAL_MESSAGE_MIN) return { ok: false, error: APPEAL_AR.short };
  if (message.length > APPEAL_MESSAGE_MAX) return { ok: false, error: APPEAL_AR.long };
  return { ok: true, email, message };
}

export type AppealStatus = "new" | "rejected" | "lifted" | "ended";

export const APPEAL_STATUS_AR: Readonly<Record<AppealStatus, string>> = Object.freeze({
  new: "بانتظار المراجعة",
  rejected: "مرفوض",
  lifted: "رُفع الإيقاف",
  ended: "انتهى الإيقاف بمدته",
});

// ── The e-mails to the account ─────────────────────────────────────────────

export interface SuspensionMail {
  subject: string;
  heading: string;
  paragraphs: string[];
  details: Array<[string, string]>;
  footer: string[];
}

/** The mail a suspended account gets: why, until when, and how to appeal. */
export function suspensionEmailAr(input: { reason: string; endsAt: string }): SuspensionMail {
  const end = formatSuspensionEndAr(input.endsAt) ?? input.endsAt;
  return {
    subject: "إيقاف حسابك مؤقتاً في نظامي",
    heading: "أُوقف حسابك مؤقتاً",
    paragraphs: [
      "قررت إدارة نظامي إيقاف حسابك إيقافاً مؤقتاً، ولن تتمكن من الدخول حتى نهاية مدة الإيقاف.",
      "اشتراكاتك ونقاطك ومنحك محفوظة ولم يُلغَ منها شيء، وتُمدَّد بقدر مدة الإيقاف عند رفعه.",
      "إن رأيت أن الإيقاف في غير محله فلك حق الاعتراض من صفحة الاعتراض، وستراجعه الإدارة وتردّ عليك على هذا البريد.",
    ],
    details: [
      ["سبب الإيقاف", input.reason],
      ["ينتهي الإيقاف", end],
    ],
    footer: ["وصلتك هذه الرسالة لأنها تخص حسابك في نظامي."],
  };
}

/** The mail when the suspension ends (by the administration or on time). */
export function suspensionLiftedEmailAr(input: { automatic: boolean; extended: boolean }): SuspensionMail {
  return {
    subject: "رُفع الإيقاف عن حسابك في نظامي",
    heading: "عاد حسابك متاحاً",
    paragraphs: [
      input.automatic
        ? "انتهت مدة إيقاف حسابك، ويمكنك الدخول من جديد."
        : "رفعت إدارة نظامي الإيقاف عن حسابك، ويمكنك الدخول من جديد.",
      ...(input.extended ? ["مُدِّدت اشتراكاتك ومنحك المجمّدة بقدر مدة الإيقاف."] : []),
    ],
    details: [],
    footer: ["وصلتك هذه الرسالة لأنها تخص حسابك في نظامي."],
  };
}
