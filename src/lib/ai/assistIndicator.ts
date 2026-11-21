/**
 * assistIndicator.ts — owner ٣٨ (18 Nov 2026) as worded by owner ١٢٤a (raw log
 * item 35, 20 Nov 2026): the five analysis tools (position assessment
 * /ai/analyze-strength, the simulator /ai/wargaming, the attachment digest and
 * the case analyzer on /ai/analyze, the legal opinion /ai/legal-opinion) may
 * show a percentage ONLY as «بنسبة تقديرية X٪», and every one of the five
 * result screens carries the fixed line «مؤشر مساعد لا يتنبأ بنتيجة القضية».
 *
 * Today no model output carries a number (the n8n prompts still forbid one),
 * so the five screens show the fixed line only. A percentage, when a tool ever
 * returns one, is formatted by `assistIndicatorPercent` and nowhere else — the
 * source tests refuse «٪» / «%» on those screens otherwise. Never invent one.
 *
 * Pure: `node --test` loads it.
 */

export const ASSIST_INDICATOR_LABEL = "مؤشر مساعد";
/** The fixed line on all five result screens (owner ١٢٤a). */
export const ASSIST_INDICATOR_NOTE = "مؤشر مساعد لا يتنبأ بنتيجة القضية ولا بحكم المحكمة.";
/** The words before a percentage (owner ١٢٤a): «بنسبة تقديرية ٦٥٪». */
export const ASSIST_INDICATOR_PERCENT_PREFIX = "بنسبة تقديرية";

/** The five tools' live result screens (relative to src/), for the source tests. */
export const ASSIST_INDICATOR_SCREENS = [
  "app/ai/analyze-strength/page.tsx",
  "app/ai/wargaming/_SimResultView.tsx",
  // The attachment digest: /ai/analyze's lawyer half renders the case-brief studio.
  "components/ai/caseBrief/CaseBriefStudio.tsx",
  "app/ai/analyze/_components/SmartAnalyzer.tsx",
  // The legal opinion's live result (ResultView.tsx was a canned screen, now unmounted).
  "app/ai/legal-opinion/_components/AiOpinionPanel.tsx",
] as const;

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * «بنسبة تقديرية ٦٥٪» for a finite 0–100 value (rounded), or null — never a
 * bare percentage and never one outside the range.
 */
export function assistIndicatorPercent(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const n = String(Math.round(value)).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
  return `${ASSIST_INDICATOR_PERCENT_PREFIX} ${n}٪`;
}
