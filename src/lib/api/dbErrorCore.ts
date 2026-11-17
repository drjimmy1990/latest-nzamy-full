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
export const DEMO_NO_PAYMENT_AR = "الحساب التجريبي لا يمكنه الدفع ولا حجز مقعد في باقة المؤسس.";
export const DEMO_FLAG_LOCKED_AR = "لا يمكن تغيير وضع الحساب التجريبي من هنا.";
export const DEMO_LIMIT_AR: Readonly<Record<"cases" | "consultations" | "clients", string>> = Object.freeze({
  cases: "بلغ الحساب التجريبي الحد الأقصى من القضايا (٥).",
  consultations: "بلغ الحساب التجريبي الحد الأقصى من الاستشارات (٥).",
  clients: "بلغ الحساب التجريبي الحد الأقصى من الموكلين (١٠).",
});

export type DemoRefusal = { status: 403; message: string; token: string };

/**
 * The demo refusal carried by a database / PostgREST error, or null. Reads
 * only `message` and accepts only the exact tokens 20261125_50 raises.
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
    case "demo_account:readonly":
      return out(DEMO_READONLY_AR);
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
