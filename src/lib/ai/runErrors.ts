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
  return code !== null && Object.hasOwn(RUN_ERROR_AR, code) ? RUN_ERROR_AR[code] : REFUNDED_FAILURE;
}
