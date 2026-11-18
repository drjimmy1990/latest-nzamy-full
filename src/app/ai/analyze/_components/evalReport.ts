import { LegalDomain } from "./types";

/**
 * The client analyzer's canned guidance (behind GatedToolScreen). Owner ٣٨
 * (18 Nov 2026): the hard-coded «قوة موقفك القانوني» verdict and its 65 / 35
 * bar — a keyword test, not an analysis — are gone; no tool predicts the
 * outcome, and an indicator may only be shown as «مؤشر مساعد».
 */
export function buildEvalReport(
  domain: LegalDomain,
  _answers: string[],
  isRTL: boolean
) {
  return {
    risks: isRTL
      ? ["غياب وثائق داعمة قد يضعف موقفك", "التأخر في رفع الشكوى قد يسقط الحق", "تعدد الأطراف يزيد تعقيد القضية"]
      : ["Lack of supporting documents may weaken your case", "Delay in filing may forfeit rights", "Multiple parties increases complexity"],
    opportunities: isRTL
      ? ["إمكانية التسوية الودية وتوفير الوقت والتكلفة", "قد تكون مؤهلاً لتعويضات إضافية", "وجود سوابق قضائية مشابهة لصالحك"]
      : ["Possibility of friendly settlement, saving time and cost", "You may be eligible for additional compensation", "Similar judicial precedents may favor you"],
    recommendation: isRTL
      ? `بناءً على وضعك في ${domain.labelAr}، يُوصى بالتواصل مع محامٍ متخصص لمراجعة المستندات وتقييم فرص القضية قبل أي خطوة رسمية.`
      : `Based on your ${domain.labelEn} situation, it is recommended to consult a specialized lawyer to review documents and assess case prospects before any formal step.`,
  };
}
