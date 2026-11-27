/**
 * toolPointsView.ts — «المتاح لهذه العملية» beside a paid AI tool's price
 * (owner ١٦٥, batch l13).
 *
 * The figure is the server's: GET /api/v1/ai/points-standing answers
 * { charged, available } — available = the points THIS tool may spend now
 * (points_available_for_tool, 20261203_10: a library-assistant lot counts only
 * for the library assistant). This module only reads that answer and words
 * it; a missing or malformed answer shows nothing, never a guessed 0.
 *
 * Owner ق٢٦-٦ (batch l19): for an ind-ai subscriber on a counted tool the
 * answer also carries `planAllowance` { kind, left, limit } — the month's
 * fair use (planAllowance.ts). While some is left the line says so instead
 * of the points (the run charges none); once it is used, the points line
 * follows a short note that the price is now taken from the points.
 *
 * Pure (no React, no fetch), so `node --test` runs it.
 */
import { PLAN_ALLOWANCE_COPY, type PlanAllowanceKind } from "../ai/planAllowance.ts";

export interface ToolPointsAnswer {
  /** false: this run charges no points (an admin account, or charging off). */
  charged: boolean;
  /** The points this tool may spend now; null when the server could not read them. */
  available: number | null;
  /** ق٢٦-٦: the ind-ai fair use of this month on this tool, when the server sent it. */
  planAllowance?: { kind: PlanAllowanceKind; left: number; limit: number };
}

const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** The route's answer, or null when it is anything else (an error body, a guest's 401 body…). */
export function parseToolPointsAnswer(body: unknown): ToolPointsAnswer | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { charged, available, planAllowance } = body as { charged?: unknown; available?: unknown; planAllowance?: unknown };
  const plan = parsePlanAllowance(planAllowance);
  if (charged === false) return { charged: false, available: null };
  if (charged === true && isCount(available)) return plan ? { charged: true, available, planAllowance: plan } : { charged: true, available };
  return null;
}

function parsePlanAllowance(v: unknown): ToolPointsAnswer["planAllowance"] | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const { kind, left, limit } = v as { kind?: unknown; left?: unknown; limit?: unknown };
  if ((kind !== "question" && kind !== "work") || !isCount(left) || !isCount(limit) || left > limit) return null;
  return { kind, left, limit };
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function arabicCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "٬").replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}
/** «نقاط» after 3–10, «نقطة» otherwise (toolPointsDisplay.pointsNounAr). */
function noun(n: number): string {
  return n >= 3 && n <= 10 ? "نقاط" : "نقطة";
}

export type ToolPointsTone = "ok" | "short" | "free";

export interface ToolPointsView {
  text: string;
  tone: ToolPointsTone;
  /** True when the figure is below the price: the screen links to the top-up. */
  short: boolean;
}

/**
 * The line a screen shows, or null when there is nothing true to say.
 *   charged false            → «لا تُخصم نقاط من رصيدك لهذه العملية حالياً»
 *   available ≥ price (or no price known) → «المتاح لهذه العملية: ١٢٠ نقطة»
 *   available < price        → the same, «— لا يكفي», tone short
 */
export function toolPointsView(answer: ToolPointsAnswer | null, price: number | null | undefined): ToolPointsView | null {
  if (!answer) return null;
  if (!answer.charged) return { text: "لا تُخصم نقاط من رصيدك لهذه العملية حالياً", tone: "free", short: false };
  const plan = answer.planAllowance;
  if (plan && plan.left > 0) return { text: PLAN_ALLOWANCE_COPY.left(plan.kind, plan.left, plan.limit), tone: "free", short: false };
  if (!isCount(answer.available)) return null;
  const n = answer.available;
  const short = isCount(price) && price > 0 && n < price;
  return {
    text: `${plan ? `${PLAN_ALLOWANCE_COPY.usedNote(plan.kind)} — ` : ""}المتاح لهذه العملية: ${arabicCount(n)} ${noun(n)}${short ? " — لا يكفي" : ""}`,
    tone: short ? "short" : "ok",
    short,
  };
}
