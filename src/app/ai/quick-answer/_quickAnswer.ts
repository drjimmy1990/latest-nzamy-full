/**
 * _quickAnswer.ts — the quick answer's fixed copy (S3-06). Pure, so `node --test`
 * loads it. No price here: the page reads it from the registry (R25).
 */

/** Neutral examples: no names and no amounts, so nothing here reads as a real case. */
export const QUICK_ANSWER_EXAMPLES: readonly string[] = [
  "متى يحق للمؤجر فسخ عقد الإيجار وإخلاء المستأجر؟",
  "ما حقوق العامل عند إنهاء عقد العمل دون سبب مشروع؟",
  "ما شروط صحة الكفالة في نظام المعاملات المدنية؟",
  "متى تسقط الدعوى العمالية بمضي المدة؟",
];

export const QUICK_ANSWER_FOLLOW_UPS: ReadonlyArray<{ href: "/ai/legal-opinion" | "/ai/analyze" | "/ai/wargaming"; labelAr: string }> = [
  { href: "/ai/legal-opinion", labelAr: "الرأي الفصل" },
  { href: "/ai/analyze", labelAr: "عصارة المرفقات" },
  { href: "/ai/wargaming", labelAr: "المحاكي الشامل" },
];

/**
 * Owner ٤١٣ option A: an answer that cites none of the library texts is shown
 * (and charged) under this label; the server flags it `ungrounded: true`
 * (runCore settleRunWith).
 */
export const QUICK_ANSWER_UNGROUNDED_LABEL = "إجابة عامة بلا سند مرجعي — تحقق منها";

/** True when the run's output is a general answer with no library text behind it. */
export function isUngroundedAnswer(output: Record<string, unknown> | null | undefined): boolean {
  return output?.ungrounded === true;
}

/** The text the result actions copy / export: the label goes with an ungrounded answer. */
export function quickAnswerExportText(answer: string, ungrounded: boolean): string {
  return ungrounded ? `${QUICK_ANSWER_UNGROUNDED_LABEL}\n\n${answer}` : answer;
}

/**
 * The two refusals that follow a charge and refund it (runCore: no_sources,
 * ungrounded: the model's «النصوص لا تجيب» sentence), in this page's words. Any other code keeps the server's own message:
 * most come before a charge, so a refund sentence would be untrue there.
 */
export function quickAnswerRefusalText(code: string | null): string | null {
  if (code === "no_sources") {
    return "لم نجد في مكتبة الأنظمة نصاً يجيب عن هذا السؤال — أُعيدت نقاطك. أعد صياغته بكلمات نظامية أو اطلب رأياً من الرأي الفصل.";
  }
  if (code === "ungrounded") return "لا تجيب النصوص المتاحة في المكتبة عن هذا السؤال — أُعيدت نقاطك.";
  return null;
}
