/**
 * assistIndicator.ts — owner ٣٨ (18 Nov 2026): the five analysis tools
 * (position assessment /ai/analyze-strength, the simulator /ai/wargaming, the
 * attachment digest and the case analyzer on /ai/analyze, the legal opinion
 * /ai/legal-opinion) may show an indicator — a percentage included — ONLY
 * named «مؤشر مساعد», with the line that it never predicts the outcome.
 *
 * Today no model output carries a number (the n8n prompts still forbid one),
 * so the label sits on the level words the two tools that have an indicator
 * show (the position level, the simulator's severities). A percentage, when a
 * tool ever returns one, is formatted by `assistIndicatorPercent` and nowhere
 * else — the source tests refuse «٪» / «%» on those screens otherwise.
 *
 * Pure: `node --test` loads it.
 */

export const ASSIST_INDICATOR_LABEL = "مؤشر مساعد";
export const ASSIST_INDICATOR_NOTE = "لا يتنبأ بنتيجة القضية ولا بحكم المحكمة.";

/** The five tools' result screens (relative to src/), for the source tests. */
export const ASSIST_INDICATOR_SCREENS = [
  "app/ai/analyze-strength/page.tsx",
  "app/ai/wargaming/_SimResultView.tsx",
  "app/ai/analyze/_components/AttachmentSqueezer.tsx",
  "app/ai/analyze/_components/SmartAnalyzer.tsx",
  "app/ai/legal-opinion/_components/ResultView.tsx",
] as const;

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * «مؤشر مساعد: ٦٥٪» for a finite 0–100 value (rounded), or null — never a
 * bare percentage and never one outside the range.
 */
export function assistIndicatorPercent(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const n = String(Math.round(value)).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
  return `${ASSIST_INDICATOR_LABEL}: ${n}٪`;
}
