/**
 * idleSignOut.ts — T5 (batch l11-sec): sign a session out after the idle time
 * the user chose in Settings → Security («مهلة الجلسة»,
 * user_settings.session_timeout_minutes). Pure: `node --test` loads it; the
 * browser half is src/hooks/useSessionIdleGuard.ts.
 *
 * WHEN IT IS ENFORCED. The column is NOT NULL DEFAULT 60 (20260603_phase1_004),
 * so any settings save (notifications, privacy, onboarding) creates a row with
 * 60 that the user never chose, and GET /api/v1/settings answers 60 when there
 * is no row at all. «Unset» therefore keeps today's behaviour (no automatic
 * sign-out). The timeout is enforced when the user has CHOSEN it:
 *   - SecurityTab saves preferences.sessionTimeoutChosen = true with it, or
 *   - the stored value is not the default 60 (only SecurityTab writes it).
 */

export const IDLE_DEFAULT_MINUTES = 60;
/** The bounds the hook accepts (the tab offers 15–240). */
export const IDLE_MIN_MINUTES = 5;
export const IDLE_MAX_MINUTES = 24 * 60;
/** preferences key SecurityTab writes when the user saves the timeout. */
export const IDLE_CHOSEN_PREF = "sessionTimeoutChosen";
/** localStorage key holding the last activity (ms) across this browser's tabs. */
export const IDLE_ACTIVITY_KEY = "nzamy_last_activity";
/** Window event SecurityTab dispatches after a save, so the guard re-reads. */
export const IDLE_SETTINGS_EVENT = "nzamy:session-timeout-saved";
/** Where the guard sends a timed-out session. */
export const IDLE_LOGIN_PATH = "/login?reason=idle";

export const IDLE_NOTICE_AR = "انتهت جلستك بعد مدة من عدم النشاط حمايةً لحسابك. سجّل الدخول من جديد.";

/** The enforced timeout in ms, or null when nothing is enforced. */
export function idleTimeoutMs(settings: unknown): number | null {
  if (!settings || typeof settings !== "object") return null;
  const s = settings as { session_timeout_minutes?: unknown; preferences?: unknown };
  const minutes = s.session_timeout_minutes;
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return null;
  const m = Math.round(minutes);
  if (m < IDLE_MIN_MINUTES || m > IDLE_MAX_MINUTES) return null;
  const prefs = s.preferences && typeof s.preferences === "object" ? (s.preferences as Record<string, unknown>) : {};
  const chosen = prefs[IDLE_CHOSEN_PREF] === true || m !== IDLE_DEFAULT_MINUTES;
  return chosen ? m * 60_000 : null;
}

/** How long before the sign-out the warning shows: 60 s, or a quarter of a short timeout. */
export function idleWarnMs(timeoutMs: number): number {
  return Math.min(60_000, Math.floor(timeoutMs / 4));
}

export type IdlePhase = "active" | "warn" | "expired";

export function idlePhase(lastActivityMs: number, nowMs: number, timeoutMs: number): IdlePhase {
  const idle = Math.max(0, nowMs - lastActivityMs);
  if (idle >= timeoutMs) return "expired";
  if (idle >= timeoutMs - idleWarnMs(timeoutMs)) return "warn";
  return "active";
}

/** Seconds left before the sign-out (never negative). */
export function idleSecondsLeft(lastActivityMs: number, nowMs: number, timeoutMs: number): number {
  return Math.max(0, Math.ceil((lastActivityMs + timeoutMs - nowMs) / 1000));
}

/** The shared last-activity value read from storage: a finite past-or-now number, else null. */
export function parseStoredActivity(raw: string | null | undefined, nowMs: number): number | null {
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, nowMs);
}
