import {
  Lightbulb, BookOpen, MagnifyingGlass, Scales,
  FileText, Sparkle, Brain, Globe,
  Database, Funnel, Warning, PencilSimple,
  ChartBar, Envelope, UserFocus,
  // Letter type icons
  Bell, FolderOpen, Coins, MegaphoneSimple, Prohibit, LockKeyOpen, PenNib,
  Handshake,
} from "@phosphor-icons/react";
import type { OutputType, SearchDepth, StepKey } from "./_types";

// ─── Output Types Config ────────────────────────────────────────────────────────

export const OUTPUT_TYPES: {
  id: OutputType; icon: React.ElementType; title: string; titleEn: string;
  desc: string; depth: SearchDepth; steps: StepKey[]; credits: number;
  color: string; bg: string; border: string; audience: string;
}[] = [
  {
    id: "consult", icon: Lightbulb, title: "استشارة قانونية", titleEn: "Legal Consultation",
    desc: "سؤال محدد — إجابة واضحة مع المرجع النظامي",
    // Task C4: "processing"/"result" replaced by a real "submit" step — the
    // request becomes an order a human admin fulfils, not a simulated result.
    depth: "quick", steps: ["type", "context", "submit"],
    credits: 5, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30",
    audience: "أفراد · عملاء · محامون",
  },
  {
    id: "study", icon: BookOpen, title: "دراسة قانونية", titleEn: "Legal Study",
    desc: "بحث معمّق في موضوع قانوني مع تحليل الأنظمة والسوابق",
    depth: "deep", steps: ["type", "context", "settings", "submit"],
    credits: 12, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30",
    audience: "محامون · مستشارون · شركات",
  },
  {
    id: "legal-memo", icon: Scales, title: "مذكرة رأي", titleEn: "Legal Memo",
    desc: "Legal Memo رسمية مع التوصيات والأساس النظامي الكامل",
    depth: "deep", steps: ["type", "context", "settings", "submit"],
    credits: 10, color: "text-[#C8A762]", bg: "bg-[#C8A762]/10", border: "border-[#C8A762]/30",
    audience: "محامون · مستشارون قانونيون",
  },
  {
    id: "research", icon: MagnifyingGlass, title: "بحث قانوني", titleEn: "Legal Research",
    desc: "بحث متخصص في المصادر المتعددة مع تجميع المراجع · يشمل دور الباحث القانوني",
    depth: "deep", steps: ["type", "context", "settings", "submit"],
    credits: 8, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30",
    audience: "محامون · متدربون · أكاديميون",
  },
  {
    id: "due-diligence", icon: ChartBar, title: "تقرير العناية الواجبة", titleEn: "Due Diligence",
    desc: "فحص قانوني شامل لصفقة أو كيان — Due Diligence",
    // No "settings" step: due-diligence's SettingsStep panel had nothing
    // type-specific to show (only the now-hidden agent-preview card), so
    // routing through it would land the client on a blank screen.
    depth: "comprehensive", steps: ["type", "context", "submit"],
    credits: 18, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30",
    audience: "شركات · M&A · مستثمرون",
  },
  {
    id: "letter", icon: Envelope, title: "خطاب رسمي", titleEn: "Official Letter",
    // "— خطاب جاهز في ١ دقيقة" removed (Task C4 fix pass): asserted a
    // turnaround the system doesn't enforce and contradicted this flow's
    // own step-4 copy admitting manual review (LetterWorkflow.tsx).
    desc: "إنذار قانوني · إخطار رسمي · مطالبة مالية · طلب مستند",
    // Unused at runtime once isLetterMode is true (LetterWorkflow drives its
    // own internal letterStep 1-4 instead) — left as-is, out of scope.
    depth: "quick", steps: ["type", "context", "processing", "result"],
    credits: 4, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30",
    audience: "محامون · أفراد · شركات",
  },
  {
    id: "cross-exam", icon: UserFocus, title: "مُولّد أسئلة الاستجواب", titleEn: "Cross-Examination",
    desc: "حلّل شهادة الخصم أو شاهده — وأنتج أسئلة تأسيسية وفخاخ وإغلاق تُفقده التماسك",
    depth: "deep", steps: ["type", "context", "submit"],
    credits: 8, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/30",
    audience: "محامون · مرافعون",
  },
];

// ─── Legal Areas ────────────────────────────────────────────────────────────────

export const LEGAL_AREAS = [
  "عقود", "عمالي", "تجاري", "عقاري", "شركات",
  "ملكية فكرية", "ضريبي وزكوي", "تأمين",
  "بنكي ومالي", "اندماج واستحواذ", "إفلاس",
  "أحوال شخصية", "إداري", "جنائي", "أخرى",
];

// ─── AI Agents ──────────────────────────────────────────────────────────────────

export const AGENTS_QUICK = [
  { key: "nzamy", label: "قاعدة نظامي", desc: "بحث في نظامي DB", icon: Database, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  { key: "summarize", label: "تلخيص ذكي", desc: "ترتيب النتائج وصياغة الإجابة", icon: Sparkle, color: "text-[#C8A762]", bg: "bg-[#C8A762]/10", border: "border-[#C8A762]/30" },
];

export const AGENTS_DEEP = [
  { key: "nzamy", label: "قاعدة نظامي", desc: "أنظمة + سوابق + مبادئ", icon: Database, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  { key: "external", label: "بحث خارجي", desc: "مصادر قانونية موثوقة", icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  { key: "analysis", label: "تحليل قانوني", desc: "تحليل وفق السياق السعودي", icon: Brain, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  { key: "merge", label: "دمج وتنقيح", desc: "دمج النتائج وإزالة التكرار", icon: Funnel, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  { key: "draft", label: "صياغة", desc: "إعداد المستند النهائي", icon: PencilSimple, color: "text-[#C8A762]", bg: "bg-[#C8A762]/10", border: "border-[#C8A762]/30" },
];

export const AGENTS_COMPREHENSIVE = [
  { key: "nzamy", label: "قاعدة نظامي", desc: "نظامي DB الكاملة", icon: Database, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  { key: "external", label: "بحث خارجي موسّع", desc: "بحث متعدد المصادر", icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  { key: "contracts", label: "وكيل العقود", desc: "تحليل بنود العقود", icon: FileText, color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/30" },
  { key: "analysis", label: "التحليل القانوني", desc: "تحليل عمق الأنظمة", icon: Brain, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  { key: "risk", label: "تحليل المخاطر", desc: "تحديد وتصنيف المخاطر", icon: Warning, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30" },
  { key: "merge", label: "دمج وتقرير", desc: "إعداد التقرير الشامل", icon: Funnel, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30" },
];

// ─── Mock result ────────────────────────────────────────────────────────────────

export const MOCK_RESULT = {
  summary: `بناءً على البحث المتعمق، يُعدّ **نظام العمل السعودي (م/٥١)** والمادة **٧٧** الأساس الرئيسي للموضوع المعروض.\nالمبدأ القضائي رقم **٨٩/٣** من المحكمة العليا يدعم الموقف القانوني في هذه الحالة.`,
  laws: [
    { article: "المادة ٧٧", system: "نظام العمل السعودي", text: "إذا أنهى أحد طرفي عقد العمل غير محدد المدة دون سبب مشروع وجب عليه تعويض الطرف الآخر بأجر خمسة عشر يوماً عن كل سنة من سنوات الخدمة.", relevance: 98 },
    { article: "المادة ٨٤", system: "نظام العمل السعودي", text: "مكافأة نهاية الخدمة تحتسب بأجر نصف شهر عن كل سنة من السنوات الخمس الأولى.", relevance: 94 },
    { article: "المادة ٨٨", system: "نظام العمل السعودي", text: "يُعفى العامل من توجيه إشعار الإنهاء إذا أخلّ صاحب العمل بالتزاماته.", relevance: 87 },
  ],
  precedents: [
    { title: "حكم محكمة العمل — الرياض ٤٥٢١/١٤٤٤", type: "حكم", status: "صادر", summary: "قضت المحكمة بأحقية الموظف في التعويض عن الفصل التعسفي شاملاً مكافأة نهاية الخدمة.", support: "مؤيِّد", source: "gemini" },
    { title: "مبدأ المحكمة العليا ٨٩/٣", type: "مبدأ", status: "ساري", summary: "لا يجوز الفصل أثناء الإجازة السنوية المعتمدة ويُعدّ مشروع الفسخ باطلاً.", support: "مؤيِّد", source: "nzamy" },
  ],
  risks: [
    "الخصم قد يدفع بعدم القدرة المالية لاحتساب التعويض",
    "إثبات دخل الأب الحقيقي قد يحتاج مستندات إضافية",
    "مدة التقادم ٣ سنوات من تاريخ انتهاء العقد — لا تتأخر",
  ],
  recommendation: "يُوصى بتقديم الدعوى مدعمة بمستندات إثبات الأجر وكشف الرواتب وخطاب الفصل، مع التحرك الفوري تجنباً لمشكلة التقادم.",
  draft: `بسم الله الرحمن الرحيم\n\n**رأي قانوني**\n\n**التاريخ:** ٢٠ شوال ١٤٤٧هـ | ٦ أبريل ٢٠٢٦م\n**أُعدّ بواسطة:** نظامي AI — بمراجعة المحامي المعتمد\n\n---\n\n**أولاً: الموضوع**\nتم الاستفسار حول الحق في التعويض عن الفصل التعسفي وفق نظام العمل السعودي.\n\n**ثانياً: الأساس النظامي**\nالمادة ٧٧ من نظام العمل (م/٥١) تُوجب التعويض عند إنهاء العقد دون سبب مشروع بما يعادل أجر ١٥ يوماً لكل سنة خدمة.\n\n**ثالثاً: التوصية**\nرفع دعوى أمام المحكمة العمالية مع إرفاق: كشف الراتب + خطاب الفصل + سجلات الحضور.\n\n**رابعاً: الخلاصة**\nالحق النظامي ثابت — يُنصح بالتحرك الفوري.\n\n---\n⚠ هذه المستند أعدّه الذكاء الاصطناعي ويجب مراجعته من محامٍ معتمد قبل الاستخدام.`,
  thinking: [
    { 
      agent: "قاعدة نظامي", 
      role: "البحث في الأنظمة والسوابق", 
      model: "Nzamy Vector DB",
      details: [
        "تم تحويل وقائع القضية إلى متجهات (Embeddings) والبحث في قاعدة الأنظمة السعودية.",
        "استخراج المواد ٧٧، ٨٤، ٨٨ من نظام العمل بناءً على نسبة التطابق (> ٩٠٪).",
        "تم العثور على المبدأ القضائي ٨٩/٣ المتعلق بالفصل التعسفي."
      ]
    },
    { 
      agent: "التحليل القانوني", 
      role: "تحليل المطابقة والثغرات", 
      model: "Claude 3.5 Sonnet",
      details: [
        "مطابقة الوقائع المذكورة مع المادة ٧٧.",
        "تبيّن أحقية الموظف في التعويض نظرًا لغياب السبب المشروع للفصل في المعطيات.",
        "تم تقييم قوة الموقف القانوني: ممتاز (٩٤٪)."
      ]
    },
    { 
      agent: "تحليل المخاطر", 
      role: "دراسة الدفوع المحتملة للخصم", 
      model: "GPT-4o",
      details: [
        "توليد سيناريوهات دفاع الخصم المحتملة.",
        "تحديد خطر أساسي: الدفع بعدم القدرة المالية للشركة بسبب إعادة الهيكلة.",
        "تحديد خطر إجرائي: احتمالية انقضاء مدة التقادم (٣ سنوات) لرفع الدعوى العمالية."
      ]
    },
    { 
      agent: "وكيل الصياغة", 
      role: "إعداد المسودة النهائية", 
      model: "Gemini 1.5 Pro",
      details: [
        "استلام مخرجات التحليل والبحث ودمجها في قالب 'رأي قانوني'.",
        "تقسيم المستند إلى ٤ أقسام رئيسية (الموضوع، الأساس، التوصية، الخلاصة).",
        "إضافة التنويه القانوني المعتمد في نهاية المستند."
      ]
    }
  ]
};

// ─── Letter Constants ───────────────────────────────────────────────────────────

export const LETTER_TYPES: { id: string; label: string; Icon: React.ElementType }[] = [
  { id: "warning",     label: "إنذار قانوني",                 Icon: Scales },
  { id: "termination", label: "إخطار بفسخ عقد / إنهاء علاقة", Icon: Prohibit },
  { id: "demand",      label: "مطالبة مالية وسداد مستحقات",  Icon: Coins },
  { id: "eviction",    label: "إشعار إخلاء عقار",             Icon: Warning },
  { id: "settlement",  label: "عرض تسوية ودية",               Icon: Sparkle },
  { id: "notice",      label: "إخطار رسمي",                    Icon: Bell },
  { id: "objection",   label: "تظلم / اعتراض إداري",           Icon: MegaphoneSimple },
  { id: "request",     label: "طلب مستند / إفادة رسمية",       Icon: FolderOpen },
  { id: "proxy",       label: "تفويض / إقرار رسمي",            Icon: PenNib },
  { id: "release",     label: "طلب إفراج عن مستند / كفالة",   Icon: LockKeyOpen },
];

/**
 * Letter families — owner item ١٧, «قائمة طويلة متداخلة → تجميعها في عائلات
 * وتصنيفات رئيسية واضحة».
 *
 * PRESENTATIONAL ONLY. Not a single `id` in LETTER_TYPES above changes, and no
 * new ids are introduced: `letterType` is written into `metadata.intake` on
 * every order ever placed, it is what intakeValues.ts labels, and it is what
 * the drafted letter's own heading is resolved from. Renaming an id to make a
 * grouping tidier would silently re-label historic orders — which is exactly
 * why `letterType: "complaint"` is still carried in intakeValues.ts long after
 * that tile left the picker.
 *
 * The families answer the question the flat grid could not: a client who knows
 * what they WANT («أريد إنهاء عقد») but not what the document is CALLED had to
 * read all eleven tiles to find «إخطار بفسخ عقد». The grouping is by intent,
 * not by legal form.
 *
 * Order matters — it is the order the families are rendered in, and it runs
 * from the most-asked-for to the most specialised.
 */
export const LETTER_FAMILIES: { id: string; label: string; members: string[] }[] = [
  { id: "claim",      label: "مطالبة واقتضاء حق",        members: ["warning", "demand"] },
  { id: "terminate",  label: "إنهاء علاقة تعاقدية",       members: ["termination", "eviction"] },
  { id: "settle",     label: "تسوية ودية",                members: ["settlement"] },
  { id: "official",   label: "مخاطبات رسمية وجهات حكومية", members: ["notice", "objection", "request"] },
  { id: "authorize",  label: "توكيلات وإقرارات وإفراجات",  members: ["proxy", "release"] },
];

/** The family a letter type belongs to, or null for one that belongs to none
 *  (today: the «أخرى» tile the picker appends inline, which is not a type). */
export function letterFamilyOf(letterTypeId: string): string | null {
  return LETTER_FAMILIES.find((f) => f.members.includes(letterTypeId))?.id ?? null;
}

export const GOV_ENTITIES = [
  "وزارة الموارد البشرية والتنمية الاجتماعية", "وزارة التجارة", "وزارة العدل",
  "هيئة الزكاة والضريبة والجمارك", "هيئة السوق المالية", "الهيئة العامة للعقار",
  "ديوان المظالم", "النيابة العامة", "رئاسة المحكمة العامة",
  "المؤسسة العامة للتأمينات الاجتماعية", "أمانة / بلدية المنطقة", "المركز السعودي للتحكيم التجاري", "أخرى",
];
