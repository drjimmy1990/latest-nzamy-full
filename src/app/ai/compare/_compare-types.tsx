// ─── Types ─────────────────────────────────────────────────────────────────────
export type Stage       = "input" | "processing" | "result";
export type DiffLevel   = "added" | "removed" | "modified" | "identical";
export type SeverityLevel = "critical" | "medium" | "low";

export interface DiffSection {
  id: string;
  title: string;
  docA: string;
  docB: string;
  status: DiffLevel;
  note?: string;
}

export interface CompareIssue {
  severity: SeverityLevel;
  title: string;
  detail: string;
  inDoc: "A" | "B" | "both";
}

export interface AutoFix {
  id: number;
  description: string;
  law: string;
  rejected: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
export const DOC_TYPES = [
  "عقد عمل", "عقد إيجار", "عقد توريد", "عقد شراكة",
  "مذكرة قضائية", "لائحة تنظيمية", "اتفاقية سرية", "عقد مقاولة",
  "أخرى",
];

export const PROCESSING_STEPS = [
  { label: "تحليل بنية المستند الأول",     duration: 700 },
  { label: "تحليل بنية المستند الثاني",    duration: 700 },
  { label: "تحديد الأقسام المتناظرة",       duration: 900 },
  { label: "رصد الاختلافات والتعارضات",    duration: 1100 },
  { label: "تقييم الأثر القانوني",          duration: 800 },
  { label: "إخراج التقرير المقارن",         duration: 400 },
];

// ─── Mock data ─────────────────────────────────────────────────────────────────
export const MOCK_DIFFS: DiffSection[] = [
  {
    id: "d1", title: "مدة العقد",
    docA: "تُحدَّد مدة هذا العقد بسنة هجرية واحدة قابلة للتجديد باتفاق الطرفين.",
    docB: "تُحدَّد مدة هذا العقد بسنتين هجريتين غير قابلة للتجديد التلقائي.",
    status: "modified",
    note: "تغيير جوهري: المدة تضاعفت وحُذف التجديد التلقائي — قد يضر بمصلحة الموظف.",
  },
  {
    id: "d2", title: "الأجر الأساسي",
    docA: "يتقاضى الموظف أجراً أساسياً قدره ثمانية آلاف ريال سعودي شهرياً.",
    docB: "يتقاضى الموظف أجراً أساسياً قدره ثمانية آلاف ريال سعودي شهرياً.",
    status: "identical",
  },
  {
    id: "d3", title: "بند السرية",
    docA: "يلتزم الموظف بالحفاظ على سرية المعلومات لمدة سنتين بعد انتهاء العقد.",
    docB: "يلتزم الموظف بالحفاظ على سرية المعلومات لمدة خمس سنوات بعد انتهاء العقد، ويشمل ذلك قواعد البيانات والعلاقات مع العملاء والأسرار التجارية.",
    status: "modified",
    note: "تمديد السرية لـ ٥ سنوات وتوسيع نطاقها — قيد أشد على الموظف.",
  },
  {
    id: "d4", title: "شرط عدم المنافسة",
    docA: "",
    docB: "يحظر على الموظف بعد انتهاء العقد العمل لدى أي منافس مباشر خلال سنة في نفس المنطقة الجغرافية.",
    status: "added",
    note: "بند جديد غائب عن النسخة الأولى — قد يقيّد حرية الموظف المهنية.",
  },
  {
    id: "d5", title: "إجازة سنوية",
    docA: "يستحق الموظف إجازة سنوية مدفوعة الأجر لا تقل عن واحد وعشرين يوماً وفق نظام العمل.",
    docB: "",
    status: "removed",
    note: "حُذف بند الإجازة السنوية من النسخة الثانية — مخالفة محتملة لنظام العمل.",
  },
  {
    id: "d6", title: "آلية فض النزاعات",
    docA: "يُحسم أي نزاع بالتراضي أولاً، وعند التعذر يُحال إلى القضاء السعودي المختص.",
    docB: "يُحسم أي نزاع بالتراضي أولاً، وعند التعذر يُحال إلى القضاء السعودي المختص.",
    status: "identical",
  },
];

export const MOCK_ISSUES: CompareIssue[] = [
  {
    severity: "critical",
    title: "حذف بند الإجازة السنوية",
    detail: "النسخة الثانية تخلو من بند الإجازة السنوية المكفول بموجب المادة (109) من نظام العمل السعودي. هذا الحذف يُفقد البند قانونيته.",
    inDoc: "B",
  },
  {
    severity: "critical",
    title: "شرط عدم المنافسة — اتساع غير مبرر",
    detail: "تضمّنت النسخة الثانية شرط عدم منافسة مبهم الحدود الجغرافية وغير محدد للنشاط، مما قد يُبطله قضاءً وفق مبدأ تناسب الشرط.",
    inDoc: "B",
  },
  {
    severity: "medium",
    title: "مدة السرية: ٥ سنوات قد تكون مفرطة",
    detail: "القضاء السعودي دأب على تخفيض مدة السرية المفرطة. يُنصح بإبقائها بين ١–٢ سنة مع تحديد النطاق بدقة.",
    inDoc: "B",
  },
  {
    severity: "medium",
    title: "تغيير مدة العقد دون إیضاح السبب",
    detail: "تضاعفت المدة من سنة إلى سنتين مع إلغاء التجديد التلقائي. هذا التعديل يستوجب إفصاحاً صريحاً للطرف الآخر.",
    inDoc: "both",
  },
  {
    severity: "low",
    title: "النسخة الأولى أكثر توافقاً مع نظام العمل",
    detail: "بشكل عام، النسخة الأولى تتضمن بنوداً تتوافق مع الحد الأدنى المقرر نظاماً. يُنصح بمراجعة النسخة الثانية لاستعادة البنود المحذوفة.",
    inDoc: "B",
  },
];

export const MOCK_AUTO_FIXES: AutoFix[] = [
  { id: 1, description: "أُضيف بند الإجازة السنوية (٢١ يوماً وفق م.١٠٩ نظام العمل)", law: "م.١٠٩ عمل", rejected: false },
  { id: 2, description: "خُفِّفت مدة السرية من ٥ سنوات إلى ٢ سنوات", law: "مبدأ التناسب القضائي", rejected: false },
  { id: 3, description: "حُدِّد شرط عدم المنافسة جغرافياً ومهنياً بدقة", law: "م.٨٣ نظام العمل", rejected: false },
];

export const FIXED_DOC_B = `عقد عمل — النسخة المحسّنة

بناءً على نظام العمل الصادر بالمرسوم الملكي رقم (م/٥١)، يُبرَم هذا العقد...

المادة الأولى — مدة العقد
تُحدَّد مدة هذا العقد بسنتين هجريتين غير قابلة للتجديد التلقائي.

المادة الثانية — الأجر الأساسي
يتقاضى الموظف أجراً أساسياً قدره ثمانية آلاف ريال سعودي شهرياً.

المادة الثالثة — الإجازة السنوية
يستحق الموظف إجازة سنوية مدفوعة الأجر لا تقل عن واحد وعشرين يوماً وفق نظام العمل.

المادة الرابعة — بند السرية
يلتزم الموظف بالحفاظ على سرية المعلومات لمدة سنتين بعد انتهاء العقد.

المادة الخامسة — شرط عدم المنافسة
يحظر على الموظف العمل لدى أي منافس مباشر خلال سنة في نفس المنطقة والتخصص المحدد في الملحق أ.`;

// ─── Style maps ─────────────────────────────────────────────────────────────────
import React from "react";
import { Plus, Minus, ArrowsLeftRight, Check } from "@phosphor-icons/react";

export const DIFF_STYLE: Record<DiffLevel, { bg: { dark: string; light: string }; badge: string; icon: React.ReactNode; label: string }> = {
  added:     { bg: { dark: "border-emerald-700/20 bg-emerald-900/10", light: "border-emerald-200 bg-emerald-50" },  badge: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20", icon: <Plus size={10} weight="bold" />,         label: "مُضاف" },
  removed:   { bg: { dark: "border-red-700/20 bg-red-900/10",         light: "border-red-200 bg-red-50"         },  badge: "bg-red-500/15 text-red-400 border-red-500/20",           icon: <Minus size={10} weight="bold" />,        label: "محذوف" },
  modified:  { bg: { dark: "border-amber-700/20 bg-amber-900/10",     light: "border-amber-200 bg-amber-50"     },  badge: "bg-amber-400/15 text-amber-400 border-amber-400/20",     icon: <ArrowsLeftRight size={10} />,            label: "معدَّل" },
  identical: { bg: { dark: "border-white/[0.04] bg-white/[0.01]",    light: "border-slate-100 bg-white"        },  badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/10",        icon: <Check size={10} weight="bold" />,        label: "متطابق" },
};

export const SEV_STYLE: Record<SeverityLevel, { dot: string; badge: { dark: string; light: string }; label: string }> = {
  critical: { dot: "bg-red-500",    badge: { dark: "border-red-700/20 bg-red-900/10 text-red-400",      light: "border-red-200 bg-red-50 text-red-600"     }, label: "حرجة" },
  medium:   { dot: "bg-amber-400",  badge: { dark: "border-amber-700/20 bg-amber-900/10 text-amber-400", light: "border-amber-200 bg-amber-50 text-amber-700" }, label: "متوسطة" },
  low:      { dot: "bg-blue-400",   badge: { dark: "border-blue-700/20 bg-blue-900/10 text-blue-400",   light: "border-blue-200 bg-blue-50 text-blue-700"   }, label: "معلومة" },
};

// ─── Format helper ──────────────────────────────────────────────────────────────
export function formatCompareReport(docAName: string, docBName: string) {
  const diffLines = MOCK_DIFFS.map((diff) => (
    `- [${diff.status}] ${diff.title}: A="${diff.docA || "-"}" | B="${diff.docB || "-"}"${diff.note ? ` | Note: ${diff.note}` : ""}`
  ));
  const issueLines = MOCK_ISSUES.map((issue) => (
    `- [${issue.severity}] ${issue.title} (${issue.inDoc}): ${issue.detail}`
  ));
  return [
    "Smart Compare Report",
    `Document A: ${docAName}`,
    `Document B: ${docBName}`,
    "",
    "Differences:",
    ...diffLines,
    "",
    "Issues:",
    ...issueLines,
  ].join("\n");
}
