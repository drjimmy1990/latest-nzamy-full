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

export type ReaderLimitScope = "hourly" | "daily" | "rate";

export type ReaderRefusal =
  | { kind: "lock"; lock: ReaderLock }
  | { kind: "limit"; scope: ReaderLimitScope; messageAr: string };

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
  "بلغت الحد اليومي لفتح الوثائق في المكتبة. الوثائق التي فتحتها اليوم تبقى متاحة لك، ويتجدد الحد عند منتصف الليل بتوقيت الرياض.";
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
    return { kind: "limit", scope: "daily", messageAr: text(b.error) ?? DAILY_FALLBACK_AR };
  }
  return { kind: "limit", scope: "rate", messageAr: text(b.error) ?? RATE_FALLBACK_AR };
}
