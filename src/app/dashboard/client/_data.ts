import { ChatCircle, FileText, MagnifyingGlass, Robot } from "@phosphor-icons/react";

export const MY_CASES = [
  {
    id: "2025-001",
    title: "قضية فصل تعسفي",
    lawyer: "أحمد الغامدي",
    lawyerType: "محامي عمالي",
    status: "session" as const,            // filed | pending | session | judgment | closed
    statusLabel: "جلسة قادمة",
    statusColor: "amber",
    nextAction: "الجلسة القادمة: ١٥ أبريل",
    urgent: true,
    caseNo: "٢٠٢٥-٠٠١",
    progress: 60,
  },
  {
    id: "2025-002",
    title: "نزاع عقاري — أرض بحي النخيل",
    lawyer: "سارة العتيبي",
    lawyerType: "محامية عقارية",
    status: "pending" as const,
    statusLabel: "قيد الانتظار",
    statusColor: "blue",
    nextAction: "انتظار ردّ المحكمة",
    urgent: false,
    caseNo: "٢٠٢٥-٠٠٢",
    progress: 30,
  },
];

export const NEXT_APPOINTMENT = {
  title: "استشارة قانونية — عمالي",
  lawyer: "أحمد الغامدي",
  lawyerPhone: "0501234567",
  date: "الأحد ١٣ أبريل",
  time: "١١:٠٠ ص",
  type: "فيديو",
  countdown: "بعد يومين",
};

export const RECENT_MESSAGES = [
  { from: "أحمد الغامدي", msg: "تمت إضافة الجلسة في التقويم، يرجى إحضار...", time: "منذ ساعة", unread: true },
  { from: "نظامي", msg: "استلمت مستنداتك — سيتم مراجعتها خلال 24 ساعة", time: "أمس", unread: false },
];

// ─── Plan mock (يُستبدل بـ API لاحقاً) ───────────────────────────────────────
// id: "free" | "shield" | "ai-individual" | "legal-protection"
export const USER_PLAN = {
  id: "ai-individual" as "free" | "shield" | "ai-individual" | "legal-protection",
  name: "نظامي AI",
  priceLabel: "٩٩ ر.س/شهر",
  renewDate: "١٥ مايو ٢٠٢٦",
  limits: { aiQueries: 40, contractDrafts: 2, consultations: 0 },
  used:   { aiQueries: 28, contractDrafts: 1, consultations: 0 },
  // ما هو مشمول في الباقة
  consultationIncluded: false,   // true فقط في legal-protection
  contractReviewIncluded: false, // مراجعة محامٍ متخصص مشمولة فقط في legal-protection
  contractDraftIncluded: true,   // صياغة AI مشمولة في ai-individual
  // أسعار بالطلب لما يتجاوز الحد أو غير مشمول
  payPerUse: {
    consultation: 250,    // ر.س للاستشارة الواحدة مع محامٍ
    aiConsultation: 49,   // ر.س للاستشارة الـ AI
    contractReview: 300,  // ر.س مراجعة محامٍ متخصص للعقد
    extraAiQuery: 5,      // ر.س للاستفسار الإضافي
  },
};

export const QUICK_SERVICES = [
  {
    label: "احجز استشارة",
    href: "/dashboard/client/services",
    icon: ChatCircle,
    // ذهبي داكن — خدمة مدفوعة بامتياز
    color: "from-[#b5883a] to-[#C8A762]",
    desc: "مع محامٍ متخصص",
    planBadge: USER_PLAN.consultationIncluded
      ? `مشمولة ${USER_PLAN.used.consultations}/${USER_PLAN.limits.consultations}`
      : `${USER_PLAN.payPerUse.consultation} ر.س`,
    planBadgeOk: USER_PLAN.consultationIncluded,
  },
  {
    label: "اسأل نظامي AI",
    href: "/ai/consult",
    icon: Robot,
    // أخضر داكن رئيسي — خدمة AI الأساسية
    color: "from-[#0B3D2E] to-[#1a6b50]",
    desc: "إجابات فورية",
    planBadge: USER_PLAN.id === "free"
      ? "١/يوم فقط"
      : `${USER_PLAN.limits.aiQueries - USER_PLAN.used.aiQueries} استفسار متبق`,
    planBadgeOk: USER_PLAN.id !== "free",
  },
  {
    label: "صياغة عقد",
    href: "/ai/contract-drafter",
    icon: FileText,
    // أخضر متوسط — خدمة AI ثانوية
    color: "from-[#155c40] to-[#1e7a55]",
    desc: "AI يصيغ لك العقد",
    planBadge: USER_PLAN.contractDraftIncluded
      ? `${USER_PLAN.limits.contractDrafts - USER_PLAN.used.contractDrafts} عقود متبقية`
      : `٧٠٠ ر.س`,
    planBadgeOk: USER_PLAN.contractDraftIncluded && USER_PLAN.used.contractDrafts < USER_PLAN.limits.contractDrafts,
  },
  {
    label: "ابحث عن محامٍ",
    href: "/dashboard/client/find-lawyer",
    icon: MagnifyingGlass,
    // ذهبي فاتح — مجاني ومميز
    color: "from-[#8a6520] to-[#b5883a]",
    desc: "متخصص في مجالك",
    planBadge: "مجاني دائماً",
    planBadgeOk: true,
  },
];

// ─── Community preview questions (subset from /community) ────────────────────
export const COMMUNITY_PREVIEW = [
  { id: 1, title: "هل يحق لصاحب العمل خصم من الراتب بسبب التأخر؟", tag: "عمالي", answers: 3, votes: 24, isAnswered: true,  ago: "منذ ٣ ساعات" },
  { id: 3, title: "تم فصلي تعسفياً بعد 6 سنوات — ما التعويض المستحق؟", tag: "عمالي", answers: 1, votes: 38, isAnswered: true,  ago: "منذ يوم" },
  { id: 2, title: "شريكي رفض توزيع الأرباح رغم أن الشركة ربحت — ماذا أفعل؟", tag: "تجاري", answers: 1, votes: 17, isAnswered: false, ago: "منذ ٥ ساعات" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  amber: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200 dark:border-amber-700/40" },
  blue:  { bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-600 dark:text-blue-400",   border: "border-blue-200 dark:border-blue-700/40"   },
  green: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700/40" },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.38, ease: "easeOut" as const },
  }),
};

// ─── Case Card (Client View) ──────────────────────────────────────────────────

export type ClientCase = (typeof MY_CASES)[number];
