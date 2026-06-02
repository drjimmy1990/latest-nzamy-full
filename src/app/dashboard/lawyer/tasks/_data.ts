import {
  Gavel, FileText, Bell, CheckSquare, Users, Scales,
  Fire, Clock, CheckCircle,
} from "@phosphor-icons/react";
import type { Priority, TaskStatus, TaskCategory, Task } from "./_types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function today() { return new Date().toISOString().slice(0, 10); }
export function addDays(d: number) {
  const dt = new Date(); dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}
export function addMonths(m: number) {
  const dt = new Date(); dt.setMonth(dt.getMonth() + m);
  return dt.toISOString().slice(0, 10);
}

// ─── Config ────────────────────────────────────────────────────────────────────

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; dot: string; bg: string }> = {
  urgent: { label: "عاجل",    color: "text-red-500",    dot: "bg-red-400 animate-pulse", bg: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20" },
  high:   { label: "عالية",   color: "text-amber-500",  dot: "bg-amber-400",             bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20" },
  normal: { label: "عادية",   color: "text-blue-500",   dot: "bg-blue-400",              bg: "" },
  low:    { label: "منخفضة",  color: "text-slate-400",  dot: "bg-slate-300",             bg: "" },
};

export const CATEGORY_CONFIG: Record<TaskCategory, { label: string; icon: React.ElementType; color: string }> = {
  case:     { label: "قضية",   icon: Scales,      color: "text-royal" },
  document: { label: "مستند", icon: FileText,    color: "text-blue-500" },
  deadline: { label: "ميعاد", icon: Bell,        color: "text-red-500" },
  admin:    { label: "إداري", icon: CheckSquare, color: "text-emerald-500" },
  client:   { label: "موكل",  icon: Users,       color: "text-purple-500" },
};

export const KANBAN_COLS: { status: TaskStatus; label: string; color: string; bg: string }[] = [
  { status: "todo",        label: "معلقة",       color: "text-slate-500",  bg: "bg-slate-500" },
  { status: "in_progress", label: "قيد التنفيذ", color: "text-amber-500",  bg: "bg-amber-500" },
  { status: "done",        label: "مكتملة",      color: "text-emerald-500",bg: "bg-emerald-500" },
];

// ─── Sound helper ─────────────────────────────────────────────────────────────

export function playSuccessBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
  } catch { /* silent fail */ }
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

export const INIT_TASKS: Task[] = [
  {
    id: "1", title: "صياغة لائحة اعتراضية — قضية الأفق",
    category: "document", priority: "urgent", status: "todo",
    due: "اليوم ١١:٥٩ م", dueDate: today(), caseRef: "نزاع تجاري — الأفق", caseId: "1",
    subtasks: [
      { id: "s1", title: "جمع المستندات الداعمة", done: true },
      { id: "s2", title: "صياغة المقدمة", done: false },
      { id: "s3", title: "مراجعة المراجع القانونية", done: false },
    ],
  },
  {
    id: "2", title: "مراجعة عقد استثمار — شركة المساء",
    category: "document", priority: "high", status: "in_progress",
    due: "غداً", dueDate: addDays(1), caseRef: "عقد استثمار",
    subtasks: [
      { id: "s4", title: "قراءة الشروط الرئيسية", done: true },
      { id: "s5", title: "تسليط الضوء على البنود المثيرة للقلق", done: false },
    ],
  },
  {
    id: "3", title: "التحضير لجلسة استئناف العقار ٢١٣",
    category: "case", priority: "high", status: "todo",
    due: "٢ مايو", dueDate: addDays(5), caseRef: "استئناف العقار ٢١٣", caseId: "2",
    subtasks: [
      { id: "s6", title: "تحضير حجج الاستئناف", done: false },
      { id: "s7", title: "مراجعة قرار المحكمة الأصلي", done: false },
    ],
  },
  { id: "4", title: "تجديد الاشتراك في النظام", category: "admin", priority: "normal", status: "todo", due: "نهاية الشهر", dueDate: addDays(24) },
  { id: "5", title: "إرسال إشعار موكل — القحطاني", category: "client", priority: "normal", status: "done", due: "أمس", dueDate: addDays(-1), caseRef: "قضية عمالية" },
  { id: "6", title: "تحميل مستندات الاستئناف", category: "document", priority: "high", status: "done", due: "أمس", dueDate: addDays(-1) },
  {
    id: "7", title: "التحقق من موعد جلسة المطيري",
    category: "deadline", priority: "urgent", status: "todo",
    dueDate: addDays(2), caseRef: "طلاق وحضانة",
    subtasks: [
      { id: "s8", title: "الاتصال بقلم المحكمة", done: false },
      { id: "s9", title: "تسجيل الموعد في الجدول", done: false },
    ],
  },
  { id: "8", title: "اجتماع تخطيط أسبوعي", category: "admin", priority: "normal", status: "in_progress", due: "اليوم ٣:٠٠ م", dueDate: today() },
  { id: "9", title: "مراجعة مذكرة دفاع — شركة الذهبي", category: "document", priority: "high", status: "todo", due: "٥ مايو", dueDate: addDays(8), caseRef: "نزاع ملكية فكرية", assignedTo: "أحمد الراشد" },
  { id: "10", title: "إرسال تقرير التقدم إلى موكل", category: "client", priority: "low", status: "archived", due: "١ أبريل", dueDate: addDays(-5) },
  { id: "11", title: "مراجعة تقارير الخبراء للربع الثاني", category: "case", priority: "normal", status: "todo", due: "ربع ١ - يونيو ٢٠٢٦", dueDate: addMonths(2) },
  { id: "12", title: "تقرير الأداء السنوي للمكتب", category: "admin", priority: "low", status: "todo", due: "ديسمبر ٢٠٢٦", dueDate: addMonths(8) },
  // ── مهام الفريق (Solo+) ──
  { id: "13", title: "مراجعة لائحة الدعوى — قضية الفنارات (نورة)", category: "document", priority: "high", status: "in_progress", dueDate: addDays(3), caseRef: "نزاع تجاري — الفنارات", ownerId: "m1" },
  { id: "14", title: "أرشفة ملفات القضية القديمة (علي)", category: "admin", priority: "normal", status: "todo", dueDate: addDays(7), ownerId: "m2" },
];
