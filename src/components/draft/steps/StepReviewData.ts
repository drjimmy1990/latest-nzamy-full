import { Sword, Gavel, ShieldCheck as ShieldOk } from "@phosphor-icons/react";

export type CheckStatus = "ok" | "warn" | "error";
export type ItemAction  = "add" | "edit" | "delete" | null;
export type SimTarget   = "adversary" | "court" | "improvements";

export interface CheckItem {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
  suggestion?: string;
  fixHint?: string;
}

export interface WargamePoint {
  id: string;
  source: SimTarget;
  title: string;
  detail: string;
  severity: "critical" | "medium" | "low";
  response: string;
}

export interface DraftReviewProps {
  isDark: boolean;
  memoType: string;
  legalBranch: string;
  defenseCount?: number;
  lawCount?: number;
  hasParties?: boolean;
  hasCaseText?: boolean;
  hasJudgmentData?: boolean;
}

export function buildChecks(props: DraftReviewProps): CheckItem[] {
  const {
    memoType, legalBranch,
    defenseCount = 4, lawCount = 4,
    hasParties = true, hasCaseText = true, hasJudgmentData = false,
  } = props;
  const isAppeal = memoType === "appeal" || memoType === "reply";
  return [
    {
      id: "parties", label: "بيانات الأطراف",
      detail: hasParties ? "تم تحديد بيانات المدعي والمدعى عليه" : "بيانات الأطراف غير مكتملة — ضرورية لقبول المذكرة",
      status: hasParties ? "ok" : "error",
      suggestion: "أكمل بيانات الطرف الأول والثاني في الخطوة الثانية (الاسم الكامل، رقم الهوية، صفة الطرف).",
      fixHint: "الصق هنا بيانات الطرف المفقودة أو اكتبها...",
    },
    {
      id: "branch", label: "الفرع القانوني والاختصاص",
      detail: legalBranch ? `الفرع: ${legalBranch} — سيُبنى عليه النص وفق الأنظمة المختصة` : "الفرع القانوني غير محدد",
      status: legalBranch ? "ok" : "warn",
      suggestion: "حدد الفرع القانوني في الخطوة الأولى لضمان ملاءمة الحجج للمحكمة.",
    },
    {
      id: "casetext", label: "وقائع القضية",
      detail: hasCaseText ? "وقائع القضية مُدخَلة — سيُبنى عليها الهيكل الأساسي" : "لم يُدخل نص الوقائع — قد تصدر المذكرة بصياغة عامة",
      status: hasCaseText ? "ok" : "warn",
      suggestion: "أدخل ملخص الوقائع في الخطوة الثانية — كلما كانت أكثر تفصيلاً كانت الصياغة أدق.",
      fixHint: "اكتب أو الصق الوقائع باختصار...",
    },
    {
      id: "judgment", label: isAppeal ? "بيانات الحكم المطعون فيه" : "السند القانوني",
      detail: isAppeal
        ? (hasJudgmentData ? "رقم الحكم والمحكمة ومنطوقه مُدخَلة" : "بيانات الحكم المطعون فيه غير مكتملة — تُضعف الطعن")
        : "تم تحليل الوقائع لتحديد الأسس القانونية",
      status: isAppeal ? (hasJudgmentData ? "ok" : "error") : "ok",
      suggestion: isAppeal ? "أضف رقم الحكم، تاريخه، المحكمة المصدرة، ومنطوقه في قسم بيانات الحكم." : undefined,
      fixHint: "الصق رقم الحكم، التاريخ، المحكمة، والمنطوق...",
    },
    {
      id: "defenses", label: "الدفوع القانونية",
      detail: defenseCount >= 3 ? `${defenseCount} دفوع مُفعّلة — سيتم تفصيلها وفق أولوياتها`
        : defenseCount > 0 ? `${defenseCount} دفع فقط — يُوصى بدفوع إضافية` : "لم تُحدَّد أي دفوع",
      status: defenseCount >= 3 ? "ok" : defenseCount > 0 ? "warn" : "error",
      suggestion: defenseCount < 3 ? "ارجع لخطوة الدفوع وفعّل على الأقل ٣ دفوع للمذكرات القوية." : undefined,
    },
    {
      id: "laws", label: "النصوص والمواد القانونية",
      detail: lawCount >= 3 ? `${lawCount} مواد قانونية مستشهد بها` : lawCount > 0 ? `${lawCount} مادة فقط — يُوصى بإضافة مواد داعمة` : "لا توجد مواد قانونية",
      status: lawCount >= 3 ? "ok" : lawCount > 0 ? "warn" : "error",
      suggestion: lawCount < 3 ? "أضف مواد من نظام المرافعات أو الأنظمة ذات الصلة في الخطوة الخامسة." : undefined,
    },
    {
      id: "structure", label: "هيكل المذكرة ومنطقها",
      detail: (hasParties && hasCaseText && defenseCount >= 2) ? "مقدمة، وقائع، دفوع، أسانيد، طلبات — مكتملة" : "هيكل المذكرة غير مكتمل — يحتاج وقائع + دفوع",
      status: (hasParties && hasCaseText && defenseCount >= 2) ? "ok" : "warn",
      suggestion: "جودة المذكرة تعتمد على اكتمال: الوقائع + الدفوع + النصوص القانونية. راجع الخطوات 2 و4 و5.",
    },
    {
      id: "quality", label: "مستوى الصياغة وجودتها",
      detail: "الذكاء الاصطناعي سيولّد المذكرة محكمة الصياغة وفق معايير الكتابة القانونية السعودية",
      status: "ok",
    },
  ];
}

export const MOCK_WARGAME: WargamePoint[] = [
  { id: "w1", source: "adversary", severity: "critical", title: "الخصم سيدفع بالقبول الضمني للاستقالة", detail: "سيتمسك الخصم بأن عدم اعتراض الموكل خلال الفترة الأولى يُعدّ قبولاً ضمنياً للإنهاء.", response: "أضف فقرة تنفي القبول الضمني مستنداً إلى مبدأ أن الصمت لا يُعدّ قبولاً في عقود العمل النظامية." },
  { id: "w2", source: "adversary", severity: "medium", title: "الخصم سيطعن في شهادة الشاهد لعدم توثيقها", detail: "شهادة الشاهد الرئيسي غير موثقة رسمياً.", response: "أشر إلى أن عبء الإثبات يقع على عاتق الخصم وفق المادة (٢) من نظام الإثبات." },
  { id: "w3", source: "court", severity: "critical", title: "القاضي قد يسأل: لماذا تأخر الموكل في رفع الدعوى؟", detail: "التأخر قد يُشكّك في جدية الطلب.", response: "أضف فقرة تُبيّن أن التأخر ناتج عن محاولة تسوية ودية، وأن التقادم لم يكتمل." },
  { id: "w4", source: "court", severity: "medium", title: "القاضي قد يطلب تفصيل قيمة التعويض", detail: "المذكرة لم تُحدد مبلغاً مقداراً للتعويض.", response: "أضف جدولاً مالياً تفصيلياً: الأجر × أشهر + مكافأة + إجازات." },
  { id: "w5", source: "improvements", severity: "low", title: "تقوية الاستشهاد بأحكام قضائية سابقة", detail: "المذكرة تفتقر لسوابق قضائية مقارنة.", response: "أضف مرجعاً لحكم المحكمة العمالية بالرياض رقم ١٢٣/ع/١٤٤٤ في وقائع مشابهة." },
  { id: "w6", source: "improvements", severity: "low", title: "إضافة طلب احتياطي", detail: "عدم وجود طلب احتياطي يُضيّق هامش المناورة.", response: "أضف: «احتياطياً — الحكم بالتعويض المبني على أجر شهر عن كل سنة خدمة»." },
];

export const SEV_CONFIG = {
  critical: { dot: "bg-red-500",   badge: { d: "border-red-700/20 bg-red-900/10 text-red-400",     l: "border-red-200 bg-red-50 text-red-600"   }, label: "حرجة"   },
  medium:   { dot: "bg-amber-400", badge: { d: "border-amber-700/20 bg-amber-900/10 text-amber-400", l: "border-amber-200 bg-amber-50 text-amber-700" }, label: "متوسطة" },
  low:      { dot: "bg-blue-400",  badge: { d: "border-blue-700/20 bg-blue-900/10 text-blue-400",   l: "border-blue-200 bg-blue-50 text-blue-700"  }, label: "تحسين"  },
};

export const SRC_CONFIG: Record<SimTarget, { icon: React.ElementType; label: string; color: string; bg: { d: string; l: string } }> = {
  adversary:    { icon: Sword,   label: "الخصم",    color: "text-red-400",     bg: { d: "bg-red-900/20 border-red-700/30",       l: "bg-red-50 border-red-200"       } },
  court:        { icon: Gavel,   label: "المحكمة",  color: "text-blue-400",    bg: { d: "bg-blue-900/20 border-blue-700/30",     l: "bg-blue-50 border-blue-200"     } },
  improvements: { icon: ShieldOk, label: "تحسينات", color: "text-emerald-400", bg: { d: "bg-emerald-900/20 border-emerald-700/30", l: "bg-emerald-50 border-emerald-200" } },
};

export const MOCK_MEMO_BASE = `بسم الله الرحمن الرحيم

أصحاب الفضيلة / قضاة الدائرة العمالية حفظهم الله

الموضوع: صحيفة دعوى — فصل تعسفي

أولاً: الوقائع
التحق موكلنا بالعمل لدى المدعى عليها بموجب عقد عمل محدد المدة، وقد فوجئ بإنهاء خدماته دون مسوّغ نظامي.

ثانياً: الأسانيد
الدفع الأول: بطلان الإنهاء (المادة ٧٧ نظام العمل)
الدفع الثاني: مكافأة نهاية الخدمة (المادتان ٨٤، ٨٨)

ثالثاً: الطلبات
١. أجر الإشعار  ٢. المكافأة كاملة  ٣. التعويض عن الفصل`;
