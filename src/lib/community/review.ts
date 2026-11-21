/**
 * review.ts — the pure half of owner decision ٤٢ (18 Nov 2026; batch l7
 * decision 13): community posts AND answers wait for a reviewer before they
 * are public, names stay hidden, and «مكتب معتمد» (N18, batch l12) is a
 * registered law firm with an active office plan.
 *
 * The database half is supabase/migrations/20261127_60_community_review_devices_freeze.sql:
 * the statuses 'pending_review' / 'rejected', the review trigger (a member's
 * new row — or his edit of a published one — is stored pending while the
 * setting `community_prepublish_review` is on), the author-only read arm, and
 * public.community_verified_office_users(). Before that file runs nothing is
 * pending: every helper here reads an unknown status as published.
 *
 * No imports — `node --test` loads this file directly.
 */

/** The statuses a reader may see in the public feed. */
export const PUBLIC_POST_STATUSES = ["active", "closed"] as const;

/** The author's own feed («أسئلتي») also lists his rows under review. */
export const OWN_POST_STATUSES = ["active", "closed", "pending_review", "rejected"] as const;

export type ReviewState = "pending" | "rejected" | null;

/** A row's status → what the author is told («بانتظار المراجعة» / «مرفوض»), null = published. */
export function reviewStateOf(status: unknown): ReviewState {
  if (status === "pending_review") return "pending";
  if (status === "rejected") return "rejected";
  return null;
}

export const REVIEW_PENDING_AR = "بانتظار المراجعة";
export const REVIEW_REJECTED_AR = "لم يُعتمد للنشر";

/** The author's notice after he posts, honest about whether the row is public yet. */
export function postedNoticeAr(kind: "post" | "answer", pending: boolean): string {
  if (!pending) return kind === "post" ? "نُشر سؤالك في المجتمع." : "نُشرت إجابتك.";
  return kind === "post"
    ? "استلمنا سؤالك، وهو بانتظار المراجعة. يظهر للأعضاء بعد موافقة فريق المراجعة، وتجده الآن في «أسئلتي»."
    : "استلمنا إجابتك، وهي بانتظار المراجعة. تظهر للأعضاء بعد موافقة فريق المراجعة.";
}

/** platform_settings.community_prepublish_review → on/off. Anything but an explicit false is ON (decision 13: default ON). */
export function prepublishReviewOn(value: unknown): boolean {
  if (value === false) return false;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (value as { enabled?: unknown }).enabled !== false;
  }
  return true;
}

export const COMMUNITY_REVIEW_SETTING_KEY = "community_prepublish_review";

// ── the moderation queue ────────────────────────────────────────────────────

export type ModerationUiStatus = "pending" | "approved" | "rejected" | "escalated";

/** A row's DB status → the queue's status. */
export function moderationStatusOf(status: unknown): ModerationUiStatus {
  switch (status) {
    case "pending_review":
      return "pending";
    case "active":
    case "closed":
      return "approved";
    case "moderated":
      return "escalated";
    case "rejected":
    case "deleted":
      return "rejected";
    default:
      return "pending";
  }
}

/** The queue's ?status= filter → the DB statuses it covers (null = all). */
export function dbStatusesFor(filter: string | null | undefined): string[] | null {
  switch (filter) {
    case "pending":
      return ["pending_review"];
    case "approved":
      return ["active", "closed"];
    case "rejected":
      return ["rejected", "deleted"];
    case "escalated":
      return ["moderated"];
    default:
      return null;
  }
}

export type ModerationDecision =
  | { ok: true; status: "active" | "rejected" | "moderated" | "deleted"; audit: string; note: string | null }
  | { ok: false; error: string };

export const REJECT_REASON_REQUIRED_AR = "اكتب سبب الرفض ليقرأه صاحب المحتوى.";
export const REVIEW_NOTE_MAX = 500;

/**
 * The reviewer's action → the row's new status and its audit label. A
 * rejection needs a reason (the author reads it); the other actions may carry
 * one for the audit row only.
 */
export function moderationDecision(
  kind: "post" | "answer",
  rawAction: unknown,
  rawReason: unknown,
): ModerationDecision {
  const action = typeof rawAction === "string" ? rawAction.trim().toLowerCase() : "";
  const reason = typeof rawReason === "string" ? rawReason.trim().slice(0, REVIEW_NOTE_MAX) : "";
  const label = kind === "post" ? "community_post" : "community_answer";
  switch (action) {
    case "approve":
    case "approved":
      return { ok: true, status: "active", audit: `${label}_approved`, note: null };
    case "reject":
    case "rejected":
      if (!reason) return { ok: false, error: REJECT_REASON_REQUIRED_AR };
      return { ok: true, status: "rejected", audit: `${label}_rejected`, note: reason };
    case "hide":
    case "escalate":
    case "escalated":
      return { ok: true, status: "moderated", audit: `${label}_escalated`, note: null };
    case "remove":
      return { ok: true, status: "deleted", audit: `${label}_removed`, note: null };
    default:
      return { ok: false, error: "الإجراء مطلوب: approve أو reject (مع السبب) أو escalate أو remove" };
  }
}

/** The author's notification after a decision (no names, no text of others). */
export function reviewNotificationAr(
  kind: "post" | "answer",
  status: "active" | "rejected" | "moderated" | "deleted",
  note: string | null,
): { title: string; body: string } | null {
  const what = kind === "post" ? "سؤالك" : "إجابتك";
  if (status === "active") {
    return { title: "اعتُمد للنشر في المجتمع", body: `اعتمد فريق المراجعة ${what}، وأصبح ظاهراً للأعضاء.` };
  }
  if (status === "rejected") {
    return {
      title: "لم يُعتمد للنشر في المجتمع",
      body: `لم يعتمد فريق المراجعة ${what}. السبب: ${note ?? "—"}. يمكنك تعديله وإرساله للمراجعة من جديد.`,
    };
  }
  return null;
}

// ── «مكتب معتمد» (N18, batch l12, 20261202_80) ────────────────────────────────
// Owner RAW [39]: «تُستبدل كلمة «موثَّق» بـ«معتمد» في شارة المكتب وكل الواجهة.
// وتعريفه: مكتب محاماة مسجّل في نظامي ومشترك في باقة مكتب سارية» (default:
// any paid office plan). It replaces the earlier «سجل تجاري موثّق + محامٍ
// رخصته سارية» rule.

export const VERIFIED_OFFICE_AR = "مكتب معتمد";

/** The office plans whose active subscription makes a firm «معتمد» (priceBook firm plans). */
export const OFFICE_PLAN_IDS: readonly string[] = ["firm-basic", "firm-enterprise"];

export interface OfficeSubscription {
  planId: string | null;
  /** subscriptions.status — only "active" counts (a trial does not). */
  status: string | null;
  /** subscriptions.current_period_end (ISO), null = open-ended. */
  periodEnd: string | null;
}

export interface OfficeInput {
  /** firm_profiles.verification_status — the firm's registration on the platform. */
  firmVerification: string | null;
  /** The owner's own subscriptions and the firm entity's. */
  subscriptions: OfficeSubscription[];
}

/** The same rule as public.community_verified_office_users (20261202_80). `now` = the moment of the check. */
export function isVerifiedOffice(input: OfficeInput, now: Date): boolean {
  if (input.firmVerification !== "verified") return false;
  return input.subscriptions.some((s) =>
    !!s.planId && OFFICE_PLAN_IDS.includes(s.planId) && s.status === "active"
    && (s.periodEnd === null || new Date(s.periodEnd).getTime() > now.getTime()));
}
