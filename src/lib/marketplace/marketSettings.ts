/**
 * marketSettings.ts — the pure half of the open market (owner answers of
 * 20 Nov 2026, batch l12 «market»):
 *
 *   Q130a «يُفتح السوق الآن: الطلبات تظهر لكل المحامين المؤهلين بلا اسم
 *         العميل، والإدارة تُسند متى شاءت، وقبول المحامي ينتظر اعتمادها بمهلة
 *         30 دقيقة ثم تنبيه بلا قبول تلقائي».
 *   Q151  still open: «فوري» may replace the window — so the way a lawyer's
 *         ask is accepted is a setting (admin_approval by default, instant).
 *   N9    «المنصة وسيط لا ضامن ولا أمين على الأتعاب» on the market terms and
 *         on every offer (RAW[38], F02 §1 #34).
 *
 * The database half is supabase/migrations/20261202_70_market_open.sql
 * (platform_settings.marketplace_market, marketplace_acceptances and the
 * marketplace_* functions). Payment through the platform stays OFF: nothing
 * here collects, holds or moves money.
 *
 * No imports — `node --test` loads this file directly.
 */

export const MARKET_SETTING_KEY = "marketplace_market";
export const COMMISSION_SETTING_KEY = "marketplace_commission_pct";

/** N9, the owner's words (RAW[38]) — shown on the market terms and on every request card. */
export const INTERMEDIARY_NOTICE_AR = "المنصة وسيط لا ضامن ولا أمين على الأتعاب.";

/** The line that goes with it while payment through the platform is off (P3). */
export const NO_PLATFORM_PAYMENT_AR =
  "لا تُحصَّل الأتعاب عبر المنصة حالياً، ويُتّفق عليها بين المحامي والعميل مباشرة.";

export type AcceptMode = "admin_approval" | "instant";

export const APPROVAL_MINUTES_DEFAULT = 30;
export const APPROVAL_MINUTES_MIN = 5;
export const APPROVAL_MINUTES_MAX = 1440;

export interface MarketSettings {
  /** The market lists every new client request without a staff publish step. */
  open: boolean;
  /** Requests created before this moment are listed only when staff publish them. */
  openedAt: string | null;
  acceptMode: AcceptMode;
  approvalMinutes: number;
}

export const MARKET_DEFAULTS: Readonly<MarketSettings> = Object.freeze({
  open: true,
  openedAt: null,
  acceptMode: "admin_approval",
  approvalMinutes: APPROVAL_MINUTES_DEFAULT,
});

function validMinutes(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= APPROVAL_MINUTES_MIN && n <= APPROVAL_MINUTES_MAX ? n : null;
}

/**
 * platform_settings.marketplace_market → the settings. `row` is null when the
 * row does not exist (20261202_70 not run): then the market reads as CLOSED,
 * because the database still has the publish-only list.
 */
export function parseMarketSettings(value: unknown, rowExists = true): MarketSettings {
  if (!rowExists) return { ...MARKET_DEFAULTS, open: false };
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const openedAt = typeof v.opened_at === "string" && !Number.isNaN(Date.parse(v.opened_at)) ? v.opened_at : null;
  return {
    open: v.open === true,
    openedAt,
    acceptMode: v.accept_mode === "instant" ? "instant" : "admin_approval",
    // The SQL clamps a bad value to 5–1440 and falls back to 30 the same way.
    approvalMinutes: validMinutes(v.approval_minutes) ?? APPROVAL_MINUTES_DEFAULT,
  };
}

export type MarketPatch = Partial<Pick<MarketSettings, "open" | "acceptMode" | "approvalMinutes">>;

/** Validates an admin's PATCH body; returns the patch or an Arabic error. */
export function readMarketPatch(body: unknown): { ok: true; patch: MarketPatch } | { ok: false; error: string } {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!b) return { ok: false, error: "بيانات غير صالحة" };
  const patch: MarketPatch = {};
  if ("open" in b) {
    if (typeof b.open !== "boolean") return { ok: false, error: "قيمة فتح السوق يجب أن تكون نعم أو لا." };
    patch.open = b.open;
  }
  if ("acceptMode" in b) {
    if (b.acceptMode !== "admin_approval" && b.acceptMode !== "instant") {
      return { ok: false, error: "طريقة القبول: اعتماد الإدارة أو فوري." };
    }
    patch.acceptMode = b.acceptMode;
  }
  if ("approvalMinutes" in b) {
    const m = validMinutes(b.approvalMinutes);
    if (m === null) {
      return { ok: false, error: `مهلة الاعتماد عدد صحيح من ${APPROVAL_MINUTES_MIN} إلى ${APPROVAL_MINUTES_MAX} دقيقة.` };
    }
    patch.approvalMinutes = m;
  }
  return { ok: true, patch };
}

/**
 * The stored JSON after an admin's patch. Opening a closed market stamps a
 * new opened_at, so only requests from that moment on are listed (no flood of
 * old ones); keeping it open keeps the old stamp.
 */
export function applyMarketPatch(current: MarketSettings, patch: MarketPatch, nowIso: string): Record<string, unknown> {
  const open = patch.open ?? current.open;
  const openedAt = open && (!current.open || !current.openedAt) ? nowIso : current.openedAt;
  return {
    open,
    opened_at: openedAt,
    accept_mode: patch.acceptMode ?? current.acceptMode,
    approval_minutes: patch.approvalMinutes ?? current.approvalMinutes,
  };
}

// ── the lawyer's ask ──────────────────────────────────────────────────────────

export type AcceptResult =
  | "pending"
  | "assigned"
  | "already_pending"
  | "not_open"
  | "not_verified"
  | "not_signed_in"
  | "test_account"
  | "too_many_pending";

/** What the lawyer is told, and the HTTP status, for each answer of marketplace_request_accept. */
export function acceptResultReply(result: unknown, approvalMinutes?: number): { status: number; message: string } {
  switch (result) {
    case "pending":
      return {
        status: 200,
        message: `أُرسل طلبك إلى إدارة المنصة لاعتماده${approvalMinutes ? ` (المهلة ${toArabicDigits(approvalMinutes)} دقيقة)` : ""}. لا يُسند إليك الطلب إلا بعد الاعتماد، وتصلك النتيجة في الإشعارات.`,
      };
    case "assigned":
      return { status: 200, message: "أُسند الطلب إليك. تجده في «طلبات أُسندت إليّ» أسفل الصفحة." };
    case "already_pending":
      return { status: 200, message: "طلبك على هذا الطلب مُرسَل من قبل، وهو بانتظار اعتماد الإدارة." };
    case "not_open":
      return { status: 409, message: "لم يعد هذا الطلب متاحاً في السوق." };
    case "not_verified":
      return { status: 403, message: "قبول الطلبات للمحامين الموثَّقين فقط، بعد اعتماد ترخيصك." };
    case "not_signed_in":
      return { status: 401, message: "سجّل الدخول أولاً." };
    case "test_account":
      return { status: 403, message: "الحسابات التجريبية لا تقبل طلبات العملاء الحقيقية." };
    case "too_many_pending":
      return { status: 429, message: "لديك عشرة طلبات بانتظار الاعتماد. انتظر قرار الإدارة أو اسحب بعضها." };
    default:
      return { status: 500, message: "تعذّر إرسال طلبك الآن. حاول مجدداً." };
  }
}

export type AcceptanceStatus = "pending" | "approved" | "rejected" | "withdrawn" | "superseded";

export const ACCEPTANCE_STATUS_AR: Readonly<Record<AcceptanceStatus, string>> = {
  pending: "بانتظار اعتماد الإدارة",
  approved: "أُسند إليك",
  rejected: "لم تعتمده الإدارة",
  withdrawn: "سحبتَه",
  superseded: "أُسند لغيرك",
};

export function acceptanceStatusAr(status: unknown): string {
  return typeof status === "string" && status in ACCEPTANCE_STATUS_AR
    ? ACCEPTANCE_STATUS_AR[status as AcceptanceStatus]
    : "غير معروف";
}

/** A pending ask past its window (the admin is alerted; never accepted automatically). */
export function isOverdue(row: { status?: unknown; due_at?: unknown }, nowMs: number): boolean {
  if (row.status !== "pending" || typeof row.due_at !== "string") return false;
  const due = Date.parse(row.due_at);
  return !Number.isNaN(due) && due < nowMs;
}

/** The admin's decision reply for marketplace_acceptance_decide / marketplace_assign_lawyer. */
export function decideResultReply(result: unknown): { status: number; message: string } {
  switch (result) {
    case "approved":
      return { status: 200, message: "اعتُمد القبول وأُسند الطلب إلى المحامي." };
    case "assigned":
      return { status: 200, message: "أُسند الطلب إلى المحامي." };
    case "rejected":
      return { status: 200, message: "رُفض طلب القبول." };
    case "taken":
      return { status: 409, message: "الطلب أُسند من قبل، فلم يُعتمد هذا القبول." };
    case "not_pending":
      return { status: 409, message: "سبق البتّ في طلب القبول هذا." };
    case "not_found":
      return { status: 404, message: "طلب القبول غير موجود." };
    case "lawyer_not_verified":
      return { status: 409, message: "المحامي غير موثَّق الآن، فلا يُسند إليه." };
    case "lawyer_is_test_account":
      return { status: 409, message: "حساب تجريبي، فلا يُسند إليه طلب عميل حقيقي." };
    case "not_assignable":
      return { status: 409, message: "لا يمكن إسناد هذا الطلب الآن: أُسند لمحامٍ آخر أو تغيّرت حالته." };
    default:
      return { status: 500, message: "تعذّر حفظ القرار." };
  }
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export function toArabicDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

/** The RPC / table is missing: 20261202_70 has not run (42883, PGRST202, 42P01, PGRST205). */
export function isMarketSqlMissing(code: unknown): boolean {
  return code === "42883" || code === "PGRST202" || code === "42P01" || code === "PGRST205";
}

export const MARKET_SQL_MISSING_AR = "قبول طلبات السوق غير مفعّل بعد على قاعدة البيانات (ملف SQL ‏20261202_70).";
