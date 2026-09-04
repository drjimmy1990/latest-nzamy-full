/**
 * feedbackInput.ts — validators for feature requests and library issue
 * reports (Phase 6).
 * ─────────────────────────────────────────────────────────
 * Pure — no I/O, no Supabase import — so it can be unit-tested without a
 * database and reused by every route under `/api/v1/feature-requests`,
 * `/api/v1/admin/feature-requests`, `/api/v1/library/issue-reports` and
 * `/api/v1/admin/library-issue-reports`. Every bound here mirrors a CHECK
 * constraint in `supabase/migrations/20260906_phase6_settings_out_of_browser.sql`
 * exactly, so a value that passes here is a value the database will accept:
 *
 *   feature_requests.title        check (length(btrim(title)) between 3 and 160)
 *   feature_requests.priority     check (priority in ('low','normal','high'))
 *   feature_requests.status       check (status in ('new','planned','implemented','declined'))
 *   library_issue_reports.kind    check (kind in ('typo','wrong_text','missing_article','outdated','other'))
 *   library_issue_reports.status  check (status in ('new','reviewed','fixed','rejected'))
 *   library_issue_reports.description check (length(btrim(description)) between 5 and 2000)
 *
 * `feature_requests.category` carries no CHECK in the migration — the
 * allowlist below is an application-level decision, not a database one.
 * Every accepted string is trimmed before its length is measured (Postgres
 * measures `btrim(x)`, so a validator that checked the raw length would let
 * a padded string slip past here and fail as an 23514 in the database).
 */

// ─── enums ──────────────────────────────────────────────────────────────────

export const FEATURE_REQUEST_CATEGORIES = ["ui", "library", "billing", "performance", "mobile", "other"] as const;
export type FeatureRequestCategory = (typeof FEATURE_REQUEST_CATEGORIES)[number];
export const DEFAULT_FEATURE_REQUEST_CATEGORY: FeatureRequestCategory = "other";

export const FEATURE_REQUEST_PRIORITIES = ["low", "normal", "high"] as const;
export type FeatureRequestPriorityInput = (typeof FEATURE_REQUEST_PRIORITIES)[number];
export const DEFAULT_FEATURE_REQUEST_PRIORITY: FeatureRequestPriorityInput = "normal";

export const FEATURE_REQUEST_STATUSES = ["new", "planned", "implemented", "declined"] as const;
export type FeatureRequestStatusInput = (typeof FEATURE_REQUEST_STATUSES)[number];

export const LIBRARY_ISSUE_KINDS = ["typo", "wrong_text", "missing_article", "outdated", "other"] as const;
export type LibraryIssueKindInput = (typeof LIBRARY_ISSUE_KINDS)[number];

export const LIBRARY_ISSUE_STATUSES = ["new", "reviewed", "fixed", "rejected"] as const;
export type LibraryIssueStatusInput = (typeof LIBRARY_ISSUE_STATUSES)[number];

function isMember<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

function isPlainString(v: unknown): v is string {
  return typeof v === "string";
}

// ─── feature_requests: POST body ───────────────────────────────────────────

const TITLE_MIN = 3;
const TITLE_MAX = 160;
const DESCRIPTION_MAX = 4000;
const IMPLEMENTED_NOTE_MAX = 4000;

export interface FeatureRequestInputBody {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  priority?: unknown;
}

export interface ValidatedFeatureRequestInput {
  title: string;
  description: string;
  category: FeatureRequestCategory;
  priority: FeatureRequestPriorityInput;
}

export type FeatureRequestValidation = { ok: true; value: ValidatedFeatureRequestInput } | { ok: false; error: string };

/**
 * Validates one POST body against `submitFeatureRequest`'s input
 * (src/lib/services/feedbackService.ts): `title` required (trimmed, 3..160),
 * `description`/`category`/`priority` optional with the defaults below.
 */
export function validateFeatureRequestInput(body: FeatureRequestInputBody): FeatureRequestValidation {
  const { title, description, category, priority } = body;

  if (!isPlainString(title)) {
    return { ok: false, error: "العنوان مطلوب." };
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length < TITLE_MIN || trimmedTitle.length > TITLE_MAX) {
    return { ok: false, error: `العنوان يجب أن يكون بين ${TITLE_MIN} و${TITLE_MAX} حرفاً.` };
  }

  let descriptionValue = "";
  if (description !== undefined && description !== null) {
    if (!isPlainString(description)) {
      return { ok: false, error: "الوصف يجب أن يكون نصاً." };
    }
    if (description.length > DESCRIPTION_MAX) {
      return { ok: false, error: `الوصف يجب ألا يتجاوز ${DESCRIPTION_MAX} حرف.` };
    }
    descriptionValue = description;
  }

  let categoryValue: FeatureRequestCategory = DEFAULT_FEATURE_REQUEST_CATEGORY;
  if (category !== undefined && category !== null) {
    if (!isMember(category, FEATURE_REQUEST_CATEGORIES)) {
      return { ok: false, error: `التصنيف يجب أن يكون أحد: ${FEATURE_REQUEST_CATEGORIES.join(", ")}` };
    }
    categoryValue = category;
  }

  let priorityValue: FeatureRequestPriorityInput = DEFAULT_FEATURE_REQUEST_PRIORITY;
  if (priority !== undefined && priority !== null) {
    if (!isMember(priority, FEATURE_REQUEST_PRIORITIES)) {
      return { ok: false, error: `الأولوية يجب أن تكون أحد: ${FEATURE_REQUEST_PRIORITIES.join(", ")}` };
    }
    priorityValue = priority;
  }

  return { ok: true, value: { title: trimmedTitle, description: descriptionValue, category: categoryValue, priority: priorityValue } };
}

// ─── feature_requests: admin PATCH body ────────────────────────────────────

export interface FeatureRequestPatchBody {
  status?: unknown;
  implementedNote?: unknown;
}

export interface ValidatedFeatureRequestPatch {
  status?: FeatureRequestStatusInput;
  implementedNote?: string | null;
}

export type FeatureRequestPatchValidation = { ok: true; value: ValidatedFeatureRequestPatch } | { ok: false; error: string };

/**
 * Validates `adminUpdateFeatureRequest`'s patch: both fields optional, but
 * at least one must be present — an empty patch is a caller bug, not a
 * silent no-op write.
 */
export function validateFeatureRequestPatch(body: FeatureRequestPatchBody): FeatureRequestPatchValidation {
  const { status, implementedNote } = body;
  const value: ValidatedFeatureRequestPatch = {};

  if (status !== undefined) {
    if (!isMember(status, FEATURE_REQUEST_STATUSES)) {
      return { ok: false, error: `الحالة يجب أن تكون أحد: ${FEATURE_REQUEST_STATUSES.join(", ")}` };
    }
    value.status = status;
  }

  if (implementedNote !== undefined) {
    if (implementedNote !== null) {
      if (!isPlainString(implementedNote)) {
        return { ok: false, error: "ملاحظة التنفيذ يجب أن تكون نصاً." };
      }
      if (implementedNote.length > IMPLEMENTED_NOTE_MAX) {
        return { ok: false, error: `ملاحظة التنفيذ يجب ألا تتجاوز ${IMPLEMENTED_NOTE_MAX} حرف.` };
      }
    }
    value.implementedNote = implementedNote as string | null;
  }

  if (value.status === undefined && value.implementedNote === undefined) {
    return { ok: false, error: "لا يوجد تعديل في الطلب." };
  }

  return { ok: true, value };
}

// ─── library_issue_reports: POST body ──────────────────────────────────────

const LAW_SLUG_MAX = 200;
const ARTICLE_REF_MAX = 100;
const ISSUE_DESCRIPTION_MIN = 5;
const ISSUE_DESCRIPTION_MAX = 2000;

export interface LibraryIssueReportInputBody {
  lawSlug?: unknown;
  articleRef?: unknown;
  kind?: unknown;
  description?: unknown;
}

export interface ValidatedLibraryIssueReportInput {
  lawSlug: string;
  articleRef: string;
  kind: LibraryIssueKindInput;
  description: string;
}

export type LibraryIssueReportValidation = { ok: true; value: ValidatedLibraryIssueReportInput } | { ok: false; error: string };

/**
 * Validates one POST body against `submitLibraryIssueReport`'s input
 * (src/lib/services/feedbackService.ts): `lawSlug`, `kind` and
 * `description` required (no `?` on the client type); `articleRef` optional.
 */
export function validateLibraryIssueReportInput(body: LibraryIssueReportInputBody): LibraryIssueReportValidation {
  const { lawSlug, articleRef, kind, description } = body;

  if (!isPlainString(lawSlug) || lawSlug.trim().length === 0) {
    return { ok: false, error: "معرّف النظام مطلوب." };
  }
  const trimmedSlug = lawSlug.trim();
  if (trimmedSlug.length > LAW_SLUG_MAX) {
    return { ok: false, error: `معرّف النظام يجب ألا يتجاوز ${LAW_SLUG_MAX} حرف.` };
  }

  let articleRefValue = "";
  if (articleRef !== undefined && articleRef !== null) {
    if (!isPlainString(articleRef)) {
      return { ok: false, error: "رقم المادة يجب أن يكون نصاً." };
    }
    if (articleRef.length > ARTICLE_REF_MAX) {
      return { ok: false, error: `رقم المادة يجب ألا يتجاوز ${ARTICLE_REF_MAX} حرف.` };
    }
    articleRefValue = articleRef;
  }

  if (!isMember(kind, LIBRARY_ISSUE_KINDS)) {
    return { ok: false, error: `نوع البلاغ يجب أن يكون أحد: ${LIBRARY_ISSUE_KINDS.join(", ")}` };
  }

  if (!isPlainString(description)) {
    return { ok: false, error: "وصف البلاغ مطلوب." };
  }
  const trimmedDescription = description.trim();
  if (trimmedDescription.length < ISSUE_DESCRIPTION_MIN || trimmedDescription.length > ISSUE_DESCRIPTION_MAX) {
    return { ok: false, error: `وصف البلاغ يجب أن يكون بين ${ISSUE_DESCRIPTION_MIN} و${ISSUE_DESCRIPTION_MAX} حرفاً.` };
  }

  return { ok: true, value: { lawSlug: trimmedSlug, articleRef: articleRefValue, kind, description: trimmedDescription } };
}

// ─── library_issue_reports: admin PATCH body ───────────────────────────────

export interface LibraryIssueStatusPatchBody {
  status?: unknown;
}

export interface ValidatedLibraryIssueStatusPatch {
  status: LibraryIssueStatusInput;
}

export type LibraryIssueStatusPatchValidation = { ok: true; value: ValidatedLibraryIssueStatusPatch } | { ok: false; error: string };

/** Validates `adminUpdateIssueReport`'s patch: `status` required (no `?` on the client type). */
export function validateLibraryIssueStatusPatch(body: LibraryIssueStatusPatchBody): LibraryIssueStatusPatchValidation {
  if (!isMember(body.status, LIBRARY_ISSUE_STATUSES)) {
    return { ok: false, error: `الحالة يجب أن تكون أحد: ${LIBRARY_ISSUE_STATUSES.join(", ")}` };
  }
  return { ok: true, value: { status: body.status } };
}

// ─── admin list status filter (shared shape: ?status=all|<enum>, default all) ──

export type StatusFilterResult<T extends string> = { ok: true; value: T | null } | { ok: false };

/**
 * Parses an admin list's `?status=` query param against `allowed`.
 * `null`/absent/`"all"` → `{ ok: true, value: null }` (no filter — every
 * status). Anything else not in `allowed` → `{ ok: false }`, which a route
 * turns into a 400.
 */
export function parseStatusFilter<T extends string>(raw: string | null, allowed: readonly T[]): StatusFilterResult<T> {
  if (raw === null || raw === "all") return { ok: true, value: null };
  if (isMember(raw, allowed)) return { ok: true, value: raw };
  return { ok: false };
}
