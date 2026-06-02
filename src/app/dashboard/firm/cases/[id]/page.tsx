"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, UserCircle, PencilSimpleLine, Scales,
  MagnifyingGlass, ClipboardText, CalendarCheck, ChatCircle,
  ListChecks, FileText, Clock, Users, Plus, ArrowLeft,
  Sparkle, Check, CaretDown, Flag, Eye, Lightning,
  GraduationCap, Robot, CheckCircle, Timer, Star, Graph
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import LegalCanvas from "./LegalCanvas";

// ── Types ─────────────────────────────────────────────────
type CaseTab = "tasks" | "docs" | "sessions" | "chat" | "timeline" | "canvas";
type TaskStatus = "done" | "wip" | "pending";
type TeamRole = "lead" | "associate" | "trainee" | "researcher" | "secretary" | "external";

const CASE_INFO = {
  id: "NZ-2026-0042", title: "شركة الأفق ضد مؤسسة النور",
  type: "عمالية — فصل تعسفي", client: "شركة الأفق للمقاولات",
  nextHearing: "١٥ أبريل ٢٠٢٦ — ١٠:٠٠ ص", court: "المحكمة العمالية — الرياض", totalHours: 42,
};

const TEAM_MEMBERS: { name: string; role: TeamRole; roleLabel: string; avatar: string; hours: number; tasks: number; tasksDone: number }[] = [
  { name: "أ. فهد السبيعي", role: "lead", roleLabel: "المحامي الرئيسي", avatar: "ف", hours: 18, tasks: 8, tasksDone: 7 },
  { name: "أ. نورة الزهراني", role: "associate", roleLabel: "محامية مساعدة", avatar: "ن", hours: 15, tasks: 10, tasksDone: 9 },
  { name: "أحمد المالكي", role: "trainee", roleLabel: "متدرب", avatar: "أ", hours: 9, tasks: 6, tasksDone: 4 },
  { name: "سارة العتيبي", role: "secretary", roleLabel: "سكرتارية", avatar: "س", hours: 0, tasks: 4, tasksDone: 3 },
];

const ROLE_COLORS: Record<TeamRole, string> = {
  lead: "bg-royal text-white", associate: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
  trainee: "bg-amber-500/10 text-amber-500 border border-amber-500/20", researcher: "bg-purple-500/10 text-purple-500 border border-purple-500/20",
  secretary: "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20", external: "bg-red-500/10 text-red-500 border border-red-500/20",
};

const TASKS = [
  { id: 1, title: "مراجعة مذكرة الرد", assignee: "أ. نورة", status: "done" as TaskStatus, dueDate: "١٢ أبريل" },
  { id: 2, title: "بحث في مادة ٧٧ نظام العمل", assignee: "أحمد", status: "wip" as TaskStatus, dueDate: "١٤ أبريل" },
  { id: 3, title: "حضور جلسة ١٥ أبريل", assignee: "أ. فهد", status: "pending" as TaskStatus, dueDate: "١٥ أبريل" },
  { id: 4, title: "رفع محضر الجلسة السابقة", assignee: "سارة", status: "pending" as TaskStatus, dueDate: "١٣ أبريل" },
  { id: 5, title: "صياغة مذكرة ختامية", assignee: "أ. نورة", status: "pending" as TaskStatus, dueDate: "٢٠ أبريل" },
  { id: 6, title: "تجميع المستندات المؤيدة", assignee: "أحمد", status: "wip" as TaskStatus, dueDate: "١٤ أبريل" },
  { id: 7, title: "إعداد حقيبة الجلسة", assignee: "سارة", status: "done" as TaskStatus, dueDate: "١٤ أبريل" },
];

const TIMELINE_EVENTS = [
  { date: "١٢ أبريل", time: "١٤:٣٠", user: "أ. نورة", action: "أكملت مراجعة مذكرة الرد — ٣ تعديلات", type: "task" },
  { date: "١١ أبريل", time: "١٠:١٥", user: "أحمد", action: "رفع بحث عن المادة ٧٧ — مسودة أولى", type: "doc" },
  { date: "١٠ أبريل", time: "١٦:٠٠", user: "أ. فهد", action: "أعاد المسودة لأحمد بـ ٤ ملاحظات", type: "review" },
  { date: "٠٩ أبريل", time: "٠٩:٠٠", user: "سارة", action: "رفعت محضر الجلسة رقم ٣", type: "doc" },
  { date: "٠٨ أبريل", time: "١١:٣٠", user: "أ. فهد", action: "حضر الجلسة رقم ٣ — تأجيل لـ ١٥ أبريل", type: "hearing" },
  { date: "٠٥ أبريل", time: "١٣:٠٠", user: "AI نظامي", action: "تحليل وثائق الطرف الآخر — ٣ نقاط ضعف مكتشفة", type: "ai" },
];

const AI_SUGGESTION = {
  recommended: [
    { name: "أ. نورة الزهراني", role: "محامية مساعدة", reason: "تفرّغ ٧٠٪ + خبرة ٣ قضايا عمالية + تقييم ٤.٨", available: true },
    { name: "أحمد المالكي", role: "متدرب", reason: "تفرّغ ٩٠٪ + يحتاج خبرة في القضايا العمالية (تطوير)", available: true },
  ],
  alternatives: [
    { name: "ريم القحطاني", role: "باحثة", reason: "تفرّغ ٤٠٪ — مشغولة بقضيتين أخريين", available: false },
    { name: "م. عبدالله", role: "مستشار خارجي", reason: "متخصص عمالي — متاح للتفويض المؤقت", available: true },
  ],
};

export default function FirmCaseDetailsPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [caseTab, setCaseTab] = useState<CaseTab>("tasks");
  const [showAiAssign, setShowAiAssign] = useState(false);

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-500" : "text-zinc-400";
  const statusConfig = {
    done: { label: "✅ مكتمل", color: "text-emerald-500 bg-emerald-500/10" },
    wip: { label: "🔄 قيد التنفيذ", color: "text-blue-500 bg-blue-500/10" },
    pending: { label: "⏳ معلّق", color: "text-zinc-400 bg-zinc-400/10" },
  };

  return (
    <div className={`p-5 md:p-7 max-w-6xl mx-auto space-y-5 ${tp}`} dir="rtl">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Briefcase size={18} weight="duotone" className="text-royal" />
            <h1 className={`text-xl font-bold ${tp}`}>{CASE_INFO.title}</h1>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>{CASE_INFO.id}</span>
          </div>
          <p className={`text-[12px] ${ts}`}>{CASE_INFO.type} — {CASE_INFO.client}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <div className={`px-3 py-1.5 rounded-lg ${isDark ? "bg-white/[0.04]" : "bg-zinc-50"} flex items-center gap-1.5`}>
            <CalendarCheck size={12} className="text-royal" /> الجلسة القادمة: <strong>{CASE_INFO.nextHearing}</strong>
          </div>
          <div className={`px-3 py-1.5 rounded-lg ${isDark ? "bg-white/[0.04]" : "bg-zinc-50"} flex items-center gap-1.5`}>
            <Timer size={12} className="text-[#C8A762]" /> إجمالي الساعات: <strong>{CASE_INFO.totalHours}</strong>
          </div>
        </div>
      </div>

      {/* Team strip */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center justify-between mb-3">
          <p className={`text-[12px] font-bold ${tp}`}>👥 فريق القضية</p>
          <button onClick={() => setShowAiAssign(!showAiAssign)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-royal/10 text-royal text-[11px] font-semibold">
            <Sparkle size={12} weight="fill" /> {showAiAssign ? "إخفاء الاقتراح" : "اقتراح AI"}
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {TEAM_MEMBERS.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold ${m.role === "lead" ? "bg-royal text-white" : isDark ? "bg-white/[0.06] text-zinc-300" : "bg-zinc-100 text-zinc-600"}`}>{m.avatar}</div>
              <div>
                <p className={`text-[11px] font-semibold ${tp}`}>{m.name}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${ROLE_COLORS[m.role]}`}>{m.roleLabel}</span>
              </div>
              <div className="text-end ms-2">
                <p className={`text-[10px] font-mono ${tp}`}>{m.hours}h</p>
                <p className={`text-[9px] ${ts}`}>{m.tasksDone}/{m.tasks}</p>
              </div>
            </div>
          ))}
          <button className={`w-9 h-9 rounded-full flex items-center justify-center border-2 border-dashed ${isDark ? "border-white/[0.1] text-zinc-500" : "border-zinc-200 text-zinc-400"} hover:border-royal/50`}>
            <Plus size={14} />
          </button>
        </div>

        {/* AI suggestion */}
        <AnimatePresence>
          {showAiAssign && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className={`mt-4 p-4 rounded-xl border ${isDark ? "border-royal/20 bg-royal/5" : "border-royal/15 bg-royal/5"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Robot size={14} className="text-[#C8A762]" weight="fill" />
                  <span className={`text-[11px] font-bold ${isDark ? "text-[#C8A762]" : "text-royal"}`}>اقتراح الذكاء الاصطناعي — حسب التفرغ والخبرة</span>
                </div>
                <p className={`text-[10px] mb-3 ${ts}`}>بناءً على تحليل تفرغ الفريق وخبراتهم السابقة في القضايا العمالية:</p>
                <div className="space-y-2">
                  {AI_SUGGESTION.recommended.map((r, i) => (
                    <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg ${isDark ? "bg-emerald-900/10 border border-emerald-700/20" : "bg-emerald-50 border border-emerald-100"}`}>
                      <CheckCircle size={14} className="text-emerald-500 shrink-0" weight="fill" />
                      <div className="flex-1">
                        <p className={`text-[11px] font-bold ${tp}`}>{r.name} <span className={`font-normal ${ts}`}>({r.role})</span></p>
                        <p className={`text-[10px] ${ts}`}>{r.reason}</p>
                      </div>
                      <button className="text-[10px] font-bold text-emerald-500 px-2 py-1 rounded-lg bg-emerald-500/10">✓ مُختار</button>
                    </div>
                  ))}
                  {AI_SUGGESTION.alternatives.map((r, i) => (
                    <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg ${isDark ? "bg-white/[0.02] border border-white/[0.04]" : "bg-zinc-50 border border-zinc-100"}`}>
                      <UserCircle size={14} className={`shrink-0 ${r.available ? "text-blue-500" : "text-zinc-400"}`} weight="duotone" />
                      <div className="flex-1">
                        <p className={`text-[11px] font-bold ${tp}`}>{r.name} <span className={`font-normal ${ts}`}>({r.role})</span></p>
                        <p className={`text-[10px] ${ts}`}>{r.reason}</p>
                      </div>
                      {r.available && <button className="text-[10px] font-bold text-blue-500 px-2 py-1 rounded-lg bg-blue-500/10">+ إضافة</button>}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { key: "tasks" as CaseTab, label: "المهام", icon: ListChecks, count: TASKS.length },
          { key: "docs" as CaseTab, label: "المستندات", icon: FileText, count: 8 },
          { key: "sessions" as CaseTab, label: "الجلسات", icon: CalendarCheck, count: 4 },
          { key: "chat" as CaseTab, label: "الدردشة", icon: ChatCircle },
          { key: "timeline" as CaseTab, label: "التايملاين", icon: Clock },
          { key: "canvas" as CaseTab, label: "خريطة القضية", icon: Graph },
        ].map(t => (
          <button key={t.key} onClick={() => setCaseTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap ${
              caseTab === t.key ? "bg-royal/10 text-royal dark:bg-royal/20 dark:text-[#C8A762]" : `${ts} hover:bg-white/[0.04]`
            }`}>
            <t.icon size={14} weight={caseTab === t.key ? "fill" : "regular"} />
            {t.label}
            {t.count && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${caseTab === t.key ? "bg-royal/20" : isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {caseTab === "tasks" && (
          <motion.div key="tasks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
            {TASKS.map((task, i) => {
              const st = statusConfig[task.status];
              return (
                <motion.div key={task.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className={`${card} p-4 shadow-sm flex items-center gap-3`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${task.status === "done" ? "bg-emerald-500" : task.status === "wip" ? "bg-blue-500/20" : isDark ? "bg-white/[0.04]" : "bg-zinc-100"}`}>
                    {task.status === "done" ? <Check size={12} weight="bold" className="text-white" /> : task.status === "wip" ? <Lightning size={12} className="text-blue-500" weight="fill" /> : <div className="w-2 h-2 rounded-full bg-zinc-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold ${task.status === "done" ? "line-through opacity-50" : ""} ${tp}`}>{task.title}</p>
                    <p className={`text-[10px] ${ts}`}>{task.assignee} — حتى {task.dueDate}</p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                </motion.div>
              );
            })}
            <button className={`w-full py-3 rounded-xl border-2 border-dashed text-[12px] font-semibold flex items-center justify-center gap-1.5 ${isDark ? "border-white/[0.06] text-zinc-500" : "border-zinc-200 text-zinc-400"} hover:border-royal/30 hover:text-royal`}>
              <Plus size={14} /> إضافة مهمة جديدة
            </button>
          </motion.div>
        )}

        {caseTab === "timeline" && (
          <motion.div key="timeline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-0">
            {TIMELINE_EVENTS.map((ev, i) => {
              const typeIcons: Record<string, typeof Clock> = { task: ListChecks, doc: FileText, review: Eye, hearing: Scales, ai: Robot };
              const typeColors: Record<string, string> = { task: "text-emerald-500", doc: "text-blue-500", review: "text-amber-500", hearing: "text-purple-500", ai: "text-[#C8A762]" };
              const Icon = typeIcons[ev.type] || Clock;
              const color = typeColors[ev.type] || ts;
              return (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-zinc-50"}`}>
                      <Icon size={14} weight="duotone" className={color} />
                    </div>
                    {i < TIMELINE_EVENTS.length - 1 && <div className={`w-px flex-1 my-1 ${isDark ? "bg-white/[0.06]" : "bg-zinc-200"}`} />}
                  </div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }} className="flex-1 pb-4">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[11px] font-bold ${tp}`}>{ev.user}</span>
                      <span className={`text-[9px] font-mono ${ts}`}>{ev.date} — {ev.time}</span>
                    </div>
                    <p className={`text-[11px] ${ts}`}>{ev.action}</p>
                  </motion.div>
                </div>
              );
            })}
          </motion.div>
        )}

        {(caseTab === "docs" || caseTab === "sessions" || caseTab === "chat") && (
          <motion.div key={caseTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-10 shadow-sm text-center`}>
            <p className={`text-[14px] font-bold ${tp} mb-2`}>{caseTab === "docs" ? "📄 مستندات القضية" : caseTab === "sessions" ? "📅 جلسات المحكمة" : "💬 دردشة الفريق"}</p>
            <p className={`text-[12px] ${ts}`}>يتم تعبئة هذا القسم عند ربط الباك إند</p>
          </motion.div>
        )}

        
        {caseTab === "canvas" && (
          <motion.div key="canvas" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <LegalCanvas />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hours breakdown */}
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${ts}`}>⏱️ توزيع الساعات على الفريق</p>
        <div className="space-y-2">
          {TEAM_MEMBERS.map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={`w-24 text-[11px] font-medium truncate ${tp}`}>{m.name.split(" ").slice(0, 2).join(" ")}</span>
              <div className={`flex-1 h-4 rounded-lg overflow-hidden ${isDark ? "bg-white/[0.04]" : "bg-zinc-100"}`}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${(m.hours / CASE_INFO.totalHours) * 100}%` }}
                  transition={{ duration: 0.8, delay: i * 0.1 }}
                  className={`h-full rounded-lg ${m.role === "lead" ? "bg-royal" : m.role === "associate" ? "bg-blue-500" : m.role === "trainee" ? "bg-amber-500" : "bg-zinc-400"}`} />
              </div>
              <span className={`w-10 text-end text-[11px] font-bold font-mono ${tp}`}>{m.hours}h</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
