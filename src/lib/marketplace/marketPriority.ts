/**
 * marketPriority.ts — the pure half of «نافذة أولوية نظامي» (owner س٢٣,
 * decided 25 Nov 2026; batch l16):
 *
 *   «nzamy_priority_minutes من الإدارة، افتراضي 30 دقيقة في ساعات العمل وبث
 *   تلقائي + خيار العميل «افتحه للجميع فوراً»».
 *
 * A client's new free request goes to the Nezamy team first for N minutes
 * counted in working hours, then joins the lawyers' market by itself. The
 * database half is supabase/migrations/20261206_40_nzamy_priority_minutes.sql:
 * it stamps service_requests.marketplace_release_at when the row is created
 * and does the working-hours arithmetic (never mirrored here — a screen shows
 * the stamped moment). This file validates the admin's two settings and
 * writes the Arabic the client and the admin read.
 *
 * No imports — `node --test` loads this file directly.
 */

export const PRIORITY_MINUTES_KEY = "nzamy_priority_minutes";
export const WORKING_HOURS_KEY = "nzamy_working_hours";

/** The owner's choices (main report §1.6.3): 0 = no hold. */
export const PRIORITY_MINUTES_CHOICES = [0, 15, 30, 60] as const;
export type PriorityMinutes = (typeof PRIORITY_MINUTES_CHOICES)[number];
export const PRIORITY_MINUTES_DEFAULT: PriorityMinutes = 30;

export interface WorkingHours {
  /** IANA zone; only Asia/Riyadh is offered on the screen. */
  tz: string;
  /** Day-of-week numbers, 0 = Sunday … 6 = Saturday (Postgres `dow`). */
  days: number[];
  /** "HH:MM", 24 h. */
  start: string;
  end: string;
}

export const WORKING_HOURS_DEFAULT: Readonly<WorkingHours> = Object.freeze({
  tz: "Asia/Riyadh",
  days: [0, 1, 2, 3, 4],
  start: "09:00",
  end: "17:00",
});

export const DAY_NAMES_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function parsePriorityMinutes(value: unknown): PriorityMinutes {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return (PRIORITY_MINUTES_CHOICES as readonly unknown[]).includes(n) ? (n as PriorityMinutes) : PRIORITY_MINUTES_DEFAULT;
}

/** The stored JSON → the hours, field by field like the SQL (a bad field keeps its default). */
export function parseWorkingHours(value: unknown): WorkingHours {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const tz = v.tz === "Asia/Riyadh" ? v.tz : WORKING_HOURS_DEFAULT.tz;
  const days = Array.isArray(v.days)
    ? [...new Set(v.days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort((a, b) => a - b)
    : [];
  const pairOk = typeof v.start === "string" && typeof v.end === "string" && HHMM.test(v.start) && HHMM.test(v.end) && v.start < v.end;
  return {
    tz,
    days: days.length > 0 ? days : [...WORKING_HOURS_DEFAULT.days],
    start: pairOk ? (v.start as string) : WORKING_HOURS_DEFAULT.start,
    end: pairOk ? (v.end as string) : WORKING_HOURS_DEFAULT.end,
  };
}

export interface PriorityPatch {
  minutes?: PriorityMinutes;
  workingHours?: WorkingHours;
}

/** Validates the admin's PATCH body; returns the patch or an Arabic error. */
export function readPriorityPatch(body: unknown): { ok: true; patch: PriorityPatch } | { ok: false; error: string } {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!b) return { ok: false, error: "بيانات غير صالحة" };
  const patch: PriorityPatch = {};
  if ("minutes" in b) {
    if (!(PRIORITY_MINUTES_CHOICES as readonly unknown[]).includes(b.minutes)) {
      return { ok: false, error: "مدة الأولوية: ٠ أو ١٥ أو ٣٠ أو ٦٠ دقيقة." };
    }
    patch.minutes = b.minutes as PriorityMinutes;
  }
  if ("workingHours" in b) {
    const w = b.workingHours && typeof b.workingHours === "object" && !Array.isArray(b.workingHours) ? (b.workingHours as Record<string, unknown>) : null;
    if (!w) return { ok: false, error: "ساعات العمل غير صالحة." };
    if (w.tz !== undefined && w.tz !== "Asia/Riyadh") return { ok: false, error: "المنطقة الزمنية المتاحة: توقيت الرياض." };
    if (!Array.isArray(w.days) || w.days.length === 0 || !w.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      return { ok: false, error: "اختر يوم عمل واحداً على الأقل." };
    }
    if (typeof w.start !== "string" || typeof w.end !== "string" || !HHMM.test(w.start) || !HHMM.test(w.end)) {
      return { ok: false, error: "اكتب بداية الدوام ونهايته بصيغة ساعة:دقيقة (مثل 09:00)." };
    }
    if (w.start >= w.end) return { ok: false, error: "نهاية الدوام يجب أن تكون بعد بدايته في اليوم نفسه." };
    patch.workingHours = { tz: "Asia/Riyadh", days: [...new Set(w.days as number[])].sort((a, b) => a - b), start: w.start, end: w.end };
  }
  if (patch.minutes === undefined && patch.workingHours === undefined) return { ok: false, error: "لا شيء لحفظه." };
  return { ok: true, patch };
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function arDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

/** "الأحد–الخميس" for a run of days, else the names joined. */
export function workingDaysAr(days: readonly number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const run = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (run && sorted.length >= 3) return `${DAY_NAMES_AR[sorted[0]]}–${DAY_NAMES_AR[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_NAMES_AR[d]).join("، ");
}

export function workingHoursAr(h: WorkingHours): string {
  return `${workingDaysAr(h.days)} من ${arDigits(h.start)} إلى ${arDigits(h.end)} بتوقيت الرياض`;
}

/**
 * The disclosure on the request form (owner: «الإفصاح الواضح في بطاقة إنشاء
 * الطلب»). null when the window is 0 (nothing to disclose).
 */
export function priorityDisclosureAr(minutes: number, hours: WorkingHours): string | null {
  if (!minutes) return null;
  return `يُعرض طلبك أولاً على فريق نظامي مدة ${arDigits(minutes)} دقيقة من ساعات العمل (${workingHoursAr(hours)})، ثم يُعرض تلقائياً على جميع المحامين الموثَّقين في السوق إن لم يتولَّه الفريق. ويمكنك فتحه للجميع فوراً.`;
}

export const OPEN_NOW_LABEL_AR = "افتحه للجميع فوراً";

/** What the client is told after «افتحه للجميع فوراً», and the HTTP status. */
export function openNowResultReply(result: unknown): { status: number; message: string } {
  switch (result) {
    case "opened":
      return { status: 200, message: "فُتح طلبك لجميع المحامين الموثَّقين في السوق." };
    case "already_open":
      return { status: 200, message: "طلبك معروض على جميع المحامين الموثَّقين من قبل." };
    case "not_open":
      return { status: 409, message: "لا يمكن فتح هذا الطلب للسوق: أُسند أو تغيّرت حالته." };
    case "not_found":
      return { status: 404, message: "الطلب غير موجود." };
    default:
      return { status: 500, message: "تعذّر تنفيذ ذلك الآن. حاول مجدداً." };
  }
}

/** The SQL is not there yet (column / function / setting missing). */
export function isPrioritySqlMissing(code: unknown): boolean {
  return code === "42703" || code === "42883" || code === "PGRST202" || code === "PGRST204";
}

export const PRIORITY_SQL_MISSING_AR = "نافذة أولوية نظامي غير مفعّلة بعد على قاعدة البيانات (ملف SQL ‏20261206_40).";

/** Is the stamped moment still ahead (the request is held)? */
export function isHeld(releaseAt: unknown, nowMs: number): boolean {
  if (typeof releaseAt !== "string") return false;
  const t = Date.parse(releaseAt);
  return !Number.isNaN(t) && t > nowMs;
}
