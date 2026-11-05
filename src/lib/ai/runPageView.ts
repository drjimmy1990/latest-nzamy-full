/**
 * runPageView.ts — what /ai/runs/[id] shows for a run the route returned.
 *
 * The route (GET /api/v1/ai/runs/<id>) has already applied runVisibility.ts, so
 * this module adds no rule of its own about who sees what: a legacy "review" row
 * arrives with no output for its owner, and with its output for an admin. It
 * only guarantees that a failed or running row never shows an output, and that a
 * held row carries the held sentence either way.
 *
 * Held copy: nothing in the app alerts anyone about a stored review row (R30),
 * so the sentence promises no alert.
 *
 * Pure; a client page may import it, and `node --test` runs it.
 */
import { runFailureMessage } from "./runErrors.ts";
import { runOutputBlocks, type RunOutputBlock } from "./runOutputBlocks.ts";

export const RUN_HELD_MESSAGE_AR = "هذه النتيجة محجوبة بانتظار قرار فريق نظامي";
const RUN_RUNNING_MESSAGE_AR = "الطلب قيد التنفيذ — حدّث الصفحة بعد قليل لمعرفة حالته";
const RUN_OUTPUT_GONE_AR = "لم يعد ناتج هذا الطلب محفوظاً";

export interface RunPageView {
  kind: "output" | "held" | "failed" | "running";
  blocks: RunOutputBlock[];
  message: string | null;
}

export function runPageView(run: { status?: unknown; output?: unknown; error_code?: unknown; refunded_at?: unknown }): RunPageView {
  if (run.status === "succeeded") {
    const blocks = runOutputBlocks(run.output);
    return { kind: "output", blocks, message: blocks.length === 0 ? RUN_OUTPUT_GONE_AR : null };
  }
  if (run.status === "review") {
    return { kind: "held", blocks: runOutputBlocks(run.output), message: RUN_HELD_MESSAGE_AR };
  }
  if (run.status === "failed") {
    const code = typeof run.error_code === "string" ? run.error_code : null;
    // A credit run is uncharged, so refunded_at stays null and no refund of
    // points is claimed; the route does not say whether a credit paid.
    return { kind: "failed", blocks: [], message: runFailureMessage(code, Boolean(run.refunded_at), false) };
  }
  return { kind: "running", blocks: [], message: RUN_RUNNING_MESSAGE_AR };
}

const RUN_STATUS_AR: Readonly<Record<string, string>> = {
  running: "قيد التنفيذ",
  review: "محجوبة",
  succeeded: "مكتمل",
  failed: "لم يكتمل",
};

export function runStatusLabelAr(status: string): string {
  return Object.prototype.hasOwnProperty.call(RUN_STATUS_AR, status) ? RUN_STATUS_AR[status] : "قيد التنفيذ";
}
