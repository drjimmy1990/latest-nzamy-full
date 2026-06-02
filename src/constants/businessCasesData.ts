import {
  Warning, TrendUp, Dot,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type CaseStatus = "active" | "pending" | "suspended" | "closed" | "archived";
export type CaseType   = "commercial" | "labor" | "civil" | "criminal" | "family" | "real_estate" | "admin";
export type CourtDegree = "primary" | "appeal" | "supreme" | "admin" | "labor" | "criminal";
export type Priority   = "critical" | "high" | "normal" | "low";
export type KanbanCol  = "new" | "docs_prep" | "hearing" | "appeal" | "closed";

export interface Case {
  id: string;
  title:       string;
  client:      string;
  court:       string;
  type:        CaseType;
  status:      CaseStatus;
  priority:    Priority;
  nextDate?:   string;
  nextDateSort?:number; // days from today
  filedDate:   string;
  degree:      CourtDegree;
  stage:       string;
  kanbanCol:   KanbanCol;
  team:        string[];
  hasDeadline?: boolean; // موعد طعن قادم
  value?:      string;   // قيمة مالية
  lastActivity?: string; // منذ متى
  tags?:       string[];
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────
export const MOCK_CASES: Case[] = [
  {
    id: "1", title: "نزاع تجاري — شركة الأفق", client: "شركة الأفق للتجارة",
    court: "المحكمة التجارية", type: "commercial", status: "active", priority: "critical",
    nextDate: "٢٠ أبريل", nextDateSort: 0, filedDate: "يناير ٢٠٢٤", degree: "appeal", stage: "مرحلة الاستئناف",
    kanbanCol: "appeal", team: ["فهد", "نورة"], hasDeadline: true, value: "٣٠0,٠٠٠ ر", lastActivity: "اليوم",
    tags: ["عاجل", "طعن"],
  },
  {
    id: "2", title: "فسخ عقد إيجار — المالك وزاهد", client: "أحمد الزاهد",
    court: "المحكمة العامة", type: "civil", status: "pending", priority: "high",
    nextDate: "٢٥ أبريل", nextDateSort: 5, filedDate: "مارس ٢٠٢٤", degree: "primary", stage: "انتظار رد الخصم",
    kanbanCol: "hearing", team: ["فهد"], value: "٨٠,٠٠٠ ر", lastActivity: "أمس",
    tags: ["تجاري"],
  },
  {
    id: "3", title: "قضية عمالية — فصل تعسفي ٤٥٦٧", client: "خالد محمد القحطاني",
    court: "المحكمة العمالية", type: "labor", status: "active", priority: "high",
    nextDate: "٢٨ أبريل", nextDateSort: 8, filedDate: "فبراير ٢٠٢٤", degree: "primary", stage: "إعداد صك صلح",
    kanbanCol: "docs_prep", team: ["فهد", "علي"], value: "٥٠,٠٠٠ ر", lastActivity: "٣ أيام",
    tags: ["عمالي"],
  },
  {
    id: "4", title: "استئناف العقار ٢١٣", client: "سارة الدوسري",
    court: "محكمة الاستئناف", type: "real_estate", status: "active", priority: "critical",
    nextDate: "٢ مايو", nextDateSort: 12, filedDate: "أبريل ٢٠٢٤", degree: "appeal", stage: "جلسة استماع",
    kanbanCol: "appeal", team: ["نورة"], hasDeadline: true, value: "٥٠٠,٠٠٠ ر", lastActivity: "اليوم",
    tags: ["طعن", "عقاري"],
  },
  {
    id: "5", title: "طلاق وحضانة — المطيري", client: "ريم المطيري",
    court: "المحكمة العامة", type: "family", status: "suspended", priority: "normal",
    filedDate: "نوفمبر ٢٠٢٣", degree: "primary", stage: "تعليق بطلب الطرفين",
    kanbanCol: "hearing", team: ["فهد"], value: "", lastActivity: "أسبوع",
    tags: ["شخصية"],
  },
  {
    id: "6", title: "مطالبة إدارية — التأمينات", client: "علي السبيعي",
    court: "المحكمة الإدارية", type: "admin", status: "closed", priority: "low",
    filedDate: "يوليو ٢٠٢٣", degree: "supreme", stage: "صدر حكم نهائي",
    kanbanCol: "closed", team: ["علي"], value: "١٢٠,٠٠٠ ر", lastActivity: "شهر",
    tags: ["إداري", "منتهية"],
  },
  {
    id: "7", title: "نزاع ملكية فكرية — براءة اختراع", client: "مجموعة الذهبي",
    court: "المحكمة التجارية", type: "commercial", status: "active", priority: "high",
    nextDate: "٥ مايو", nextDateSort: 15, filedDate: "مارس ٢٠٢٤", degree: "primary", stage: "جلسة أولى",
    kanbanCol: "new", team: ["فهد", "نورة", "علي"], value: "٢٠٠,٠٠٠ ر", lastActivity: "٢ أيام",
    tags: ["تجاري"],
  },
];

// ─── Courts ──────────────────────────────────────────────────────────────────
export const COURTS_LIST = [
  { id: "المحكمة التجارية",         degree: "primary" as CourtDegree, icon: "🏢" },
  { id: "المحكمة العامة",           degree: "primary" as CourtDegree, icon: "⚖️" },
  { id: "المحكمة العمالية",         degree: "labor"   as CourtDegree, icon: "👷" },
  { id: "المحكمة الجزائية",         degree: "criminal" as CourtDegree, icon: "🔒" },
  { id: "محكمة الأحوال الشخصية",   degree: "primary" as CourtDegree, icon: "👨‍👩‍👧" },
  { id: "المحكمة الإدارية",         degree: "admin"   as CourtDegree, icon: "🏛" },
  { id: "ديوان المظالم (الإدارية)",degree: "admin"   as CourtDegree, icon: "📜" },
  { id: "محكمة الاستئناف",          degree: "appeal"  as CourtDegree, icon: "🔗" },
  { id: "محكمة الاستئناف التجارية", degree: "appeal"  as CourtDegree, icon: "📊" },
  { id: "محكمة الاستئناف الإدارية",degree: "appeal"  as CourtDegree, icon: "🗂" },
  { id: "المحكمة العليا",           degree: "supreme" as CourtDegree, icon: "👑" },
  { id: "المحكمة العقارية",         degree: "primary" as CourtDegree, icon: "🏠" },
  { id: "محكمة التنفيذ",            degree: "primary" as CourtDegree, icon: "⚡" },
  { id: "محكمة الأسرة",             degree: "primary" as CourtDegree, icon: "❤️" },
];

export const DEGREE_LABELS: Record<CourtDegree, string> = {
  primary:  "ابتدائي",
  appeal:   "استئناف",
  supreme:  "عليا",
  admin:    "إداري (ديوان المظالم)",
  labor:    "عمالية",
  criminal: "جزائية (ابتدائي)",
};

// ─── Configs ──────────────────────────────────────────────────────────────────
export const STATUS_CONFIG: Record<CaseStatus, { label: string; color: string; dot: string; bg: string }> = {
  active:    { label: "نشطة",    color: "text-emerald-500", dot: "bg-emerald-400 animate-pulse", bg: "bg-emerald-500/10 border-emerald-500/20" },
  pending:   { label: "انتظار",  color: "text-amber-500",   dot: "bg-amber-400",                 bg: "bg-amber-500/10 border-amber-500/20" },
  suspended: { label: "معلقة",   color: "text-blue-500",    dot: "bg-blue-400",                  bg: "bg-blue-500/10 border-blue-500/20" },
  closed:    { label: "مغلقة",   color: "text-slate-400",   dot: "bg-slate-300",                 bg: "bg-slate-100 border-slate-200 dark:bg-white/[0.04] dark:border-white/[0.08]" },
  archived:  { label: "أرشيف",   color: "text-purple-400",  dot: "bg-purple-300",                bg: "bg-purple-500/10 border-purple-500/20" },
};

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; icon: any }> = {
  critical: { label: "حرج",   color: "text-red-500",     icon: Warning },
  high:     { label: "عالٍ",  color: "text-orange-500",  icon: TrendUp },
  normal:   { label: "عادي",  color: "text-blue-500",    icon: Dot },
  low:      { label: "منخفض", color: "text-slate-400",   icon: Dot },
};

export const TYPE_LABELS: Record<CaseType, string> = {
  commercial: "تجاري", labor: "عمالي", civil: "مدني",
  criminal: "جنائي", family: "أحوال شخصية", real_estate: "عقاري", admin: "إداري",
};

export const KANBAN_COLS: { key: KanbanCol; label: string; color: string; bg: string }[] = [
  { key: "new",       label: "جديدة",      color: "text-slate-500",    bg: "bg-slate-100 dark:bg-white/[0.04]" },
  { key: "docs_prep", label: "تحضير وثائق", color: "text-blue-500",     bg: "bg-blue-50 dark:bg-blue-500/10" },
  { key: "hearing",   label: "جلسات",      color: "text-royal",        bg: "bg-royal/8 dark:bg-royal/15" },
  { key: "appeal",    label: "طعن/استئناف", color: "text-orange-500",   bg: "bg-orange-50 dark:bg-orange-500/10" },
  { key: "closed",    label: "منتهية",     color: "text-emerald-500",  bg: "bg-emerald-50 dark:bg-emerald-500/10" },
];

export const TIME_FILTERS = [
  { key: "all",    label: "الكل" },
  { key: "today",  label: "اليوم" },
  { key: "week",   label: "هذا الأسبوع" },
  { key: "month",  label: "هذا الشهر" },
  { key: "urgent", label: "⏰ طعون قادمة" },
];
