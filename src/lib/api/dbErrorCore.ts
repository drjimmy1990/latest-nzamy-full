/**
 * The pure half of dbError.ts: what an API route logs and what it sends back
 * when a database / PostgREST / storage call fails.
 *
 * The rule (SAST-06): the client gets a fixed Arabic sentence and nothing
 * else from the error. The raw `message`, `code`, `details` and `hint` carry
 * table, column, constraint and function names, so they go to the server log
 * only. Routes that deliberately map a known code (23505 → 409, a missing
 * object → 503, an RPC reason token → its own Arabic text) keep doing that
 * themselves; this is the fallback for everything else.
 *
 * No imports, so `node --test` can load it (next/server does not resolve
 * there). The NextResponse wrapper lives in ./dbError.ts.
 */

export const DB_ERROR_AR = "تعذّر إتمام العملية، حاول مرة أخرى";

export type DbErrorFields = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** The loggable fields of whatever was thrown or returned as `error`. */
export function describeDbError(err: unknown): DbErrorFields {
  if (err == null) return {};
  if (typeof err === "string") return { message: err };
  if (typeof err !== "object") return { message: String(err) };
  const e = err as Record<string, unknown>;
  const out: DbErrorFields = {};
  const message = str(e.message);
  const code = str(e.code);
  const details = str(e.details);
  const hint = str(e.hint);
  if (message) out.message = message;
  if (code) out.code = code;
  if (details) out.details = details;
  if (hint) out.hint = hint;
  return out;
}

/** Server-side log line: `[tag] { message, code, details, hint }`. */
export function logDbError(tag: string, err: unknown): void {
  console.error(`[${tag}]`, describeDbError(err));
}

/**
 * The client body. `extra` carries the route's own non-error fields (for
 * example `success: false` or a `reason` token) so the response keeps its
 * shape; it must never be fed from the error object.
 */
export function dbErrorBody(
  message: string = DB_ERROR_AR,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(extra ?? {}), error: message };
}

/*
 * S3 / R11 (20261125_50): the database refuses a demo account's write with a
 * fixed token (`raise exception 'demo_account:…'`). A token is our own text,
 * never table data, so mapping it to a fixed Arabic sentence keeps SAST-06.
 */
export const DEMO_READONLY_AR =
  "هذا حساب تجريبي: لا يمكنه النشر أو الكتابة في الأقسام العامة (المجتمع، التقييمات، السوق، بلاغات المكتبة).";
export const DEMO_SANDBOX_AR = "هذا حساب تجريبي: لا يمكن ربطه بحسابات حقيقية.";
export const DEMO_NO_PAYMENT_AR = "الحساب التجريبي لا يمكنه الدفع الحقيقي ولا حجز مقعد في باقة المؤسس.";
/** l7 decision 3 (20261127_80): a test account pays in Moyasar TEST mode only. */
export const DEMO_LIVE_PAYMENT_AR = "الحساب التجريبي يدفع في وضع الاختبار فقط، ولا يُقبل منه أي دفع حقيقي.";
/** l7 decision 3 (20261127_80): a test account's request never reaches real lawyers' open requests. */
export const DEMO_OPEN_REQUEST_AR =
  "هذا حساب تجريبي: لا تُعرض طلباته في الطلبات المفتوحة للمحامين، وجّه الطلب إلى محامٍ تجريبي مباشرة.";
export const DEMO_FLAG_LOCKED_AR = "لا يمكن تغيير وضع الحساب التجريبي من هنا.";
export const DEMO_LIMIT_AR: Readonly<Record<"cases" | "consultations" | "clients", string>> = Object.freeze({
  cases: "بلغ الحساب التجريبي الحد الأقصى من القضايا (٥).",
  consultations: "بلغ الحساب التجريبي الحد الأقصى من الاستشارات (٥).",
  clients: "بلغ الحساب التجريبي الحد الأقصى من الموكلين (١٠).",
});

export type DemoRefusal = { status: 403; message: string; token: string };

/**
 * The demo refusal carried by a database / PostgREST error, or null. Reads
 * only `message` and accepts only the exact tokens 20261125_50 and
 * 20261127_80 (live_payment, open_request) raise.
 */
export function demoRefusal(err: unknown): DemoRefusal | null {
  const message = describeDbError(err).message;
  if (!message || !message.startsWith("demo_account")) return null;
  const token = message.trim();
  const out = (text: string): DemoRefusal => ({ status: 403, message: text, token });
  switch (token) {
    case "demo_account":
    case "demo_account:no_payment":
      return out(DEMO_NO_PAYMENT_AR);
    case "demo_account:live_payment":
      return out(DEMO_LIVE_PAYMENT_AR);
    case "demo_account:readonly":
      return out(DEMO_READONLY_AR);
    case "demo_account:open_request":
      return out(DEMO_OPEN_REQUEST_AR);
    case "demo_account:sandbox":
      return out(DEMO_SANDBOX_AR);
    case "demo_account:flag_locked":
      return out(DEMO_FLAG_LOCKED_AR);
    case "demo_account:limit:cases":
      return out(DEMO_LIMIT_AR.cases);
    case "demo_account:limit:consultations":
      return out(DEMO_LIMIT_AR.consultations);
    case "demo_account:limit:clients":
      return out(DEMO_LIMIT_AR.clients);
    default:
      return null;
  }
}

/*
 * S9 and the firm seat cap (20261126_50): the database refuses with a fixed
 * token (`raise exception 'plan_limit:cases'` …). Same rule as the demo
 * tokens: our own text, mapped to a fixed Arabic sentence (SAST-06), plus a
 * link the screen renders as a real link (`linkHref` / `linkLabel`).
 */
export const PLAN_LIMIT_UPGRADE_HREF = "/pricing";
export const FIRM_SEATS_CONTACT_HREF = "/contact?type=firm-seats";
export const PLAN_LIMIT_AR: Readonly<Record<"cases" | "clients", string>> = Object.freeze({
  cases: "بلغت الحد المجاني للمحامي الفرد: ٥ قضايا نشطة. أغلق قضية منتهية أو رقِّ باقتك لإضافة المزيد.",
  clients: "بلغت الحد المجاني للمحامي الفرد: ١٠ موكلين. أرشف موكلاً سابقاً أو رقِّ باقتك لإضافة المزيد.",
});
export const PLAN_LIMIT_LINK_AR = "ترقية الباقة";
export const FIRM_SEATS_FULL_AR = "اكتملت مقاعد المكتب. لزيادة المقاعد تواصل معنا.";
export const FIRM_SEATS_LINK_AR = "لزيادة المقاعد تواصل معنا";

export type LimitRefusal = {
  status: 403;
  message: string;
  token: "plan_limit:cases" | "plan_limit:clients" | "firm_seats_full";
  linkHref: string;
  linkLabel: string;
};

/**
 * The plan-limit / seat refusal carried by a database / PostgREST error, or
 * null. Reads only `message` and accepts only the exact tokens 20261126_50
 * raises.
 */
export function limitRefusal(err: unknown): LimitRefusal | null {
  const message = describeDbError(err).message?.trim();
  switch (message) {
    case "plan_limit:cases":
      return { status: 403, message: PLAN_LIMIT_AR.cases, token: message, linkHref: PLAN_LIMIT_UPGRADE_HREF, linkLabel: PLAN_LIMIT_LINK_AR };
    case "plan_limit:clients":
      return { status: 403, message: PLAN_LIMIT_AR.clients, token: message, linkHref: PLAN_LIMIT_UPGRADE_HREF, linkLabel: PLAN_LIMIT_LINK_AR };
    case "firm_seats_full":
      return { status: 403, message: FIRM_SEATS_FULL_AR, token: message, linkHref: FIRM_SEATS_CONTACT_HREF, linkLabel: FIRM_SEATS_LINK_AR };
    default:
      return null;
  }
}

/** The JSON body of a limit refusal: the Arabic sentence, the token, the link. */
export function limitRefusalBody(r: LimitRefusal, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...(extra ?? {}), error: r.message, code: r.token, linkHref: r.linkHref, linkLabel: r.linkLabel };
}

/**
 * The link to show beside an error message that a screen only has as text
 * (apiMutate keeps `error` and drops the rest of the body): the upgrade link
 * for a plan-limit sentence, the contact link for a full firm, else null.
 */
export function limitLinkForMessage(message: string | null | undefined): { href: string; label: string } | null {
  if (!message) return null;
  if (message.includes(PLAN_LIMIT_AR.cases) || message.includes(PLAN_LIMIT_AR.clients)) {
    return { href: PLAN_LIMIT_UPGRADE_HREF, label: PLAN_LIMIT_LINK_AR };
  }
  if (message.includes(FIRM_SEATS_FULL_AR)) return { href: FIRM_SEATS_CONTACT_HREF, label: FIRM_SEATS_LINK_AR };
  return null;
}
