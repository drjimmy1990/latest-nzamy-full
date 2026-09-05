/**
 * communityReportsInput.ts — validators + vocabulary for community reports
 * (owner item ٦٩ remainder — «زر الإبلاغ عن المحتوى»).
 * ─────────────────────────────────────────────────────────
 * Pure — no I/O, no Supabase import — so it is unit-testable without a
 * database and reusable by every route under `/api/v1/community/reports`
 * and `/api/v1/admin/community/reports`. Every bound here mirrors a CHECK
 * constraint in `supabase/migrations/20260911_community_reports.sql` exactly,
 * so a value that passes here is a value the database will accept:
 *
 *   community_reports.target_type  check (target_type in ('post','answer'))
 *   community_reports.reason       check (reason in ('spam','abuse','misleading','off_platform_contact','other'))
 *   community_reports.details      check (details is null or length(details) <= 1000)
 *   community_reports.status      check (status in ('new','reviewed','dismissed','actioned'))
 *
 * `details` is trimmed before its length is measured and an
 * empty-after-trim string is normalised to `null` — a report with no
 * elaboration is not the same thing as a report whose "details" field is
 * three space characters.
 */

export const COMMUNITY_REPORT_TARGET_TYPES = ["post", "answer"] as const;
export type CommunityReportTargetType = (typeof COMMUNITY_REPORT_TARGET_TYPES)[number];

export const COMMUNITY_REPORT_REASONS = ["spam", "abuse", "misleading", "off_platform_contact", "other"] as const;
export type CommunityReportReason = (typeof COMMUNITY_REPORT_REASONS)[number];

export const COMMUNITY_REPORT_STATUSES = ["new", "reviewed", "dismissed", "actioned"] as const;
export type CommunityReportStatus = (typeof COMMUNITY_REPORT_STATUSES)[number];

/** Arabic label for every reason value — the ONE place the enum is translated (routes and the UI both import this). */
export const COMMUNITY_REPORT_REASON_LABELS_AR: Record<CommunityReportReason, string> = {
  spam: "إزعاج / محتوى مكرر",
  abuse: "إساءة أو تنمّر",
  misleading: "معلومات مضلِّلة",
  off_platform_contact: "طلب تواصل خارج المنصة",
  other: "سبب آخر",
};

const DETAILS_MAX = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function isMember<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

// ─── POST /api/v1/community/reports body ───────────────────────────────────

export interface CommunityReportInputBody {
  targetType?: unknown;
  targetId?: unknown;
  reason?: unknown;
  details?: unknown;
}

export interface ValidatedCommunityReportInput {
  targetType: CommunityReportTargetType;
  targetId: string;
  reason: CommunityReportReason;
  details: string | null;
}

export type CommunityReportValidation =
  | { ok: true; value: ValidatedCommunityReportInput }
  | { ok: false; error: string };

/** Validates one report submission: targetType/targetId/reason required, details optional (≤1000, trimmed, empty→null). */
export function validateCommunityReportInput(body: CommunityReportInputBody): CommunityReportValidation {
  const { targetType, targetId, reason, details } = body;

  if (!isMember(targetType, COMMUNITY_REPORT_TARGET_TYPES)) {
    return { ok: false, error: `نوع المحتوى يجب أن يكون أحد: ${COMMUNITY_REPORT_TARGET_TYPES.join(", ")}` };
  }

  if (!isUuid(targetId)) {
    return { ok: false, error: "معرّف المحتوى غير صالح." };
  }

  if (!isMember(reason, COMMUNITY_REPORT_REASONS)) {
    return { ok: false, error: `سبب البلاغ يجب أن يكون أحد: ${COMMUNITY_REPORT_REASONS.join(", ")}` };
  }

  let detailsValue: string | null = null;
  if (details !== undefined && details !== null) {
    if (typeof details !== "string") {
      return { ok: false, error: "تفاصيل البلاغ يجب أن تكون نصاً." };
    }
    const trimmed = details.trim();
    if (trimmed.length > DETAILS_MAX) {
      return { ok: false, error: `تفاصيل البلاغ يجب ألا تتجاوز ${DETAILS_MAX} حرف.` };
    }
    detailsValue = trimmed.length > 0 ? trimmed : null;
  }

  return { ok: true, value: { targetType, targetId, reason, details: detailsValue } };
}

// ─── admin PATCH /api/v1/admin/community/reports/[id] body ────────────────

export interface CommunityReportStatusPatchBody {
  status?: unknown;
}

export interface ValidatedCommunityReportStatusPatch {
  status: CommunityReportStatus;
}

export type CommunityReportStatusPatchValidation =
  | { ok: true; value: ValidatedCommunityReportStatusPatch }
  | { ok: false; error: string };

/** Validates the admin triage patch: `status` required, must be a real status. */
export function validateCommunityReportStatusPatch(
  body: CommunityReportStatusPatchBody,
): CommunityReportStatusPatchValidation {
  if (!isMember(body.status, COMMUNITY_REPORT_STATUSES)) {
    return { ok: false, error: `الحالة يجب أن تكون أحد: ${COMMUNITY_REPORT_STATUSES.join(", ")}` };
  }
  return { ok: true, value: { status: body.status } };
}
