import { LegalDomain } from "./types";

export function buildEvalReport(
  domain: LegalDomain,
  answers: string[],
  isRTL: boolean
) {
  const hasDocs = answers.some(
    (a) => a.toLowerCase().includes("نعم") || a.toLowerCase().includes("yes") || a.length > 30
  );
  const strength = hasDocs ? "متوسط إلى قوي" : "يحتاج تعزيز";
  const strengthEn = hasDocs ? "Moderate to Strong" : "Needs Strengthening";

  return {
    strength: isRTL ? strength : strengthEn,
    strengthScore: hasDocs ? 65 : 35,
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
