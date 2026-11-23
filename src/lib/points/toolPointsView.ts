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
 * Pure (no React, no fetch), so `node --test` runs it.
 */

export interface ToolPointsAnswer {
  /** false: this run charges no points (an admin account, or charging off). */
  charged: boolean;
  /** The points this tool may spend now; null when the server could not read them. */
  available: number | null;
}

const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** The route's answer, or null when it is anything else (an error body, a guest's 401 body…). */
export function parseToolPointsAnswer(body: unknown): ToolPointsAnswer | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { charged, available } = body as { charged?: unknown; available?: unknown };
  if (charged === false) return { charged: false, available: null };
  if (charged === true && isCount(available)) return { charged: true, available };
  return null;
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
  if (!isCount(answer.available)) return null;
  const n = answer.available;
  const short = isCount(price) && price > 0 && n < price;
  return {
    text: `المتاح لهذه العملية: ${arabicCount(n)} ${noun(n)}${short ? " — لا يكفي" : ""}`,
    tone: short ? "short" : "ok",
    short,
  };
}
