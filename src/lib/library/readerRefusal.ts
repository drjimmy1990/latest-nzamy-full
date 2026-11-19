/**
 * readerRefusal.ts — what a library reader shows when the server refuses a
 * document (owner decision 2026-11-07, «نافذة إيقاف التصفح السريع للمكتبة»):
 *
 *   - 423 (a library lock, readQuota.ts quotaRefusal): the owner's dialog,
 *     «تم تعليق التصفح مؤقتاً لتجاوز معدل القراءة السريع — ينتهي التعليق
 *     تلقائياً خلال [X] ساعة، أو يمكنك التواصل الفوري مع الدعم الفني للمراجعة
 *     الفورية», X computed here from `lockedUntil`;
 *   - 429 `library_hourly_limit`: «بلغت حد القراءة في هذه الساعة — يمكنك
 *     المتابعة بعد [Y] دقيقة», Y from the body's `resetsAt` only — Retry-After
 *     falls back to 3600 when the time is unknown (secondsUntil), so it would
 *     print a made-up 60 minutes;
 *   - 429 `library_daily_limit`: the server's daily message (it is not an
 *     hourly cap, so «في هذه الساعة» would be false);
 *   - 429 `library_weekly_limit` (20261129_40, register 14 item 8): the
 *     server's 7-day message plus when the window lets one more in;
 *   - any other 429 (the proxy's per-minute rate limiter, no `code`): its own
 *     message.
 *
 * The times are computed on the client at render time, never in a server
 * string an nginx cache could keep (the SSR cached-date trap).
 *
 * Pure, no imports — `node --test` loads it directly.
 */

/** The lock as the notice renders it — the same shape as useLibraryStatus's LibrarySecurityLock. */
export interface ReaderLock {
  reference: string | null;
  lockedUntil: string | null;
  message: string;
  support: string;
}

export type ReaderLimitScope = "hourly" | "daily" | "weekly" | "rate";

/** One authorised device in a device-limit refusal (owner ٤٢٧). */
export interface ReaderDevice {
  id: string;
  label: string;
  lastSeen: string | null;
}

export type ReaderRefusal =
  | { kind: "lock"; lock: ReaderLock }
  | { kind: "limit"; scope: ReaderLimitScope; messageAr: string }
  | {
      kind: "device";
      messageAr: string;
      limit: number;
      devices: ReaderDevice[];
      /**
       * Owner ٤٠ (20261127_60): "code" — a new device waits for the e-mail
       * code. Absent for the device-limit refusal itself (owner ٦٣: a third
       * device is refused with the list, never suspended).
       */
      mode?: "code";
    };

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** Arabic count + noun with the agreement a reader expects (1, 2, 3–10, 11+). */
function countedAr(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/**
 * The time left on a lock, rounded UP to whole hours: «24 ساعة», «5 ساعات»,
 * «ساعتين», «ساعة واحدة»; under one hour (or already past — the status poll
 * has not caught up yet) «أقل من ساعة». null when the lock has no end or the
 * end is not a date.
 */
export function lockHoursLeftAr(lockedUntil: string | null | undefined, now: number): string | null {
  if (!lockedUntil) return null;
  const at = Date.parse(lockedUntil);
  if (!Number.isFinite(at)) return null;
  const ms = at - now;
  if (ms < HOUR_MS) return "أقل من ساعة";
  const hours = Math.ceil(ms / HOUR_MS);
  return countedAr(hours, "ساعة واحدة", "ساعتين", "ساعات", "ساعة");
}

export const LOCK_DIALOG_TITLE_AR = "إيقاف مؤقت لتصفح المكتبة";

/**
 * The owner's sentence. Without an end (an admin lock until an admin lifts
 * it) the «ينتهي التعليق تلقائياً» clause would be a false promise, so it is
 * left out and the rest is kept.
 */
export function libraryLockDialogTextAr(lockedUntil: string | null | undefined, now: number): string {
  const left = lockHoursLeftAr(lockedUntil, now);
  return left
    ? `تم تعليق التصفح مؤقتاً لتجاوز معدل القراءة السريع — ينتهي التعليق تلقائياً خلال ${left}، أو يمكنك التواصل الفوري مع الدعم الفني للمراجعة الفورية`
    : "تم تعليق التصفح مؤقتاً لتجاوز معدل القراءة السريع — يمكنك التواصل الفوري مع الدعم الفني للمراجعة الفورية";
}

/**
 * Whole minutes until an hourly cap frees a slot, rounded up, 1–60. null
 * when unknown, invalid, or more than an hour away (an hourly cap never is —
 * a larger number means the time is not the hourly one).
 */
export function hourlyCapMinutesLeft(resetsAt: string | null | undefined, now: number): number | null {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at)) return null;
  const minutes = Math.max(1, Math.ceil((at - now) / MINUTE_MS));
  return minutes > 60 ? null : minutes;
}

export function hourlyCapMessageAr(minutes: number | null): string {
  if (minutes === null) return "بلغت حد القراءة في هذه الساعة — يمكنك المتابعة بعد قليل";
  const y = countedAr(minutes, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة");
  return `بلغت حد القراءة في هذه الساعة — يمكنك المتابعة بعد ${y}`;
}

const DAILY_FALLBACK_AR =
  "بلغت الحد اليومي لفتح النص الكامل في المكتبة. الوثائق التي فتحتها اليوم تبقى متاحة لك، ويتجدد الحد عند منتصف الليل بتوقيت الرياض.";

/**
 * Owner item 3.2 (batch l8): the daily message names WHEN the limit renews —
 * computed here, on the client, from the body's `resetsAt` (never in a server
 * string an nginx cache could keep). null when the time is unknown or past.
 */
export function dailyResetLineAr(resetsAt: string | null | undefined, now: number): string | null {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at) || at <= now) return null;
  const minutes = Math.max(1, Math.ceil((at - now) / MINUTE_MS));
  if (minutes < 60) return `يتجدد حدّك بعد ${minutes} دقيقة.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `يتجدد حدّك بعد ${hours} ساعة.` : `يتجدد حدّك بعد ${hours} ساعة و${rest} دقيقة.`;
}
/**
 * Owner register 14 item 8: when the 7-day window (150 opens) lets one more
 * document in — computed on the client from the body's `resetsAt` (a Riyadh
 * midnight). Days and hours past a day, else the daily wording. null when the
 * time is unknown or past.
 */
export function weeklyResetLineAr(resetsAt: string | null | undefined, now: number): string | null {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at) || at <= now) return null;
  const minutes = Math.max(1, Math.ceil((at - now) / MINUTE_MS));
  if (minutes < 24 * 60) {
    const line = dailyResetLineAr(resetsAt, now);
    return line ? line.replace("يتجدد حدّك", "يتجدد حدّك الأسبوعي") : null;
  }
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const d = countedAr(days, "يوم واحد", "يومين", "أيام", "يوماً");
  if (hours === 0) return `يتجدد حدّك الأسبوعي بعد ${d}.`;
  const h = countedAr(hours, "ساعة واحدة", "ساعتين", "ساعات", "ساعة");
  return `يتجدد حدّك الأسبوعي بعد ${d} و${h}.`;
}

const WEEKLY_FALLBACK_AR =
  "بلغت الحد الأسبوعي لفتح النص الكامل في المكتبة. الوثائق التي فتحتها اليوم تبقى متاحة لك.";
const RATE_FALLBACK_AR = "طلبات كثيرة — حاول بعد قليل.";
const LOCK_FALLBACK_AR = "أُوقفت القراءة في المكتبة القانونية لحسابك مؤقتاً.";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * A refused library document read → what to show, or null when the status is
 * not a quota refusal (404, 500 … keep their own handling). `body` is the
 * parsed JSON or anything else (an unparsable body is tolerated).
 */
export function readerRefusalFrom(status: number, body: unknown, now: number): ReaderRefusal | null {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (status === 403) return deviceRefusalFrom(b);
  if (status === 423) {
    const support = text(b.support);
    return {
      kind: "lock",
      lock: {
        reference: text(b.reference),
        lockedUntil: text(b.lockedUntil),
        message: text(b.error) ?? LOCK_FALLBACK_AR,
        support: support && /^\/(?!\/)/.test(support) ? support : "/contact",
      },
    };
  }
  if (status !== 429) return null;
  if (b.code === "library_hourly_limit") {
    return { kind: "limit", scope: "hourly", messageAr: hourlyCapMessageAr(hourlyCapMinutesLeft(text(b.resetsAt), now)) };
  }
  if (b.code === "library_daily_limit") {
    const base = text(b.error) ?? DAILY_FALLBACK_AR;
    const reset = dailyResetLineAr(text(b.resetsAt), now);
    return { kind: "limit", scope: "daily", messageAr: reset ? `${base} ${reset}` : base };
  }
  if (b.code === "library_weekly_limit") {
    const base = text(b.error) ?? WEEKLY_FALLBACK_AR;
    const reset = weeklyResetLineAr(text(b.resetsAt), now);
    return { kind: "limit", scope: "weekly", messageAr: reset ? `${base} ${reset}` : base };
  }
  return { kind: "limit", scope: "rate", messageAr: text(b.error) ?? RATE_FALLBACK_AR };
}

/**
 * The device refusal (owner ٤٢٧) in a reader's LATER fetch — the next window
 * of a book or a precedents collection, a jump, the feqh preview — or null for
 * any other answer, which keeps its own error line. A 403 device refusal
 * replaces the whole reader (LibraryDeviceLimitPage), as on the first load
 * (final review of batch 2026-11-08, item 9).
 */
export function deviceRefusalOf(status: number, body: unknown): Extract<ReaderRefusal, { kind: "device" }> | null {
  if (status !== 403) return null;
  const refusal = readerRefusalFrom(403, body, 0);
  return refusal?.kind === "device" ? refusal : null;
}

const DEVICE_CODE_FALLBACK_AR = "هذا جهاز جديد على حسابك. أدخل رمز التحقق المرسل إلى بريدك لتفتح المكتبة منه.";

const DEVICE_FALLBACK_AR =
  "هذا الحساب مفعّل على جهازين بالفعل. سجّل الخروج من أحد أجهزتك المصرّحة لتفتح المكتبة من هذا الجهاز.";

/**
 * Owner ٤٢٧: a 403 `device_limit` (src/lib/library/deviceLimit.ts) — the
 * account already reads the library on its authorised devices. Any other 403
 * is not a refusal this file renders (null).
 */
function deviceRefusalFrom(b: Record<string, unknown>): ReaderRefusal | null {
  // device_cookie_required: a read that carried no device id while the limit
  // is on (a Bearer caller; a browser always gets one minted).
  if (
    b.code !== "device_limit" &&
    b.code !== "device_cookie_required" &&
    b.code !== "device_code_required" &&
    b.code !== "device_limit_suspended"
  ) {
    return null;
  }
  const devices: ReaderDevice[] = [];
  if (Array.isArray(b.devices)) {
    for (const d of b.devices) {
      if (!d || typeof d !== "object") continue;
      const r = d as Record<string, unknown>;
      const id = text(r.id);
      if (!id) continue;
      devices.push({ id, label: text(r.label) ?? "جهاز", lastSeen: text(r.lastSeen) });
    }
  }
  const limit = typeof b.limit === "number" && Number.isFinite(b.limit) ? Math.trunc(b.limit) : 2;
  if (b.code === "device_code_required") {
    return { kind: "device", messageAr: text(b.error) ?? DEVICE_CODE_FALLBACK_AR, limit, devices, mode: "code" };
  }
  // device_limit_suspended (batch 7, removed by owner ٦٣) is no longer sent;
  // an old answer reads as the plain refusal, never «أُوقف الحساب».
  if (b.code === "device_limit_suspended") {
    return { kind: "device", messageAr: DEVICE_FALLBACK_AR, limit, devices };
  }
  return { kind: "device", messageAr: text(b.error) ?? DEVICE_FALLBACK_AR, limit, devices };
}

/**
 * «آخر استخدام» for a device row, computed on the client at render time (never
 * in a server string): «الآن», «منذ 5 دقائق», «منذ ساعتين», else the Riyadh
 * date. null for a missing or invalid time.
 */
export function deviceLastSeenAr(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const ms = Math.max(0, now - at);
  if (ms < MINUTE_MS) return "الآن";
  if (ms < HOUR_MS) {
    const m = Math.floor(ms / MINUTE_MS);
    return `منذ ${countedAr(m, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}`;
  }
  if (ms < 24 * HOUR_MS) {
    const h = Math.floor(ms / HOUR_MS);
    return `منذ ${countedAr(h, "ساعة", "ساعتين", "ساعات", "ساعة")}`;
  }
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
      timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric",
    }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}
