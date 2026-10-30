/**
 * The admin side of the library-only subscription (owner note ١٨, C02–C04):
 * the pure rules behind
 *   - the direct grant (POST /api/v1/admin/entitlements/grant, action
 *     'library'): user, plan, days, a MANDATORY reason, optional notes;
 *   - the «اشتراكات المكتبة» list and its CSV export
 *     (GET /api/v1/admin/library-grants);
 *   - revoke and end change (PATCH /api/v1/admin/library-grants/[id]).
 * The writes are the 20261030_65 functions (library_grant_access /
 * library_grant_revoke / library_grant_adjust_end); this file validates what
 * reaches them, names their refusals in Arabic, and shapes the list.
 *
 * Relative imports only: `node --test` loads it (libraryAccessAdmin.test.ts).
 */

import { GRANT_MAX_DAYS, GRANT_MIN_DAYS, type LibraryPlanRef } from './libraryAccess.ts';

export const REASON_MIN_CHARS = 3;
export const REASON_MAX_CHARS = 1000;
export const NOTES_MAX_CHARS = 4000;
const DAY_MS = 86_400_000;

/** The plans an admin may grant directly. lib-founder belongs to the campaign. */
export const ADMIN_GRANTABLE_PLANS: readonly LibraryPlanRef[] = Object.freeze([
  'lib-admin',
  'lib-q1',
  'lib-q2',
  'lib-annual',
  'lib-invite',
  'lib-trial',
] as LibraryPlanRef[]);

export const LIBRARY_PLAN_LABEL_AR: Readonly<Record<string, string>> = Object.freeze({
  'lib-q1': 'ربع سنوي',
  'lib-q2': 'نصف سنوي',
  'lib-annual': 'سنوي',
  'lib-invite': 'كود دعوة',
  'lib-trial': 'تجربة',
  'lib-founder': 'حملة المؤسسين',
  'lib-admin': 'منحة إدارية',
});

/** The five sources of note ١٨ (+ the founder campaign). */
export const LIBRARY_SOURCE_LABEL_AR: Readonly<Record<string, string>> = Object.freeze({
  purchase: 'شراء',
  request: 'طلب',
  invite_code: 'كود',
  colleague_invite: 'زميل',
  admin: 'أدمن',
  founder_campaign: 'حملة المؤسسين',
});

export type GrantStatus = 'active' | 'expiring' | 'upcoming' | 'expired' | 'revoked';

export const GRANT_STATUS_LABEL_AR: Readonly<Record<GrantStatus, string>> = Object.freeze({
  active: 'ساري',
  expiring: 'ينتهي خلال 30 يوماً',
  upcoming: 'لم يبدأ بعد',
  expired: 'منتهٍ',
  revoked: 'مسحوب',
});

export const EXPIRING_WINDOW_DAYS = 30;

/** One row's status at `now`. A revoked row is 'revoked' whatever its window. */
export function grantStatus(
  row: { starts_at: string; ends_at: string; revoked_at?: string | null },
  now: Date,
): GrantStatus {
  if (row.revoked_at) return 'revoked';
  const s = Date.parse(row.starts_at);
  const e = Date.parse(row.ends_at);
  const t = now.getTime();
  if (!Number.isFinite(e) || e <= t) return 'expired';
  if (Number.isFinite(s) && s > t) return 'upcoming';
  return e - t <= EXPIRING_WINDOW_DAYS * DAY_MS ? 'expiring' : 'active';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** A trimmed reason of 3–1000 characters, or an Arabic error. */
export function parseReason(raw: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < REASON_MIN_CHARS) {
    return { ok: false, error: 'السبب إلزامي (ثلاثة أحرف على الأقل)' };
  }
  if (reason.length > REASON_MAX_CHARS) {
    return { ok: false, error: 'السبب أطول من المسموح (١٠٠٠ حرف)' };
  }
  return { ok: true, reason };
}

export interface LibraryGrantRequest {
  userId: string;
  planRef: LibraryPlanRef;
  days: number;
  reason: string;
  notes: string | null;
}

/**
 * The body of the direct admin grant: { userId, planRef?, durationDays,
 * reason, notes? }. planRef defaults to 'lib-admin'; durationDays is an
 * integer from 1 to 3660 (no default — the admin decides).
 */
export function parseLibraryGrantBody(
  body: Record<string, unknown>,
): { ok: true; value: LibraryGrantRequest } | { ok: false; error: string } {
  if (!isUuid(body.userId)) return { ok: false, error: 'المستخدم غير صالح' };
  const planRaw = body.planRef ?? body.plan ?? 'lib-admin';
  if (typeof planRaw !== 'string' || !(ADMIN_GRANTABLE_PLANS as readonly string[]).includes(planRaw)) {
    return { ok: false, error: 'باقة المكتبة غير صالحة' };
  }
  const days = body.durationDays;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < GRANT_MIN_DAYS || days > GRANT_MAX_DAYS) {
    return { ok: false, error: 'المدة يجب أن تكون عدداً صحيحاً من يوم واحد إلى ٣٦٦٠ يوماً' };
  }
  const reason = parseReason(body.reason);
  if (!reason.ok) return reason;
  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string') return { ok: false, error: 'الملاحظات غير صالحة' };
    const n = body.notes.trim();
    if (n.length > NOTES_MAX_CHARS) return { ok: false, error: 'الملاحظات أطول من المسموح' };
    notes = n.length > 0 ? n : null;
  }
  return { ok: true, value: { userId: body.userId, planRef: planRaw as LibraryPlanRef, days, reason: reason.reason, notes } };
}

export type GrantChange =
  | { action: 'revoke'; reason: string }
  | { action: 'adjust'; reason: string; newEndsAt: string };

/**
 * The body of PATCH /api/v1/admin/library-grants/[id]:
 *   { action: 'revoke', reason }
 *   { action: 'adjust', reason, newEndsAt }  — an ISO date-time
 * The database re-checks the end against now and the grant's start.
 */
export function parseGrantChangeBody(
  body: Record<string, unknown>,
): { ok: true; value: GrantChange } | { ok: false; error: string } {
  const reason = parseReason(body.reason);
  if (body.action === 'revoke') {
    if (!reason.ok) return reason;
    return { ok: true, value: { action: 'revoke', reason: reason.reason } };
  }
  if (body.action === 'adjust') {
    if (!reason.ok) return reason;
    const raw = body.newEndsAt;
    const ms = typeof raw === 'string' ? Date.parse(raw) : NaN;
    if (!Number.isFinite(ms)) return { ok: false, error: 'تاريخ الانتهاء الجديد غير صالح' };
    return { ok: true, value: { action: 'adjust', reason: reason.reason, newEndsAt: new Date(ms).toISOString() } };
  }
  return { ok: false, error: 'الإجراء يجب أن يكون سحباً أو تعديل تاريخ الانتهاء' };
}

/**
 * The end of a calendar day in Riyadh (23:59:59 +03:00) as ISO — what the
 * admin page sends for a date picked in <input type="date"> ("2027-01-31").
 * Null for anything that is not YYYY-MM-DD.
 */
export function riyadhEndOfDayIso(date: unknown): string | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T23:59:59+03:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** A refusal of the 20261030_65 functions, as an HTTP status and Arabic text. */
export function grantRpcError(error: { code?: string; message?: string } | null | undefined): {
  status: number;
  error: string;
} {
  const code = error?.code ?? '';
  const msg = error?.message ?? '';
  if (code === 'PGRST202' || code === '42883' || code === '42P01' || code === 'PGRST205') {
    return { status: 503, error: 'إدارة منح المكتبة تحتاج تشغيل ملف قاعدة البيانات 20261030_65 أولاً' };
  }
  if (code === 'P0002' || msg.includes('library_grant_not_found')) return { status: 404, error: 'المنحة غير موجودة' };
  if (msg.includes('library_grant_already_revoked')) return { status: 409, error: 'سُحبت هذه المنحة من قبل' };
  if (msg.includes('library_grant_already_ended')) return { status: 409, error: 'انتهت هذه المنحة، ولا يُعدَّل إلا الساري أو القادم' };
  if (msg.includes('library_grant_overlap')) {
    return { status: 409, error: 'للمستخدم منحة لاحقة تبدأ قبل التاريخ الجديد؛ مدّد من آخر منحة أو امنح أياماً جديدة' };
  }
  if (msg.includes('library_grant_end_too_early')) {
    return { status: 400, error: 'تاريخ الانتهاء الجديد يجب أن يكون بعد اليوم وبعد بداية المنحة (لإنهائها الآن استعمل السحب)' };
  }
  if (msg.includes('library_grant_too_long')) return { status: 400, error: 'لا تتجاوز المنحة ٣٦٦٠ يوماً من بدايتها' };
  if (msg.includes('library_grant_unchanged')) return { status: 400, error: 'التاريخ الجديد هو تاريخ الانتهاء الحالي نفسه' };
  if (msg.includes('library_grant_reason_required')) return { status: 400, error: 'السبب إلزامي' };
  if (msg.includes('library_grant_invalid_days')) {
    return { status: 400, error: 'المدة يجب أن تكون عدداً صحيحاً من يوم واحد إلى ٣٦٦٠ يوماً' };
  }
  return { status: 500, error: 'تعذّر تنفيذ العملية على منحة المكتبة' };
}

// ─── The list's filters ──────────────────────────────────────────────────────

export const LIST_PAGE_SIZE = 50;
export const CSV_MAX_ROWS = 5000;
const STATUSES: readonly GrantStatus[] = ['active', 'expiring', 'upcoming', 'expired', 'revoked'];

export interface GrantListFilters {
  q: string | null;
  status: GrantStatus | null;
  source: string | null;
  planRef: string | null;
  grantedBy: string | null;
  orderId: string | null;
  /** ISO date-times bounding ends_at (the "ends between" filter). */
  endsFrom: string | null;
  endsTo: string | null;
  page: number;
  format: 'json' | 'csv';
}

/** Reads the list's query string; anything unrecognised is dropped, never trusted. */
export function parseGrantListQuery(params: URLSearchParams): GrantListFilters {
  const q = (params.get('q') ?? '').replace(/[,()\\%*]/g, '').trim();
  const status = params.get('status');
  const source = params.get('source');
  const plan = params.get('plan');
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  const day = (v: string | null, end: boolean) => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const ms = Date.parse(`${v}T${end ? '23:59:59' : '00:00:00'}+03:00`);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  };
  return {
    q: q.length > 0 ? q.slice(0, 100) : null,
    status: status && (STATUSES as readonly string[]).includes(status) ? (status as GrantStatus) : null,
    source: source && Object.hasOwn(LIBRARY_SOURCE_LABEL_AR, source) ? source : null,
    planRef: plan && Object.hasOwn(LIBRARY_PLAN_LABEL_AR, plan) ? plan : null,
    grantedBy: isUuid(params.get('grantedBy')) ? (params.get('grantedBy') as string) : null,
    orderId: isUuid(params.get('orderId')) ? (params.get('orderId') as string) : null,
    endsFrom: day(params.get('endsFrom'), false),
    endsTo: day(params.get('endsTo'), true),
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    format: params.get('format') === 'csv' ? 'csv' : 'json',
  };
}

// ─── CSV (server-side, Excel-friendly Arabic) ────────────────────────────────

/** UTF-8 byte order mark: Excel opens a BOM-less UTF-8 CSV as ANSI and garbles Arabic. */
export const CSV_BOM = '﻿';

/**
 * One CSV cell: a value that starts with = + - @ TAB or CR is prefixed with
 * an apostrophe (spreadsheet formula injection — a user's display name is
 * user-controlled); a value holding " , CR or LF is quoted with "" doubled.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** A whole CSV document: BOM, header row, CRLF line ends. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/** A list row as the route assembles it (grant + profile + admin text). */
export interface GrantListRow {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  user_type: string | null;
  plan_ref: string;
  source: string;
  starts_at: string;
  ends_at: string;
  granted_by: string | null;
  granted_by_name: string | null;
  order_id: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  reason: string | null;
  notes: string | null;
  revoke_reason: string | null;
  adjust_reason: string | null;
  created_at: string;
}

export const GRANT_CSV_HEADER: readonly string[] = Object.freeze([
  'رقم المنحة', 'المستخدم', 'البريد', 'نوع الحساب', 'الباقة', 'المصدر', 'الحالة',
  'البداية', 'النهاية', 'منحها', 'رقم الطلب', 'السبب', 'الملاحظات',
  'سُحبت في', 'سبب السحب', 'سبب آخر تعديل', 'أُنشئت في',
]);

export function grantCsvRow(r: GrantListRow, now: Date): unknown[] {
  return [
    r.id,
    r.user_name ?? '',
    r.user_email ?? '',
    r.user_type ?? '',
    LIBRARY_PLAN_LABEL_AR[r.plan_ref] ?? r.plan_ref,
    LIBRARY_SOURCE_LABEL_AR[r.source] ?? r.source,
    GRANT_STATUS_LABEL_AR[grantStatus(r, now)],
    r.starts_at,
    r.ends_at,
    r.granted_by_name ?? r.granted_by ?? '',
    r.order_id ?? '',
    r.reason ?? '',
    r.notes ?? '',
    r.revoked_at ?? '',
    r.revoke_reason ?? '',
    r.adjust_reason ?? '',
    r.created_at,
  ];
}
