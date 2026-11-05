/**
 * toolLabels.ts — an AI run's tool as a person reads it: the Arabic name, and
 * the page that runs the tool (null when the tool has no page of its own). Used
 * by /ai/runs/[id] and the activity log.
 *
 * toolLabels.test.ts walks AI_TOOLS: a unit that adds a registry tool adds its
 * two entries here in the same commit. An `ai_runs.tool` id is never looked up
 * in the human-service catalogue, or the reverse (preflight R19).
 *
 * Pure and import-free, so a page may import it and `node --test` runs it.
 */

export const AI_TOOL_LABELS_AR: Readonly<Record<string, string>> = {
  "echo-fast": "أداة اختبار",
  "echo-job": "أداة اختبار",
  communicate: "المتحدث الذكي",
  "najiz-optimizer": "منقح ناجز",
  "quick-answer": "سؤال قانوني سريع",
  "library-assistant": "مساعد المكتبة",
  assistant: "المستشار الذكي",
  "canvas-card": "بطاقة الكانفاس الذكية",
  "case-brief": "عصارة المرفقات",
  "brief-check": "مراجعة وتدقيق مذكرة",
  wargaming: "المحاكي الشامل",
  "analyze-strength": "محلل قوة الموقف",
  "contract-drafter": "محترف العقود المختصر",
  "contracts-pro": "محترف العقود",
  "legal-opinion-consult": "الرأي الفصل — استشارة",
  "legal-opinion-letter": "الرأي الفصل — خطاب",
  "legal-drafter": "الصائغ القانوني",
};

export const AI_TOOL_PAGES: Readonly<Record<string, string | null>> = {
  "echo-fast": null,
  "echo-job": null,
  communicate: "/ai/communicate",
  "najiz-optimizer": "/ai/najiz-optimizer",
  "quick-answer": "/ai/quick-answer",
  "library-assistant": null,
  assistant: "/ai/assistant",
  "canvas-card": null,
  "case-brief": "/ai/case-brief",
  "brief-check": "/ai/brief-check",
  wargaming: "/ai/wargaming",
  "analyze-strength": "/ai/analyze-strength",
  "contract-drafter": "/ai/contract-drafter",
  "contracts-pro": "/ai/contracts",
  "legal-opinion-consult": "/ai/legal-opinion",
  "legal-opinion-letter": "/ai/legal-opinion",
  "legal-drafter": "/ai/draft",
};

export function aiToolLabelAr(id: string): string {
  return Object.prototype.hasOwnProperty.call(AI_TOOL_LABELS_AR, id) ? AI_TOOL_LABELS_AR[id] : "أداة ذكاء اصطناعي";
}
