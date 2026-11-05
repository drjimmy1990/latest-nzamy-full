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

export function runFailureMessage(_code: string | null, refunded: boolean, creditUsed: boolean): string {
  if (creditUsed) return FOUNDER_CREDIT_REFUNDED_FAILURE;
  return refunded ? "تعذّر إكمال الطلب، وأُعيدت نقاطك" : "تعذّر إكمال الطلب";
}
