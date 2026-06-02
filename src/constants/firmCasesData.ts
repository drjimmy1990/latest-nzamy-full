import React from "react";
import {
  CheckCircle, XCircle, Handshake, ArrowUpRight,
  Warning, Clock, Fire
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type CaseStatus   = "active" | "pending" | "suspended" | "closed";
export type CaseType     = "commercial" | "labor" | "civil" | "criminal" | "family" | "real_estate" | "admin";
export type Urgency      = "critical" | "high" | "medium" | "normal";
export type ArchiveResult = "won" | "lost" | "settled" | "withdrawn";
export type PageView     = "active" | "urgent" | "archive";

export interface FirmCase {
  id: string;
  title:          string;
  client:         string;
  clientType:     "individual" | "corporate";
  court:          string;
  type:           CaseType;
  status:         CaseStatus;
  assignee:       string;
  nextDate?:      string;
  daysLeft?:      number;       // أيام متبقية للطعن/الجلسة الحرجة
  isAppealDeadline?: boolean;   // هل هو ميعاد طعن؟
  importance:     1 | 2 | 3;   // 1=عالية، 2=متوسطة، 3=عادية
  filedDate:      string;
  stage:          string;
  value?:         string;
  // للأرشيف فقط
  closedDate?:    string;
  result?:        ArchiveResult;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
export const ACTIVE_CASES: FirmCase[] = [
  { id: "1", title: "نزاع تجاري — شركة الأفق",           client: "شركة الأفق للتجارة",  clientType: "corporate",   court: "محكمة الاستئناف التجارية", type: "commercial",  status: "active",    assignee: "أ. سارة المنصور", nextDate: "٢٠ أبريل", daysLeft: 2,  isAppealDeadline: true,  importance: 1, filedDate: "يناير ٢٠٢٤",   stage: "مرحلة الاستئناف", value: "١.٢ مليون ﷼" },
  { id: "2", title: "فسخ عقد إيجار — المالك وزاهد",     client: "أحمد الزاهد",          clientType: "individual",  court: "المحكمة العامة",          type: "civil",       status: "pending",   assignee: "أ. تركي العمر",   nextDate: "٢٥ أبريل", daysLeft: 5,  isAppealDeadline: false, importance: 2, filedDate: "مارس ٢٠٢٤",    stage: "انتظار رد الخصم" },
  { id: "3", title: "قضية فصل تعسفي ٤٥٦٧",              client: "خالد محمد القحطاني", clientType: "individual",  court: "المحكمة العمالية",        type: "labor",       status: "active",    assignee: "أ. نورة الشمري",  nextDate: "٢٨ أبريل", daysLeft: 3,  isAppealDeadline: true,  importance: 1, filedDate: "فبراير ٢٠٢٤",  stage: "إعداد صك صلح", value: "٢٢٠,٠٠٠ ﷼" },
  { id: "4", title: "استئناف العقار ٢١٣",                client: "سارة الدوسري",         clientType: "individual",  court: "محكمة الاستئناف",        type: "real_estate", status: "active",    assignee: "أ. سارة المنصور", nextDate: "٢ مايو",   daysLeft: 9,  isAppealDeadline: false, importance: 2, filedDate: "أبريل ٢٠٢٤",   stage: "جلسة استماع" },
  { id: "5", title: "طلاق وحضانة — المطيري",             client: "ريم المطيري",          clientType: "individual",  court: "المحكمة العامة",          type: "family",      status: "suspended", assignee: "أ. خالد الحربي",  daysLeft: 21, isAppealDeadline: false, importance: 3, filedDate: "نوفمبر ٢٠٢٣",  stage: "تعليق بطلب الطرفين" },
  { id: "7", title: "نزاع ملكية فكرية — براءة اختراع",  client: "شركة الإبداع التقني", clientType: "corporate",   court: "المحكمة التجارية",        type: "commercial",  status: "active",    assignee: "أ. نورة الشمري",  nextDate: "١٠ مايو",  daysLeft: 17, isAppealDeadline: false, importance: 2, filedDate: "مارس ٢٠٢٤",    stage: "جلسة أولى" },
  { id: "8", title: "عقد بناء — شركة التشييد الذهبي",  client: "مجموعة الذهبي",        clientType: "corporate",   court: "المحكمة التجارية",        type: "commercial",  status: "pending",   assignee: "أ. خالد الحربي",  nextDate: "١٥ مايو",  daysLeft: 22, isAppealDeadline: false, importance: 3, filedDate: "أبريل ٢٠٢٤",   stage: "تقديم لائحة" },
];

export const ARCHIVE_CASES: FirmCase[] = [
  { id: "a1", title: "قضية إخلال بعقد — البناء الحديث",  client: "شركة البناء الحديث",  clientType: "corporate",  court: "المحكمة التجارية",  type: "commercial",  status: "closed", assignee: "أ. سارة المنصور", filedDate: "يناير ٢٠٢٢",   closedDate: "ديسمبر ٢٠٢٣", stage: "مغلقة", result: "won",      importance: 1, value: "٤٠٠,٠٠٠ ﷼" },
  { id: "a2", title: "مطالبة إدارية — التأمينات",         client: "علي السبيعي",          clientType: "individual", court: "المحكمة الإدارية",  type: "admin",       status: "closed", assignee: "أ. تركي العمر",   filedDate: "يوليو ٢٠٢٣",   closedDate: "فبراير ٢٠٢٤",  stage: "مغلقة", result: "settled",  importance: 2 },
  { id: "a3", title: "نزاع عمالي — التحكيم الصناعي",     client: "محمد القرشي",          clientType: "individual", court: "محكمة العمل",       type: "labor",       status: "closed", assignee: "أ. نورة الشمري",  filedDate: "مارس ٢٠٢٢",    closedDate: "أكتوبر ٢٠٢٣",  stage: "مغلقة", result: "won",      importance: 1 },
  { id: "a4", title: "دعوى حضانة — الشمراني",            client: "فاطمة الشمراني",       clientType: "individual", court: "المحكمة العامة",    type: "family",      status: "closed", assignee: "أ. خالد الحربي",  filedDate: "أغسطس ٢٠٢٢",   closedDate: "يناير ٢٠٢٤",   stage: "مغلقة", result: "lost",     importance: 2 },
  { id: "a5", title: "مطالبة تجارية — الشركة العالمية",  client: "الشركة العالمية",      clientType: "corporate",  court: "المحكمة التجارية",  type: "commercial",  status: "closed", assignee: "أ. سارة المنصور", filedDate: "سبتمبر ٢٠٢١",  closedDate: "يونيو ٢٠٢٣",   stage: "مغلقة", result: "withdrawn", importance: 3, value: "٩٠٠,٠٠٠ ﷼" },
];

// ─── Config ───────────────────────────────────────────────────────────────────
export const getUrgency = (daysLeft?: number, isAppeal?: boolean): Urgency => {
  if (!daysLeft) return "normal";
  if (isAppeal && daysLeft <= 3) return "critical";
  if (daysLeft <= 3) return "critical";
  if (daysLeft <= 7) return "high";
  if (daysLeft <= 14) return "medium";
  return "normal";
};

export const URGENCY_CONFIG: Record<Urgency, { label: string; color: string; bg: string; dot: string; border: string }> = {
  critical: { label: "حرجة",    color: "text-red-500",    bg: "bg-red-500/10",    dot: "bg-red-500 animate-ping", border: "border-red-500/30" },
  high:     { label: "عاجلة",   color: "text-orange-500", bg: "bg-orange-500/10", dot: "bg-orange-400",           border: "border-orange-500/30" },
  medium:   { label: "متوسطة",  color: "text-amber-500",  bg: "bg-amber-500/10",  dot: "bg-amber-400",            border: "border-amber-500/30" },
  normal:   { label: "عادية",   color: "text-slate-400",  bg: "bg-slate-100",     dot: "bg-slate-300",            border: "border-slate-200" },
};

export const STATUS_CONFIG: Record<CaseStatus, { label: string; color: string; dot: string; kanbanBg: string }> = {
  active:    { label: "نشطة",   color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400 animate-pulse", kanbanBg: "border-t-emerald-400" },
  pending:   { label: "انتظار", color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       dot: "bg-amber-400",                 kanbanBg: "border-t-amber-400" },
  suspended: { label: "معلقة",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          dot: "bg-blue-400",                  kanbanBg: "border-t-blue-400" },
  closed:    { label: "مغلقة",  color: "text-slate-400 bg-slate-100 border-slate-200",              dot: "bg-slate-300",                 kanbanBg: "border-t-slate-400" },
};

export const RESULT_CONFIG: Record<ArchiveResult, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  won:       { label: "فاز المكتب",   icon: CheckCircle,       color: "text-emerald-500", bg: "bg-emerald-500/10" },
  lost:      { label: "خسرت الدعوى",  icon: XCircle,           color: "text-red-500",     bg: "bg-red-500/10" },
  settled:   { label: "انتهت بصلح",   icon: Handshake,       color: "text-blue-500",    bg: "bg-blue-500/10" },
  withdrawn: { label: "سُحبت الدعوى", icon: ArrowUpRight,      color: "text-slate-400",   bg: "bg-slate-100" },
};

export const TYPE_LABELS: Record<string, string> = {
  commercial: "تجاري", labor: "عمالي", civil: "مدني",
  criminal: "جنائي", family: "أحوال شخصية", real_estate: "عقاري", admin: "إداري",
};
