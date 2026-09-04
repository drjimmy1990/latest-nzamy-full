/**
 * preferencesMerge.ts — pure validation + shallow-merge for
 * PATCH /api/v1/settings/preferences (Phase 6, out-of-browser settings).
 * ─────────────────────────────────────────────────────────
 * Kept free of Next.js/Supabase imports so it is testable with plain
 * `node --test`. The route (src/app/api/v1/settings/preferences/route.ts)
 * is the only caller in production; it does the auth, the DB read/upsert
 * and the dashboardMode write-through — everything here is arithmetic on
 * plain objects.
 *
 * "Shallow merge" means: a top-level key present in the patch REPLACES the
 * stored value for that key wholesale (readingActivity is not deep-merged
 * field-by-field — the caller sends the complete object it read, mutated).
 * Keys never mentioned in the patch — including keys this module knows
 * nothing about, like `notifications` (NotificationsTab) — are left
 * untouched by mergePreferences.
 *
 * PREFERENCE_KEYS and the three shapes below mirror preferencesService.ts
 * exactly (that file is the client contract) but are NOT imported from it:
 * preferencesService.ts pulls in "@/lib/services/api", whose "@/" alias
 * `node --test` cannot resolve outside the Next.js bundler. Same reason
 * src/app/api/v1/lawyer/consultations/_shared.ts keeps its own
 * FIRM_ROLE_VALUES-style runtime copy instead of importing a "use client"
 * module's constant. If PREFERENCE_KEYS ever changes, change it in both
 * places.
 */

export const PREFERENCE_KEYS = ["readingActivity", "recentSessions", "dashboardMode"] as const;

export interface ReadingActivity {
  lawsThisWeek: number;
  lawsThisMonth: number;
  articles: number;
  principles: number;
  feqhPages: number;
  lastWeekReset: string | null;
  lastMonthReset: string | null;
}

export interface RecentSession {
  slug: string;
  title: string;
  titleEn?: string;
  catId?: string;
  type?: string;
  openedAt?: string;
}

export interface UserPreferences {
  readingActivity?: ReadingActivity;
  recentSessions?: RecentSession[];
  dashboardMode?: "light" | "full";
}

const READING_ACTIVITY_NUMBER_KEYS = ["lawsThisWeek", "lawsThisMonth", "articles", "principles", "feqhPages"] as const;
const READING_ACTIVITY_RESET_KEYS = ["lastWeekReset", "lastMonthReset"] as const;
const RECENT_SESSION_REQUIRED_KEYS = ["slug", "title"] as const;
const RECENT_SESSION_OPTIONAL_STRING_KEYS = ["titleEn", "catId", "type", "openedAt"] as const;
export const RECENT_SESSIONS_MAX = 10;
const DASHBOARD_MODES = ["light", "full"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the validated ReadingActivity, or an Arabic error message. */
function validateReadingActivity(value: unknown): ReadingActivity | string {
  if (!isPlainObject(value)) return "نشاط القراءة يجب أن يكون كائناً صالحاً.";

  const allowedKeys = new Set<string>([...READING_ACTIVITY_NUMBER_KEYS, ...READING_ACTIVITY_RESET_KEYS]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) return `حقل غير معروف في نشاط القراءة: ${key}`;
  }

  const out = {} as ReadingActivity;
  for (const key of READING_ACTIVITY_NUMBER_KEYS) {
    const n = value[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
      return `القيمة غير صالحة لحقل «${key}» في نشاط القراءة — يجب أن تكون رقماً غير سالب.`;
    }
    out[key] = n;
  }
  for (const key of READING_ACTIVITY_RESET_KEYS) {
    const v = value[key];
    if (v !== null && typeof v !== "string") {
      return `القيمة غير صالحة لحقل «${key}» في نشاط القراءة — يجب أن تكون نصاً أو null.`;
    }
    out[key] = v === undefined ? null : v;
  }
  return out;
}

/** Returns the validated, 10-capped RecentSession[], or an Arabic error message. */
function validateRecentSessions(value: unknown): RecentSession[] | string {
  if (!Array.isArray(value)) return "الجلسات الأخيرة يجب أن تكون قائمة.";

  const out: RecentSession[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) return "عنصر غير صالح في الجلسات الأخيرة.";

    const session = {} as RecentSession;
    for (const key of RECENT_SESSION_REQUIRED_KEYS) {
      const v = item[key];
      if (typeof v !== "string" || v.trim() === "") {
        return `كل جلسة أخيرة يجب أن تحمل حقل «${key}» نصياً وغير فارغ.`;
      }
      session[key] = v;
    }
    for (const key of RECENT_SESSION_OPTIONAL_STRING_KEYS) {
      const v = item[key];
      if (v === undefined) continue;
      if (typeof v !== "string") return `القيمة غير صالحة لحقل «${key}» في الجلسات الأخيرة.`;
      session[key] = v;
    }
    out.push(session);
  }

  // Order as sent (caller sends newest-first); only the cap truncates.
  return out.slice(0, RECENT_SESSIONS_MAX);
}

// A dedicated type predicate rather than the `T | string` return shape the
// other two validators use: dashboardMode's own valid values ARE strings, so
// `typeof result === "string"` could never tell a validated "light"/"full"
// apart from an Arabic error string.
function isDashboardMode(value: unknown): value is "light" | "full" {
  return value === "light" || value === "full";
}

const DASHBOARD_MODE_ERROR = `وضع لوحة التحكم غير صالح — القيم المسموحة: ${DASHBOARD_MODES.join(" أو ")}.`;

export type PreferencesValidation =
  | { ok: true; patch: Partial<UserPreferences> }
  | { ok: false; error: string };

/**
 * Validates a PATCH body: keys must be a subset of PREFERENCE_KEYS (any
 * other key → error), and each present key's value must match its shape.
 */
export function validatePreferencesPatch(body: unknown): PreferencesValidation {
  if (!isPlainObject(body)) {
    return { ok: false, error: "بيانات الطلب غير صالحة." };
  }

  const bodyKeys = Object.keys(body);
  if (bodyKeys.length === 0) {
    return { ok: false, error: "لم يتم إرسال أي حقول للتحديث." };
  }

  const known = new Set<string>(PREFERENCE_KEYS);
  for (const key of bodyKeys) {
    if (!known.has(key)) {
      return { ok: false, error: `حقل غير معروف: ${key}` };
    }
  }

  const patch: Partial<UserPreferences> = {};

  if ("readingActivity" in body) {
    const result = validateReadingActivity(body.readingActivity);
    if (typeof result === "string") return { ok: false, error: result };
    patch.readingActivity = result;
  }

  if ("recentSessions" in body) {
    const result = validateRecentSessions(body.recentSessions);
    if (typeof result === "string") return { ok: false, error: result };
    patch.recentSessions = result;
  }

  if ("dashboardMode" in body) {
    const dashboardMode = body.dashboardMode;
    if (!isDashboardMode(dashboardMode)) return { ok: false, error: DASHBOARD_MODE_ERROR };
    patch.dashboardMode = dashboardMode;
  }

  return { ok: true, patch };
}

/**
 * Shallow-merges a validated patch over the existing `preferences` jsonb.
 * `existing` is the raw column value (may carry keys this module does not
 * model, e.g. `notifications`) — those pass through untouched.
 */
export function mergePreferences(
  existing: Record<string, unknown> | null | undefined,
  patch: Partial<UserPreferences>,
): Record<string, unknown> {
  return { ...(existing ?? {}), ...patch };
}
