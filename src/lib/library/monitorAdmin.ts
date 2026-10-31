/**
 * monitorAdmin.ts — the pure half of the admin side of «نشاط المكتبة»
 * (20261031_10): validating the panel's requests, shaping review flags and
 * per-user limits for the panel, and the "today / 7 days" ranges.
 * `node --test` loads it directly.
 */
import { isUuid, type Parsed } from "./securityLockAdmin.ts";
import { REVIEW_RULE_AR, FLAG_ACTION_AR, type FlagAction } from "./monitorSettings.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MONITOR_NOTE_MAX = 1000;
const MAX_LIMIT_DAYS = 365;

export const MONITOR_MIGRATION_MISSING_AR =
  "جداول «نشاط المكتبة» غير موجودة بعد — نفّذ ملف الترحيل 20261031_10_library_activity_monitor.sql أولاً. الأرقام المعروضة هي القيم الافتراضية.";

export interface PersonRef {
  name: string | null;
  email: string | null;
}

// ─── per-user limits ─────────────────────────────────────────────────────────

export interface UserLimitInput {
  userId: string | null;
  email: string | null;
  dailyDocs: number | null;
  hourlyDocs: number | null;
  until: string | null;
  note: string;
}

function optionalCount(value: unknown, label: string): Parsed<number | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 100000) {
    return { ok: false, error: `${label}: عدد صحيح بين 1 و100000، أو اتركه فارغاً.` };
  }
  return { ok: true, value: n };
}

/** POST /api/v1/admin/library-monitor/user-limits { userId | email, dailyDocs?, hourlyDocs?, until?, note } */
export function parseUserLimitBody(body: unknown, now: number): Parsed<UserLimitInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "بيانات غير صالحة" };
  const b = body as Record<string, unknown>;
  const userId = isUuid(b.userId) ? b.userId : null;
  const email = typeof b.email === "string" && EMAIL_RE.test(b.email.trim()) ? b.email.trim().toLowerCase() : null;
  if (!userId && !email) return { ok: false, error: "اكتب بريد المستخدم أو معرّفه." };
  const daily = optionalCount(b.dailyDocs, "حد اليوم");
  if (!daily.ok) return daily;
  const hourly = optionalCount(b.hourlyDocs, "حد الساعة");
  if (!hourly.ok) return hourly;
  if (daily.value === null && hourly.value === null) return { ok: false, error: "حدّد حد اليوم أو حد الساعة على الأقل." };
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note === "") return { ok: false, error: "اكتب السبب؛ يظهر في السجل لا للمستخدم." };
  if (note.length > MONITOR_NOTE_MAX) return { ok: false, error: `السبب أطول من ${MONITOR_NOTE_MAX} حرف.` };
  let until: string | null = null;
  if (b.until !== undefined && b.until !== null && b.until !== "") {
    const at = typeof b.until === "string" ? Date.parse(b.until) : NaN;
    if (!Number.isFinite(at)) return { ok: false, error: "تاريخ الانتهاء غير صالح." };
    if (at <= now) return { ok: false, error: "تاريخ الانتهاء يجب أن يكون في المستقبل." };
    if (at > now + MAX_LIMIT_DAYS * 86_400_000) return { ok: false, error: "أقصى مدة سنة؛ اتركه فارغاً ليبقى حتى تزيله." };
    until = new Date(at).toISOString();
  }
  return { ok: true, value: { userId, email, dailyDocs: daily.value, hourlyDocs: hourly.value, until, note } };
}

export interface LimitRow {
  user_id: string;
  daily_docs: number | null;
  hourly_docs: number | null;
  until: string | null;
  source: string;
  note: string | null;
  set_by: string | null;
  set_at: string;
}
export const LIMIT_SELECT = "user_id, daily_docs, hourly_docs, until, source, note, set_by, set_at";

export interface LimitDto {
  userId: string;
  user: PersonRef;
  dailyDocs: number | null;
  hourlyDocs: number | null;
  until: string | null;
  active: boolean;
  source: "admin" | "auto_slow" | string;
  sourceAr: string;
  note: string | null;
  setBy: PersonRef | null;
  setAt: string;
}

export function toLimitDto(row: LimitRow, people: ReadonlyMap<string, PersonRef>, now: number): LimitDto {
  return {
    userId: row.user_id,
    user: people.get(row.user_id) ?? { name: null, email: null },
    dailyDocs: row.daily_docs,
    hourlyDocs: row.hourly_docs,
    until: row.until,
    active: row.until === null || Date.parse(row.until) > now,
    source: row.source,
    sourceAr: row.source === "auto_slow" ? "إبطاء تلقائي" : "قرار من الإدارة",
    note: row.note,
    setBy: row.set_by ? people.get(row.set_by) ?? { name: null, email: null } : null,
    setAt: row.set_at,
  };
}

// ─── review flags ────────────────────────────────────────────────────────────

export interface FlagRow {
  id: string;
  user_id: string;
  reference: string;
  rule: string;
  rules: string[] | null;
  details: unknown;
  action_taken: string;
  created_at: string;
  cleared_at: string | null;
  cleared_by: string | null;
  clear_note: string | null;
}
export const FLAG_SELECT = "id, user_id, reference, rule, rules, details, action_taken, created_at, cleared_at, cleared_by, clear_note";

export interface FlagDto {
  id: string;
  userId: string;
  user: PersonRef;
  reference: string;
  rule: string;
  rulesAr: string[];
  details: Record<string, unknown> | null;
  actionTaken: string;
  actionAr: string;
  createdAt: string;
  open: boolean;
  clearedAt: string | null;
  clearedBy: PersonRef | null;
  clearNote: string | null;
}

export function toFlagDto(row: FlagRow, people: ReadonlyMap<string, PersonRef>): FlagDto {
  const rules = Array.isArray(row.rules) && row.rules.length > 0 ? row.rules : [row.rule];
  return {
    id: row.id,
    userId: row.user_id,
    user: people.get(row.user_id) ?? { name: null, email: null },
    reference: row.reference,
    rule: row.rule,
    rulesAr: rules.map((r) => REVIEW_RULE_AR[r] ?? r),
    details: row.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : null,
    actionTaken: row.action_taken,
    actionAr: FLAG_ACTION_AR[row.action_taken as FlagAction] ?? row.action_taken,
    createdAt: row.created_at,
    open: row.cleared_at === null,
    clearedAt: row.cleared_at,
    clearedBy: row.cleared_by ? people.get(row.cleared_by) ?? { name: null, email: null } : null,
    clearNote: row.clear_note,
  };
}

export interface ClearFlagInput {
  note: string | null;
  /** Also remove the automatic slow-down this flag put on the reader. */
  liftSlow: boolean;
}

/** POST /api/v1/admin/library-monitor/flags/[id]/clear { note?, liftSlow? } */
export function parseClearFlagBody(body: unknown): Parsed<ClearFlagInput> {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > MONITOR_NOTE_MAX) return { ok: false, error: `الملاحظة أطول من ${MONITOR_NOTE_MAX} حرف.` };
  return { ok: true, value: { note: note === "" ? null : note, liftSlow: b.liftSlow !== false } };
}

// ─── activity ranges ─────────────────────────────────────────────────────────

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "today" = since Riyadh midnight; "week" = the last 7 × 24 hours. */
export function activitySince(range: string | null, now: number): { range: "today" | "week"; since: string } {
  if (range === "week") return { range: "week", since: new Date(now - 7 * 86_400_000).toISOString() };
  const riyadh = now + RIYADH_OFFSET_MS;
  const midnight = Math.floor(riyadh / 86_400_000) * 86_400_000 - RIYADH_OFFSET_MS;
  return { range: "today", since: new Date(midnight).toISOString() };
}

export interface TopRow {
  user_id: string;
  requests: number | string;
  docs: number | string;
  searches: number | string;
  ai_calls: number | string;
  active_hours: number | string;
  last_hour: string;
}

/** bigint columns arrive as numbers or strings from PostgREST. */
export function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
