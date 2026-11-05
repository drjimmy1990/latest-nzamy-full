/**
 * runErrors.ts — what a failed AI run tells its owner. The one source for the
 * job poll (useAiRun) and the run viewer (/ai/runs/[id]).
 *
 * A credit run gets its founder credit back, never «أُعيدت نقاطك» (R20). A run
 * whose refund did not happen, or that was never charged, claims none.
 *
 * Pure; a client page may import it, so it never imports runCore.ts.
 */
import { FOUNDER_CREDIT_REFUNDED_FAILURE } from "../membership/founderPlan.ts";

const REFUNDED_FAILURE = "تعذّر إكمال الطلب، وأُعيدت نقاطك";

/**
 * A job's failure now reaches the user by polling, as its error_code, so the
 * specific sentence travels here. Literal copies of runCore's AI_COPY
 * (runErrors.test.ts pins them equal), so the client bundle never imports it.
 */
export const RUN_ERROR_AR: Readonly<Record<string, string>> = {
  no_sources: "لم أجد في مكتبة الأنظمة نصوصاً تتعلق بسؤالك، وأُعيدت نقاطك — جرّب صياغة أخرى",
  ungrounded: "لم تُجب نصوص المكتبة التي وجدتها عن سؤالك، وأُعيدت نقاطك — جرّب صياغة أخرى",
  timeout: "استغرق الطلب وقتاً أطول من المسموح، وأُعيدت نقاطك — حاول مرة أخرى",
  no_queries: REFUNDED_FAILURE,
  store_failed: REFUNDED_FAILURE,
  bad_reply: REFUNDED_FAILURE,
  model_error: REFUNDED_FAILURE,
  unreachable: REFUNDED_FAILURE,
  internal: REFUNDED_FAILURE,
};

export function runFailureMessage(code: string | null, refunded: boolean, creditUsed: boolean): string {
  if (creditUsed) return FOUNDER_CREDIT_REFUNDED_FAILURE;
  if (!refunded) return "تعذّر إكمال الطلب";
  return code !== null && Object.prototype.hasOwnProperty.call(RUN_ERROR_AR, code) ? RUN_ERROR_AR[code] : REFUNDED_FAILURE;
}

/**
 * A page gave up watching, and the run may still end by itself. /ai/runs/<id> is
 * the one place that is real for every account. No alert exists, so none is
 * promised, and a run abandoned by a restart ends only when the sweep reaches it,
 * so no result or refund is promised either.
 */
export const RUN_STILL_RUNNING_AR = "ما زال الطلب قيد التنفيذ — تابعه من صفحة الطلب، ولا تُعِد تشغيله الآن حتى لا يُحتسب مرتين";
export const RUN_SESSION_LOST_AR = "توقفت متابعة الطلب لأن جلستك انتهت. قد يكون الطلب ما زال يعمل وقد تكون نقاطه خُصمت — سجّل الدخول وتحقق من صفحة الطلب قبل تشغيله مرة أخرى";
export const RUN_NOT_FOUND_AR = "تعذّر العثور على هذا الطلب";

export interface ProgressItem {
  id: number;
  kind: string;
  label: string;
}

const PROGRESS_KEEP = 60;

/** What the waiting screen holds: each event once, oldest first, the latest 60. */
export function mergeProgressEvents(prev: ProgressItem[], next: ProgressItem[]): ProgressItem[] {
  const byId = new Map<number, ProgressItem>();
  for (const e of prev) byId.set(e.id, e);
  for (const e of next) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-PROGRESS_KEEP);
}
