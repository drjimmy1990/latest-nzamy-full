/**
 * testBatches.ts — «مسح دفعة الاختبار» (owner file 19 §1ج.3–4, batch
 * l9-testinfra; SQL: supabase/migrations/20261129_90_test_infra.sql).
 * Pure: the batch id, the fresh-TOTP rule, the storage chunks and the Arabic
 * wording. Relative / type-only imports only — `node --test` loads it.
 */
import { accessTokenClaims } from "../auth/staffMfa.ts";

/** The batch id format the database checks too («qa-2026-11-19-a»). */
export const TEST_BATCH_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

export function validBatchId(v: unknown): v is string {
  return typeof v === "string" && TEST_BATCH_RE.test(v);
}

// ── the TOTP re-check ────────────────────────────────────────────────────────

/** A purge needs a TOTP code entered within this many seconds. */
export const FRESH_TOTP_MAX_AGE_S = 300;

export const TOTP_NOT_ENROLLED_AR =
  "مسح الدفعة يتطلب تفعيل التحقق بخطوتين (Google Authenticator) لحسابك أولاً — من الأمان ← التحقق بخطوتين.";
export const TOTP_STALE_AR = "أدخل رمز التحقق من تطبيق المصادقة الآن لتأكيد المسح (صالح خمس دقائق).";

export type FreshTotpDecision =
  | { ok: true }
  | { ok: false; code: "totp_not_enrolled" | "totp_required"; error: string };

/** The latest `totp` entry of the token's `amr` claim, in epoch seconds, or null. */
export function lastTotpAt(accessToken: string | null | undefined): number | null {
  const amr = accessTokenClaims(accessToken)?.amr;
  if (!Array.isArray(amr)) return null;
  let last: number | null = null;
  for (const e of amr) {
    if (typeof e !== "object" || e === null) continue;
    const m = (e as { method?: unknown }).method;
    const t = (e as { timestamp?: unknown }).timestamp;
    if (m === "totp" && typeof t === "number" && Number.isFinite(t)) last = last === null ? t : Math.max(last, t);
  }
  return last;
}

/**
 * A purge is confirmed only by a TOTP code entered just now: a verified TOTP
 * factor, an aal2 session, and a `totp` amr entry no older than
 * FRESH_TOTP_MAX_AGE_S (a little clock skew ahead is tolerated). An admin
 * without TOTP is refused even while ADMIN_MFA_ENFORCE is off.
 */
export function freshTotpDecision(input: {
  hasVerifiedTotp: boolean;
  accessToken: string | null | undefined;
  nowS: number;
  maxAgeS?: number;
}): FreshTotpDecision {
  if (!input.hasVerifiedTotp) return { ok: false, code: "totp_not_enrolled", error: TOTP_NOT_ENROLLED_AR };
  const claims = accessTokenClaims(input.accessToken);
  const at = lastTotpAt(input.accessToken);
  const maxAge = input.maxAgeS ?? FRESH_TOTP_MAX_AGE_S;
  if (claims?.aal !== "aal2" || at === null || input.nowS - at > maxAge || at - input.nowS > 60) {
    return { ok: false, code: "totp_required", error: TOTP_STALE_AR };
  }
  return { ok: true };
}

// ── the files ────────────────────────────────────────────────────────────────

export interface PurgeFile {
  bucket: string;
  name: string;
}

/** The purge's file list → Storage API calls of at most `size` paths per bucket. */
export function chunkFilesByBucket(files: unknown, size = 100): Array<{ bucket: string; names: string[] }> {
  const byBucket = new Map<string, string[]>();
  if (Array.isArray(files)) {
    for (const f of files) {
      const bucket = (f as PurgeFile | null)?.bucket;
      const name = (f as PurgeFile | null)?.name;
      if (typeof bucket !== "string" || !bucket || typeof name !== "string" || !name) continue;
      const list = byBucket.get(bucket) ?? [];
      list.push(name);
      byBucket.set(bucket, list);
    }
  }
  const out: Array<{ bucket: string; names: string[] }> = [];
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += size) out.push({ bucket, names: names.slice(i, i + size) });
  }
  return out;
}

// ── wording ──────────────────────────────────────────────────────────────────

export const TEST_BATCH_ERRORS_AR = {
  invalid: "معرّف الدفعة غير صالح: أحرف إنجليزية صغيرة وأرقام وشرطات فقط، من ٣ إلى ٦٤ حرفاً (مثل qa-2026-11-20-a).",
  notTest: "هذا الحساب ليس حساب اختبار، ولا تُنقل إلى الدفعات إلا حسابات الاختبار.",
  confirm: "اكتب معرّف الدفعة نفسه لتأكيد المسح.",
  notReady: "لم يُشغَّل ملف قاعدة البيانات 20261129_90 بعد، فلا وسوم ولا مسح حتى يُشغَّل.",
  failed: "تعذّر تنفيذ العملية الآن — حاول مجدداً.",
} as const;

/** The reason a row was not deleted, in Arabic. */
export function onDeleteAr(code: unknown): string {
  switch (code) {
    case "c":
      return "سيُحذف معه تلقائياً";
    case "n":
    case "d":
      return "سيُعدَّل فيه حقل الربط";
    default:
      return "يمنع الحذف";
  }
}

export interface PurgeResult {
  status?: string;
  would_purge?: boolean;
  error?: string | null;
  blockers?: Array<{ table?: string; references?: string; rows?: number }>;
  tables?: Record<string, { tagged?: number; delete?: number; kept_real_link?: number }>;
  files?: { count?: number };
}

/** One line for the admin after a dry-run or a purge. */
export function purgeSummaryAr(r: PurgeResult, filesRemoved?: number, filesFailed?: number): string {
  const rows = Object.values(r.tables ?? {}).reduce((n, t) => n + (Number(t.delete) || 0), 0);
  const kept = Object.values(r.tables ?? {}).reduce((n, t) => n + (Number(t.kept_real_link) || 0), 0);
  const files = Number(r.files?.count) || 0;
  const keptLine = kept > 0 ? ` ويبقى ${kept} صفاً مرتبطاً بحساب حقيقي.` : "";
  switch (r.status) {
    case "dry_run":
      if ((r.blockers ?? []).length > 0) {
        return `تشغيل تجريبي: المسح ممنوع الآن — ${(r.blockers ?? []).length} ارتباطاً بصفوف حقيقية يجب حلّها أولاً.`;
      }
      if (r.error) return `تشغيل تجريبي: تعذّرت المحاكاة (${r.error}).`;
      return `تشغيل تجريبي: سيُحذف ${rows} صفاً و${files} ملفاً، ولم يُحذف شيء الآن.${keptLine}`;
    case "blocked":
      return "لم يُمسح شيء: صفوف حقيقية مرتبطة بصفوف هذه الدفعة. شغّل التجريب لترى أين.";
    case "failed":
      return `لم يُمسح شيء: ${r.error ?? "خطأ غير متوقع"}.`;
    case "purged": {
      const fileLine =
        filesFailed && filesFailed > 0
          ? ` وحُذف ${filesRemoved ?? 0} ملفاً وتعذّر حذف ${filesFailed}.`
          : ` وحُذف ${filesRemoved ?? 0} ملفاً.`;
      return `مُسحت الدفعة: حُذف ${rows} صفاً${fileLine}${keptLine}`;
    }
    default:
      return TEST_BATCH_ERRORS_AR.failed;
  }
}
