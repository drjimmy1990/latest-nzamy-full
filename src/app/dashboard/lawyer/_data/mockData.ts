import {
  Scales, Money, Gavel, Briefcase,
  Robot, PencilSimple, ChartLine, Sword,
  MagnifyingGlass, Warning, Bell, Lightning, CheckCircle,
  FileText, Headset, Compass,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Priority = "high" | "medium" | "low";
export type CaseStatus = "active" | "pending";
export type ActivityType = "warning" | "success" | "info" | "urgent" | "ai";
export type Severity = "urgent" | "warning" | "normal";

export interface Stat {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  trend: string;
  trendLabel: string;
  up: boolean;
}

export interface Task {
  id: number;
  title: string;
  dueDate: string;
  priority: Priority;
  category: string;
}

export interface RecentCase {
  id: string;
  title: string;
  status: CaseStatus;
  date: string;
  nextStep: string;
  type: string;
}

export interface ActivityItem {
  id: number;
  time: string;
  action: string;
  type: ActivityType;
  caseRef: string;
  category: "ai" | "manual" | "system";
}

export interface AiQuickItem {
  href: string;
  label: string;
  icon: React.ElementType;
  desc: string;
  badge?: string;   // e.g. "الأكثر استخداماً"
  hot?: boolean;
}

export interface Deadline {
  label: string;
  date: string;
  daysLeft: number;
  severity: Severity;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export const STATS: Stat[] = [
  { label: "القضايا النشطة",      value: "14",        icon: Scales,    color: "text-royal",       bg: "bg-royal/8",        trend: "+٢",   trendLabel: "هذا الشهر",  up: true },
  { label: "الاستشارات المعلقة",  value: "5",         icon: Briefcase, color: "text-amber-500",   bg: "bg-amber-500/8",    trend: "٥",    trendLabel: "تحتاج رد",   up: false },
  { label: "الجلسات القادمة",     value: "3",         icon: Gavel,     color: "text-blue-500",    bg: "bg-blue-500/8",     trend: "خلال", trendLabel: "٧ أيام",     up: true },
  { label: "الإيرادات المتوقعة",  value: "٤٥,٠٠٠ ﷼", icon: Money,     color: "text-emerald-500", bg: "bg-emerald-500/8",  trend: "+١٢%", trendLabel: "عن السابق",  up: true },
];

export const TASKS: Task[] = [
  { id: 1, title: "صياغة مذكرة جوابية — قضية فصل تعسفي", dueDate: "اليوم",    priority: "high",   category: "مستند" },
  { id: 2, title: "مراجعة عقد شراكة لشركة النور",          dueDate: "غداً",     priority: "medium", category: "عقد" },
  { id: 3, title: "التواصل مع العميل بخصوص أتعاب القضية", dueDate: "٢٠ أبريل", priority: "low",    category: "موكل" },
  { id: 4, title: "التحقق من موعد جلسة المطيري",           dueDate: "الأربعاء", priority: "high",   category: "جلسة" },
];

export const RECENT_CASES: RecentCase[] = [
  { id: "1", title: "نزاع تجاري — شركة الأفق",   status: "active",  date: "تحديث اليوم", nextStep: "جلسة استماع",    type: "تجاري" },
  { id: "2", title: "فسخ عقد إيجار",              status: "pending", date: "منذ يومين",   nextStep: "انتظار رد الخصم", type: "مدني" },
  { id: "3", title: "قضية عمالية رقم ٤٥٦٧",       status: "active",  date: "منذ ٣ أيام", nextStep: "إعداد صك صلح",   type: "عمالي" },
  { id: "4", title: "استئناف حكم تعويض",           status: "active",  date: "منذ ٥ أيام", nextStep: "تحضير المذكرة",  type: "استئناف" },
];

export const ACTIVITY_TIMELINE: ActivityItem[] = [
  { id: 1, time: "منذ ١٠ دقائق", action: "المستشار ماكس: تحليل القضية وتحضير استراتيجية الدفوع",   type: "ai",      caseRef: "قضية عمالية ٤٥٦٧",    category: "ai" },
  { id: 2, time: "منذ ٤٥ دقيقة", action: "تم استلام مذكرة رد من الخصم عبر منصة ناجز",              type: "warning", caseRef: "نزاع تجاري — الأفق",  category: "manual" },
  { id: 3, time: "منذ ساعة",      action: "محترف العقود: صياغة عقد شراكة مع إضافات حماية الملكية", type: "ai",      caseRef: "عقد شراكة — النور",   category: "ai" },
  { id: 4, time: "منذ ٣ ساعات",   action: "حُدِّد موعد جلسة جديد (عن بعد)",                        type: "info",    caseRef: "استئناف العقار ٢١٣",  category: "system" },
  { id: 5, time: "اليوم",         action: "محاكي الخصم: محاكاة جلسة المرافعة القادمة وتوقع الأسئلة", type: "ai",     caseRef: "الجلسة العمالية",     category: "ai" },
  { id: 6, time: "الأمس",         action: "العميل القحطاني وافق على الأتعاب وتم توقيع العقد",         type: "success", caseRef: "قضية عمالية",         category: "manual" },
  { id: 7, time: "الأمس",         action: "الصائغ القانوني: صياغة لائحة اعتراضية مبنية على الحكم",  type: "ai",      caseRef: "فسخ عقد إيجار",      category: "ai" },
  { id: 8, time: "منذ ٣ أيام",    action: "تذكير: اقتراب موعد الطعن ورفع المستندات",                type: "urgent",  caseRef: "استئناف حكم تعويض",  category: "system" },
];

export const AI_QUICK: AiQuickItem[] = [
  { href: "/ai/draft",               label: "الصائغ القانوني",   icon: PencilSimple, desc: "مذكرات + لوائح",          badge: "الأكثر استخداماً", hot: true },
  { href: "/ai/contracts",           label: "محترف العقود",      icon: FileText,     desc: "صياغة + مراجعة العقود" },
  { href: "/ai/direction-support",   label: "داعم الاتجاه",      icon: Compass,      desc: "نصوص نظامية داعمة",      badge: "جديد" },
  { href: "/ai/wargaming",           label: "محاكي الخصم",       icon: Sword,        desc: "محاكاة المرافعة" },
  { href: "/ai/analyze-strength",   label: "محلل قوة الموقف",  icon: ChartLine,    desc: "تحليل فرص النجاح" },
  { href: "/ai/secretary",           label: "السكرتير الذكي",    icon: Headset,      desc: "تقارير + جدول يومي" },
];

export const UPCOMING_DEADLINES: Deadline[] = [
  { label: "موعد الطعن بالاستئناف", date: "٨ أبريل",  daysLeft: 2, severity: "urgent" },
  { label: "تقديم مذكرة جوابية",    date: "١٢ أبريل", daysLeft: 6, severity: "warning" },
  { label: "جلسة تحضيرية",          date: "١٥ أبريل", daysLeft: 9, severity: "normal" },
];

// ─── Activity icon config (requires isDark, so built in-component) ─────────────

export const ACTIVITY_TYPE_CONFIG = {
  warning: { icon: Warning,      color: "text-amber-500",   bgDark: "bg-amber-500/10",   bgLight: "bg-amber-50",   borderDark: "border-amber-500/20",   borderLight: "border-amber-200" },
  success: { icon: CheckCircle,  color: "text-emerald-500", bgDark: "bg-emerald-500/10", bgLight: "bg-emerald-50", borderDark: "border-emerald-500/20", borderLight: "border-emerald-200" },
  info:    { icon: Bell,         color: "text-blue-500",    bgDark: "bg-blue-500/10",    bgLight: "bg-blue-50",    borderDark: "border-blue-500/20",    borderLight: "border-blue-200" },
  urgent:  { icon: Lightning,    color: "text-red-500",     bgDark: "bg-red-500/10",     bgLight: "bg-red-50",     borderDark: "border-red-500/20",     borderLight: "border-red-200" },
  ai:      { icon: Robot,        color: "text-[#C8A762]",   bgDark: "bg-[#C8A762]/10",   bgLight: "bg-[#C8A762]/10", borderDark: "border-[#C8A762]/20", borderLight: "border-[#C8A762]/30" },
} as const;
