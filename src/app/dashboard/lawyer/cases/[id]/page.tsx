"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Gavel, ArrowRight, CalendarCheck, Clock, User, Buildings,
  FileText, ChatDots, ChartLine, Plus, Download, UploadSimple,
  ArrowUpRight, CheckCircle, Warning, PencilSimple, Scales,
  MapPin, MoneyWavy, Robot, FolderOpen, Eye, CheckSquare,
  Graph, UsersThree, Circle, DotsThree, Tag, Trash,
  ArrowsOut, ArrowsIn, ShareNetwork,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import dynamic from "next/dynamic";

const CaseGraphView = dynamic(
  () => import("@/app/dashboard/business/kanban/CaseGraphView"),
  { ssr: false, loading: () => <div className="h-96 flex items-center justify-center text-sm text-slate-400">جاري تحميل الجراف...</div> }
);

// ─── Mock Case Database ─────────────────────────────────────────────────────────
type CaseStatus = "active" | "pending" | "suspended" | "closed";
type TaskStatus = "todo" | "inprogress" | "done";
type TaskPriority = "high" | "medium" | "low";

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  due: string;
}

interface TeamMember {
  name: string;
  role: string;
  avatar: string;
}

interface CaseDetail {
  id: string;
  title: string;
  client: string;
  clientType: "individual" | "corporate";
  court: string;
  type: string;
  status: CaseStatus;
  assignee: string;
  nextDate?: string;
  filedDate: string;
  stage: string;
  description: string;
  value?: string;
  referenceNo?: string;
  team: TeamMember[];
  tasks: Task[];
  hearings: { date: string; court: string; result: string; status: "done" | "upcoming" }[];
  documents: { name: string; type: string; date: string; size: string }[];
  notes: { author: string; text: string; date: string }[];
  timeline: { event: string; date: string; icon: React.ElementType; color: string }[];
}

const CASES_DB: Record<string, CaseDetail> = {
  "1": {
    id: "1",
    title: "نزاع تجاري — شركة الأفق للتجارة",
    client: "شركة الأفق للتجارة",
    clientType: "corporate",
    court: "المحكمة التجارية",
    type: "تجاري",
    status: "active",
    assignee: "أ. فهد العتيبي",
    nextDate: "٢٠ أبريل ٢٠٢٤",
    filedDate: "يناير ٢٠٢٤",
    stage: "مرحلة الاستئناف",
    description: "نزاع تجاري يتعلق بعقد توريد بضاعة بين شركة الأفق ومورد خارجي، ادّعى الموكل إخلال المورد بشروط العقد وتسليم بضاعة معيبة بقيمة تتجاوز مليون ريال.",
    value: "١,٢٠٠,٠٠٠ ﷼",
    referenceNo: "CTC-2024-18732",
    team: [
      { name: "أ. فهد العتيبي", role: "المحامي الرئيسي", avatar: "ف" },
      { name: "أ. نورة الشمري", role: "مساعد قانوني", avatar: "ن" },
    ],
    tasks: [
      { id: "t1", title: "إعداد مذكرة الاستئناف",          status: "inprogress", priority: "high",   assignee: "أ. فهد العتيبي",  due: "١٨ أبريل" },
      { id: "t2", title: "مراجعة تقرير فحص البضاعة",       status: "done",       priority: "high",   assignee: "أ. نورة الشمري", due: "١٢ أبريل" },
      { id: "t3", title: "التحقق من سجل الشركة المورّدة",  status: "todo",       priority: "medium", assignee: "أ. فهد العتيبي",  due: "١٩ أبريل" },
      { id: "t4", title: "طلب صورة الحكم الابتدائي",        status: "done",       priority: "low",    assignee: "أ. نورة الشمري", due: "١ أبريل" },
      { id: "t5", title: "التواصل مع ممثل الموكل قبل الجلسة", status: "todo",    priority: "high",   assignee: "أ. فهد العتيبي",  due: "١٩ أبريل" },
    ],
    hearings: [
      { date: "١٠ مارس ٢٠٢٤",   court: "المحكمة التجارية",    result: "صدر حكم ابتدائي لصالح الموكل",           status: "done" },
      { date: "٢ أبريل ٢٠٢٤",   court: "محكمة استئناف الرياض", result: "حضور وطلب تأجيل للاطلاع على المستندات", status: "done" },
      { date: "٢٠ أبريل ٢٠٢٤",  court: "محكمة استئناف الرياض", result: "جلسة المرافعة الرئيسية",                status: "upcoming" },
    ],
    documents: [
      { name: "صحيفة الدعوى الابتدائية",      type: "pdf",  date: "يناير ٢٠٢٤",  size: "١.٢ MB" },
      { name: "عقد التوريد الأصلي",             type: "pdf",  date: "يناير ٢٠٢٤",  size: "٩٠٠ KB" },
      { name: "تقرير فحص البضاعة المعيبة",     type: "pdf",  date: "فبراير ٢٠٢٤", size: "٣.١ MB" },
      { name: "الحكم الابتدائي",                type: "pdf",  date: "مارس ٢٠٢٤",   size: "٧٢٠ KB" },
      { name: "لائحة الاعتراضية — الاستئناف",  type: "docx", date: "أبريل ٢٠٢٤",  size: "٢.٤ MB" },
    ],
    notes: [
      { author: "أ. فهد العتيبي",  text: "تمت مراجعة لائحة الاعتراض، وستُقدَّم في جلسة ٢٠ أبريل. موقف قوي قانونياً.",              date: "١٥ أبريل ٢٠٢٤" },
      { author: "أ. نورة الشمري", text: "يجب التحقق من سجل الشركة المورّدة لدى وزارة التجارة قبل الجلسة.",                         date: "١٢ أبريل ٢٠٢٤" },
      { author: "أ. فهد العتيبي",  text: "حضر مندوب الموكل واطّلع على مستندات القضية، أكد دعمه الكامل للاستراتيجية القانونية.", date: "٨ أبريل ٢٠٢٤" },
    ],
    timeline: [
      { event: "تقديم لائحة الاستئناف",  date: "٢ أبريل",  icon: FileText,    color: "text-royal" },
      { event: "صدر الحكم الابتدائي",     date: "١٠ مارس", icon: CheckCircle, color: "text-emerald-500" },
      { event: "تقديم الدعوى",             date: "يناير",   icon: Gavel,       color: "text-royal" },
    ],
  },
  "2": {
    id: "2",
    title: "فسخ عقد إيجار — المالك وزاهد",
    client: "أحمد الزاهد",
    clientType: "individual",
    court: "المحكمة العامة",
    type: "مدني",
    status: "pending",
    assignee: "أ. فهد العتيبي",
    nextDate: "٢٥ أبريل ٢٠٢٤",
    filedDate: "مارس ٢٠٢٤",
    stage: "انتظار رد الخصم",
    description: "طلب فسخ عقد إيجار عقار سكني بسبب امتناع المستأجر عن دفع الإيجار لمدة أربعة أشهر متتالية ورفض مغادرة العقار.",
    value: "٤٨,٠٠٠ ﷼",
    referenceNo: "GC-2024-22441",
    team: [
      { name: "أ. فهد العتيبي", role: "المحامي الرئيسي", avatar: "ف" },
    ],
    tasks: [
      { id: "t1", title: "مراجعة عقد الإيجار",            status: "done",       priority: "high",   assignee: "أ. فهد العتيبي", due: "٢٠ مارس" },
      { id: "t2", title: "تحضير رد على دفع المستأجر",     status: "inprogress", priority: "high",   assignee: "أ. فهد العتيبي", due: "٢٤ أبريل" },
      { id: "t3", title: "طلب كشف الإيجارات المتأخرة",    status: "todo",       priority: "medium", assignee: "أ. فهد العتيبي", due: "٢٢ أبريل" },
    ],
    hearings: [
      { date: "١٨ أبريل ٢٠٢٤",  court: "المحكمة العامة", result: "تقديم الدعوى وقبولها",     status: "done" },
      { date: "٢٥ أبريل ٢٠٢٤",  court: "المحكمة العامة", result: "رد الخصم — جلسة أولى",    status: "upcoming" },
    ],
    documents: [
      { name: "عقد الإيجار الأصلي",    type: "pdf",  date: "مارس ٢٠٢٤", size: "٨٠٠ KB" },
      { name: "إشعارات الإخلاء",        type: "pdf",  date: "مارس ٢٠٢٤", size: "٤٢٠ KB" },
    ],
    notes: [
      { author: "أ. فهد العتيبي", text: "ننتظر رد المستأجر. الوضع القانوني واضح لصالح الموكل.", date: "١٨ أبريل ٢٠٢٤" },
    ],
    timeline: [
      { event: "تقديم الدعوى وقبولها", date: "١٨ أبريل", icon: Gavel,    color: "text-royal" },
      { event: "إنذار رسمي للمستأجر",  date: "فبراير",   icon: Warning,  color: "text-amber-500" },
    ],
  },
};

// ─── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CaseStatus, { label: string; color: string; dot: string }> = {
  active:    { label: "نشطة",   color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400 animate-pulse" },
  pending:   { label: "انتظار", color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       dot: "bg-amber-400" },
  suspended: { label: "معلقة",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          dot: "bg-blue-400" },
  closed:    { label: "مغلقة",  color: "text-slate-400 bg-slate-100 border-slate-200",             dot: "bg-slate-300" },
};

const TASK_STATUS: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  todo:       { label: "لم تبدأ",    color: "text-slate-500 bg-slate-100",         dot: "bg-slate-300" },
  inprogress: { label: "قيد التنفيذ", color: "text-blue-600 bg-blue-500/10",       dot: "bg-blue-400 animate-pulse" },
  done:       { label: "مكتملة",     color: "text-emerald-600 bg-emerald-500/10", dot: "bg-emerald-400" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; badge: string }> = {
  high:   { label: "عالية",   badge: "text-red-500 bg-red-500/10 border-red-500/20" },
  medium: { label: "متوسطة",  badge: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  low:    { label: "منخفضة",  badge: "text-slate-400 bg-slate-100 border-slate-200" },
};

const TABS = [
  { id: "overview",  label: "نظرة عامة",  icon: Gavel },
  { id: "tasks",     label: "المهام",      icon: CheckSquare },
  { id: "hearings",  label: "الجلسات",     icon: CalendarCheck },
  { id: "documents", label: "المستندات",   icon: FolderOpen },
  { id: "team",      label: "الفريق",      icon: UsersThree },
  { id: "graph",     label: "الجراف",      icon: Graph },
  { id: "notes",     label: "الملاحظات",   icon: ChatDots },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CaseDetailPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "1";

  const caseData = CASES_DB[id] ?? CASES_DB["1"];
  const [activeTab, setActiveTab] = useState("overview");
  const [noteInput, setNoteInput] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskStatus | "all">("all");
  const [graphFullscreen, setGraphFullscreen] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const status = STATUS_CONFIG[caseData.status];

  const filteredTasks = caseData.tasks.filter(t => taskFilter === "all" || t.status === taskFilter);
  const taskStats = {
    done:       caseData.tasks.filter(t => t.status === "done").length,
    inprogress: caseData.tasks.filter(t => t.status === "inprogress").length,
    todo:       caseData.tasks.filter(t => t.status === "todo").length,
  };

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Breadcrumb */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link href="/dashboard/lawyer/cases"
          className={`inline-flex items-center gap-1.5 text-[13px] transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
          <ArrowRight size={13} />
          ملف القضايا
        </Link>
      </motion.div>

      {/* Header card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} p-5`}>
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${status.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
              <span className={`text-[11px] px-2 py-1 rounded-lg ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                {caseData.type}
              </span>
              {caseData.referenceNo && (
                <span className={`text-[11px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {caseData.referenceNo}
                </span>
              )}
            </div>
            <h1 className={`text-xl font-bold mb-2 leading-snug ${isDark ? "text-white" : "text-slate-800"}`}
              style={{ fontFamily: "var(--font-brand)" }}>
              {caseData.title}
            </h1>
            <div className={`flex items-center gap-4 text-[12px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <span className="flex items-center gap-1.5">
                {caseData.clientType === "corporate" ? <Buildings size={13} /> : <User size={13} />}
                {caseData.client}
              </span>
              <span className="flex items-center gap-1.5"><MapPin size={13} />{caseData.court}</span>
              <span className="flex items-center gap-1.5"><User size={13} />{caseData.assignee}</span>
              {caseData.value && (
                <span className="flex items-center gap-1.5"><MoneyWavy size={13} />{caseData.value}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            {caseData.nextDate && (
              <div className={`px-3 py-2 rounded-xl text-center ${isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
                <p className={`text-[10px] font-semibold mb-0.5 ${isDark ? "text-amber-500/70" : "text-amber-600"}`}>الجلسة القادمة</p>
                <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  <CalendarCheck size={12} className="inline ml-1" />{caseData.nextDate}
                </p>
              </div>
            )}
            <Link href="/ai/draft"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
              <PencilSimple size={14} />صياغة مذكرة
            </Link>
            <Link href="/ai/wargaming"
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <Robot size={14} />محاكي الخصم
            </Link>
          </div>
        </div>

        {/* Stage bar */}
        <div className={`mt-4 pt-4 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className={isDark ? "text-zinc-500" : "text-slate-400"}>المرحلة الحالية</span>
            <span className={`font-medium ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{caseData.stage}</span>
          </div>
          <div className="flex items-center gap-1">
            {["تقديم الدعوى", "المحكمة الابتدائية", "الاستئناف", "التمييز"].map((s, i) => {
              const current = caseData.stage.includes("استئناف") ? 2 : caseData.stage.includes("ابتدائي") ? 1 : caseData.stage.includes("انتظار") ? 0 : 0;
              return (
                <div key={s} className="flex-1 flex flex-col items-center">
                  <div className={`h-1.5 w-full rounded-full ${i <= current ? "bg-royal" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} />
                  <p className={`text-[9px] mt-1 text-center ${i <= current ? "text-royal" : isDark ? "text-zinc-700" : "text-slate-300"}`}>{s}</p>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-2xl overflow-x-auto ${isDark ? "bg-zinc-900/60 border border-white/[0.06]" : "bg-slate-100/80"}`}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all whitespace-nowrap flex-shrink-0 min-w-[70px] ${activeTab === tab.id
                ? isDark ? "bg-white/[0.08] text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-500 hover:text-slate-700"
              }`}>
              <Icon size={13} weight={activeTab === tab.id ? "duotone" : "regular"} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}>

          {/* ── Overview ── */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className={`lg:col-span-2 ${card} p-5 space-y-4`}>
                <div>
                  <h2 className={`text-sm font-bold mb-2 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                    <Scales size={14} className="text-royal" />وقائع القضية
                  </h2>
                  <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{caseData.description}</p>
                </div>
                <div className={`p-3 rounded-xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/30 bg-[#C8A762]/5"}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Robot size={13} className="text-[#C8A762]" />
                    <span className="text-[11px] font-bold text-[#C8A762]">تقييم نظامي AI</span>
                  </div>
                  <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    قوة موقف الموكل: <strong className="text-emerald-500">عالية (٧٨%)</strong> — الحكم الابتدائي الإيجابي يعزز الموقف في الاستئناف.
                  </p>
                  <Link href="/ai/analyze-strength"
                    className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-[#C8A762] hover:underline">
                    <ArrowUpRight size={10} />تحليل تفصيلي
                  </Link>
                </div>
                {/* Task quick summary */}
                <div className={`grid grid-cols-3 gap-2 p-3 rounded-xl ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                  {[
                    { label: "مكتملة",     value: taskStats.done,       color: "text-emerald-500" },
                    { label: "قيد التنفيذ", value: taskStats.inprogress, color: "text-blue-500" },
                    { label: "لم تبدأ",    value: taskStats.todo,        color: "text-slate-400" },
                  ].map((s, i) => (
                    <div key={i} className="text-center">
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Timeline */}
              <div className={`${card} p-5`}>
                <h2 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                  <ChartLine size={14} className="text-royal" />المخطط الزمني
                </h2>
                <div className="space-y-3">
                  {caseData.timeline.map((ev, i) => {
                    const Icon = ev.icon;
                    return (
                      <div key={i} className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                          <Icon size={13} weight="duotone" className={ev.color} />
                        </div>
                        <div>
                          <p className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{ev.event}</p>
                          <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{ev.date}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Tasks (Kanban) ── */}
          {activeTab === "tasks" && (
            <div className="space-y-4">
              {/* Header + filters */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-1.5">
                  {(["all", "todo", "inprogress", "done"] as const).map(s => (
                    <button key={s} onClick={() => setTaskFilter(s)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${taskFilter === s
                        ? "bg-royal text-white border-royal"
                        : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
                      }`}>
                      {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${TASK_STATUS[s].dot}`} />}
                      {s === "all" ? "الكل" : TASK_STATUS[s].label}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${taskFilter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                        {s === "all" ? caseData.tasks.length : caseData.tasks.filter(t => t.status === s).length}
                      </span>
                    </button>
                  ))}
                </div>
                <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"}`}>
                  <Plus size={12} weight="bold" />إضافة مهمة
                </button>
              </div>

              {/* Kanban columns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(["todo", "inprogress", "done"] as TaskStatus[]).map(col => {
                  const colTasks = caseData.tasks.filter(t => t.status === col);
                  const conf = TASK_STATUS[col];
                  return (
                    <div key={col}>
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <span className={`w-2 h-2 rounded-full ${conf.dot}`} />
                        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{conf.label}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                          {colTasks.length}
                        </span>
                      </div>
                      <div className="space-y-2.5 min-h-[100px]">
                        {colTasks.length === 0 && (
                          <div className={`${card} p-5 flex flex-col items-center justify-center opacity-40`}>
                            <Circle size={20} className={isDark ? "text-zinc-700" : "text-slate-300"} />
                            <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>لا توجد مهام</p>
                          </div>
                        )}
                        {colTasks.map((task, i) => {
                          const pri = PRIORITY_CONFIG[task.priority];
                          return (
                            <motion.div key={task.id}
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                              className={`group ${card} p-3.5 hover:border-royal/20 transition-all`}>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className={`text-[13px] font-semibold leading-snug flex-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{task.title}</p>
                                <button className={`opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all ${isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-100 text-slate-400"}`}>
                                  <DotsThree size={14} />
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${pri.badge}`}>{pri.label}</span>
                                <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                                  <Clock size={9} className="inline ml-0.5" />{task.due}
                                </span>
                              </div>
                              <div className={`mt-2 pt-2 border-t flex items-center gap-1.5 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                                <div className={`w-5 h-5 rounded-lg text-[10px] font-bold flex items-center justify-center ${isDark ? "bg-royal/20 text-royal" : "bg-royal/10 text-royal"}`}>
                                  {task.assignee.split(" ").pop()?.charAt(0)}
                                </div>
                                <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{task.assignee}</p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Hearings ── */}
          {activeTab === "hearings" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {caseData.hearings.length} جلسات مسجّلة
                </p>
                <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"}`}>
                  <Plus size={12} weight="bold" />إضافة جلسة
                </button>
              </div>
              {caseData.hearings.map((h, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`${card} p-4 flex items-start gap-4 ${h.status === "upcoming" ? "border-l-4 border-l-royal" : ""}`}>
                  <div className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${h.status === "upcoming" ? "bg-royal/10" : isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                    {h.status === "upcoming"
                      ? <Clock size={18} weight="duotone" className="text-royal" />
                      : <CheckCircle size={18} weight="duotone" className="text-emerald-500" />}
                    <span className={`text-[9px] font-bold mt-0.5 ${h.status === "upcoming" ? "text-royal" : "text-emerald-500"}`}>
                      {h.status === "upcoming" ? "قادمة" : "منتهية"}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{h.date}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{h.court}</span>
                    </div>
                    <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{h.result}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* ── Documents ── */}
          {activeTab === "documents" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{caseData.documents.length} مستندات</p>
                <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"}`}>
                  <UploadSimple size={12} />رفع مستند<input type="file" className="hidden" />
                </label>
              </div>
              {caseData.documents.map((doc, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className={`group ${card} p-4 flex items-center gap-3 hover:border-royal/20 transition-all`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${doc.type === "pdf" ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"}`}>
                    <FileText size={18} weight="duotone" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{doc.name}</p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{doc.size} · {doc.date}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Eye size={14} /></button>
                    <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Download size={14} /></button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* ── Team ── */}
          {activeTab === "team" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {caseData.team.length} أعضاء في الفريق
                </p>
              </div>
              {caseData.team.map((m, i) => {
                const memberTasks = caseData.tasks.filter(t => t.assignee === m.name);
                const doneTasks = memberTasks.filter(t => t.status === "done").length;
                return (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`${card} p-4`}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-royal/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[17px] font-bold text-royal">{m.avatar}</span>
                      </div>
                      <div className="flex-1">
                        <p className={`text-[14px] font-semibold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{m.name}</p>
                        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{m.role}</p>
                      </div>
                      <div className="text-left">
                        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                          {doneTasks}/{memberTasks.length}
                        </p>
                        <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مهام مكتملة</p>
                      </div>
                    </div>
                    {memberTasks.length > 0 && (
                      <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                        <div className="space-y-1.5">
                          {memberTasks.slice(0, 3).map((t, j) => (
                            <div key={j} className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TASK_STATUS[t.status].dot}`} />
                              <p className={`text-[11px] truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{t.title}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* ── Graph ── */}
          {activeTab === "graph" && (
            <div className={`${card} overflow-hidden`} style={{ height: "580px" }}>
              <div className={`p-3 border-b flex items-center gap-2 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <Graph size={14} weight="duotone" className="text-royal" />
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  الجراف البصري للقضية — {caseData.title}
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full mr-auto ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#C8A762]/10 text-[#C8A762]"}`}>
                  نظامي AI
                </span>
                <button
                  onClick={() => setGraphFullscreen(f => !f)}
                  className={`p-1.5 rounded-xl transition-colors ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}
                  title="ملء الشاشة"
                >
                  <ArrowsOut size={14} />
                </button>
              </div>
              <div className="h-[calc(100%-48px)]">
                <CaseGraphView isDark={isDark} isGlobal={false} />
              </div>
              {/* Fullscreen Overlay */}
              {graphFullscreen && (
                <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: isDark ? "#0f0f0f" : "#f8f8f8" }}>
                  <div className={`flex items-center gap-3 p-3 border-b ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white"}`}>
                    <Graph size={15} weight="duotone" className="text-royal" />
                    <p className={`text-[13px] font-semibold flex-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                      {caseData.title} — الجراف البصري
                    </p>
                    <button onClick={() => setGraphFullscreen(false)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors ${
                        isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}>
                      <ArrowsIn size={13} /> خروج
                    </button>
                  </div>
                  <div className="flex-1">
                    <CaseGraphView isDark={isDark} isGlobal={false} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Notes ── */}
          {activeTab === "notes" && (
            <div className="space-y-4">
              <div className={`${card} p-4`}>
                <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>ملاحظة جديدة</p>
                <textarea
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  placeholder="اكتب ملاحظتك هنا..."
                  rows={3}
                  className={`w-full text-sm bg-transparent outline-none resize-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
                />
                <div className="flex justify-end mt-2">
                  <button onClick={() => setNoteInput("")} disabled={!noteInput.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors disabled:opacity-40">
                    حفظ الملاحظة
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {caseData.notes.map((note, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className={`${card} p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-royal/10 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-royal">{note.author.split(" ").pop()?.charAt(0)}</span>
                        </div>
                        <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{note.author}</p>
                      </div>
                      <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{note.date}</p>
                    </div>
                    <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{note.text}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
