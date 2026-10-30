/**
 * securityLockAdmin.ts — the pure half of the admin side of owner note ١٣ C09:
 * validating the «إيقاف القراءة» / «رفع الإيقاف» requests, shaping a lock row
 * for the panel, and mapping a database refusal to an Arabic answer.
 * No imports, so `node --test` loads it directly.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LOCK_NOTE_MAX = 1000;
/** An admin lock may run for at most a year; none = until lifted. */
const MAX_LOCK_DAYS = 365;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CreateLockInput {
  userId: string | null;
  email: string | null;
  note: string;
  until: string | null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** POST /api/v1/admin/library-security-locks { userId | email, note, until? } */
export function parseCreateLockBody(body: unknown, now: number): Parsed<CreateLockInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "بيانات غير صالحة" };
  const b = body as Record<string, unknown>;
  const userId = isUuid(b.userId) ? b.userId : null;
  const email = typeof b.email === "string" && EMAIL_RE.test(b.email.trim()) ? b.email.trim().toLowerCase() : null;
  if (!userId && !email) return { ok: false, error: "اكتب بريد المستخدم أو معرّفه." };
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note === "") return { ok: false, error: "اكتب سبب الإيقاف؛ يظهر في السجل لا للمستخدم." };
  if (note.length > LOCK_NOTE_MAX) return { ok: false, error: `السبب أطول من ${LOCK_NOTE_MAX} حرف.` };
  let until: string | null = null;
  if (b.until !== undefined && b.until !== null && b.until !== "") {
    const at = typeof b.until === "string" ? Date.parse(b.until) : NaN;
    if (!Number.isFinite(at)) return { ok: false, error: "تاريخ انتهاء الإيقاف غير صالح." };
    if (at <= now) return { ok: false, error: "تاريخ انتهاء الإيقاف يجب أن يكون في المستقبل." };
    if (at > now + MAX_LOCK_DAYS * 86_400_000) return { ok: false, error: "أقصى مدة للإيقاف المؤقت سنة؛ اتركه فارغاً ليبقى حتى ترفعه." };
    until = new Date(at).toISOString();
  }
  return { ok: true, value: { userId, email, note, until } };
}

export interface LiftLockInput {
  note: string | null;
  resetToday: boolean;
}

/** POST /api/v1/admin/library-security-locks/[id]/lift { note?, resetToday? } */
export function parseLiftLockBody(body: unknown): Parsed<LiftLockInput> {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > LOCK_NOTE_MAX) return { ok: false, error: `الملاحظة أطول من ${LOCK_NOTE_MAX} حرف.` };
  return { ok: true, value: { note: note === "" ? null : note, resetToday: b.resetToday !== false } };
}

export interface LockRow {
  id: string;
  user_id: string;
  reference: string;
  reason: string;
  details: unknown;
  note: string | null;
  locked_at: string;
  locked_until: string | null;
  locked_by: string | null;
  lifted_at: string | null;
  lifted_by: string | null;
  lift_note: string | null;
}

export const LOCK_SELECT =
  "id, user_id, reference, reason, details, note, locked_at, locked_until, locked_by, lifted_at, lifted_by, lift_note";

export interface PersonRef {
  name: string | null;
  email: string | null;
}

export interface LockDto {
  id: string;
  reference: string;
  reason: "quota_breach" | "admin" | string;
  reasonAr: string;
  /** Open and not past its end: the user cannot read the library now. */
  active: boolean;
  userId: string;
  user: PersonRef;
  note: string | null;
  details: Record<string, unknown> | null;
  lockedAt: string;
  lockedUntil: string | null;
  lockedBy: PersonRef | null;
  liftedAt: string | null;
  liftedBy: PersonRef | null;
  liftNote: string | null;
}

export const LOCK_REASON_AR: Readonly<Record<string, string>> = {
  quota_breach: "تجاوز متكرر لحد القراءة اليومي (تلقائي)",
  admin: "قرار من الإدارة",
};

export function toLockDto(row: LockRow, people: ReadonlyMap<string, PersonRef>, now: number): LockDto {
  const person = (id: string | null) => (id ? people.get(id) ?? { name: null, email: null } : null);
  const ended = row.locked_until !== null && Date.parse(row.locked_until) <= now;
  return {
    id: row.id,
    reference: row.reference,
    reason: row.reason,
    reasonAr: LOCK_REASON_AR[row.reason] ?? row.reason,
    active: row.lifted_at === null && !ended,
    userId: row.user_id,
    user: person(row.user_id) ?? { name: null, email: null },
    note: row.note,
    details: row.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : null,
    lockedAt: row.locked_at,
    lockedUntil: row.locked_until,
    lockedBy: person(row.locked_by),
    liftedAt: row.lifted_at,
    liftedBy: person(row.lifted_by),
    liftNote: row.lift_note,
  };
}

/** True for "the table / function is not there yet" (20261030_80 not applied). */
export function isMigrationMissing(code: string | undefined | null): boolean {
  return code === "42P01" || code === "PGRST205" || code === "PGRST202" || code === "42883";
}

export const LOCKS_MIGRATION_MISSING_AR =
  "جدول أقفال المكتبة غير موجود بعد — نفّذ ملف الترحيل 20261030_80_library_read_quota.sql أولاً.";

/** A refusal from library_security_lock_create / _lift → status + Arabic. */
export function lockDbError(err: { code?: string | null; message?: string | null } | null): { status: number; error: string } {
  if (!err) return { status: 500, error: "تعذّر حفظ العملية." };
  if (isMigrationMissing(err.code)) return { status: 503, error: LOCKS_MIGRATION_MISSING_AR };
  if (err.code === "P0001" && err.message === "admin_target") {
    return { status: 400, error: "لا يُوقَف حساب مسؤول عن قراءة المكتبة." };
  }
  if (err.code === "P0002") return { status: 404, error: "القفل غير موجود." };
  if (err.code === "22023") return { status: 400, error: "بيانات غير صالحة." };
  return { status: 500, error: "تعذّر حفظ العملية." };
}
