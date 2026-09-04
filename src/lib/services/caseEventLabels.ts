/**
 * caseEventLabels.ts
 * ─────────────────────────────────────────────────────────
 * The ONE Arabic label table for a case timeline row — `request_events.event`
 * and `activity_events.kind` merged by GET /api/v1/service-requests/[id].
 *
 * Until 2026-09-03 this map lived as two hand-typed copies, one in each case
 * file (lawyer/cases/[id] and client/cases/[id]). Every new event kind had to
 * be added to both, and the day the litigation-stages surface shipped it was
 * added to neither — the raw token «case_stage.added» printed in the middle of
 * an all-Arabic timeline on both screens until an independent re-verification
 * caught it. A third case file (firm) would have meant a third copy. So: one
 * module, imported by every case timeline, and a test that fails if a kind
 * `recordActivity` can write is missing here.
 *
 * `caseEventLabel` NEVER returns the raw token: an unknown kind falls back to a
 * neutral Arabic line, same contract as `describeActivityEvent` in
 * src/lib/events.ts — an event name added elsewhere must not leak English
 * into the UI.
 */

export const CASE_EVENT_LABELS: Record<string, string> = {
  "service_request.created":        "إنشاء القضية",
  "service_request.status_changed": "تغيير الحالة",
  "service_request.updated":        "تحديث القضية",
  "service_request.assigned":       "تعيين المحامي",
  "service_request.reassigned":     "توجيه القضية إلى المختص",
  "service_request.revision_requested": "طلب تعديل",
  "service_request.completed":      "إتمام القضية",
  "service_request.cancelled":      "إلغاء القضية",
  "service_request.note_added":     "إضافة ملاحظة",
  "service_request.hearing_added":  "إضافة جلسة",
  "case.note_added":                "إضافة ملاحظة",
  "case.hearing_added":             "إضافة جلسة",
  // Phase 1 (2026-09-03): activity_events rows merged into the same timeline.
  "hearing.created":                "إضافة جلسة",
  "task.created":                   "إضافة مهمة",
  "task.status_changed":            "تحديث حالة مهمة",
  "task.deleted":                   "حذف مهمة",
  "case_stage.added":               "إضافة درجة تقاضٍ",
  "case_stage.outcome_recorded":    "تسجيل نتيجة درجة تقاضٍ",
  // Phase 5 (2026-09-04): رادار المهل.
  "deadline.created":               "إضافة مهلة",
  "deadline.status_changed":        "تحديث حالة مهلة",
  "payment.created":                "تسجيل دفعة",
  // legacy free-text tokens still present on older rows
  "created":        "إنشاء القضية",
  "status_change":  "تغيير الحالة",
  "updated":        "تحديث القضية",
  "assigned":       "تعيين المحامي",
  "completed":      "إتمام القضية",
  "cancelled":      "إلغاء القضية",
  "note_added":     "إضافة ملاحظة",
  "hearing_added":  "إضافة جلسة",
};

/** Neutral fallback — never the raw token. */
export const CASE_EVENT_FALLBACK_LABEL = "تحديث على القضية";

export function caseEventLabel(event: string): string {
  const key = typeof event === "string" ? event.trim() : "";
  if (!key) return CASE_EVENT_FALLBACK_LABEL;
  if (CASE_EVENT_LABELS[key]) return CASE_EVENT_LABELS[key];
  // `notification.<channel>_<status>` rows are written by the n8n delivery
  // callback with no actor; they reach this timeline through request_events.
  if (key.startsWith("notification.")) {
    return key.endsWith("_failed") ? "تعذّر إرسال إشعار" : "إرسال إشعار";
  }
  return CASE_EVENT_FALLBACK_LABEL;
}
