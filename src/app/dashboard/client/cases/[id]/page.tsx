"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, CalendarCheck, CheckCircle, Clock,
  Warning, FileText, ChatDots, Phone, Sparkle,
  Scales, ClipboardText, FolderOpen, CaretDown,
  MapPin, Receipt, Users, ListChecks, Eye, Lock,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

type CaseStage = "filed" | "pending" | "session" | "judgment" | "closed";

interface TimelineEvent {
  date: string; title: string; desc?: string;
  type: "session" | "document" | "update" | "milestone" | "message";
  done: boolean;
}

interface CaseData {
  id: string; title: string; caseNo: string; court: string;
  stage: CaseStage; progress: number; urgent: boolean;
  lawyer: { name: string; type: string; phone: string; rating: number };
  nextSession?: { date: string; time: string; location: string };
  fee: { total: number; paid: number };
  timeline: TimelineEvent[];
  documents: { name: string; date: string; type: string }[];
  aiInsight?: string;
  // ─── Cross-Role: ما سمح به المحامي للعميل ───────────────────────────────
  sharedTasks?: { title: string; status: "todo" | "doing" | "done"; visibleToClient: true }[];
  team?: { name: string; role: string; initials: string }[];
  lawyerNoteForClient?: string;
}

const MOCK_CASES: Record<string, CaseData> = {
  "2025-001": {
    id: "2025-001", title: "قضية فصل تعسفي", caseNo: "٢٠٢٥-٠٠١",
    court: "المحكمة العمالية — الرياض", stage: "session", progress: 60, urgent: true,
    lawyer: { name: "أحمد الغامدي", type: "محامي عمالي", phone: "+966501234567", rating: 4.8 },
    nextSession: { date: "١٥ أبريل ٢٠٢٦", time: "١٠:٠٠ ص", location: "قاعة ٣أ" },
    fee: { total: 8000, paid: 5000 },
    aiInsight: "استناداً لنظام العمل المادة ٧٤، فصل العامل بدون سبب مشروع يُوجب التعويض بمقدار أجر شهر عن كل سنة خدمة. بناءً على ٦ سنوات، يُتوقع التعويض بين ٤٠،٠٠٠–٦٠،٠٠٠ ريال.",
    timeline: [
      { date: "١ مارس ٢٠٢٦",  title: "تقديم صحيفة الدعوى",             type: "milestone", done: true, desc: "تم رفع الدعوى رسمياً أمام المحكمة العمالية" },
      { date: "١٠ مارس ٢٠٢٦", title: "تبليغ المدعى عليه",               type: "document",  done: true, desc: "استلم صاحب العمل إشعار المحكمة" },
      { date: "١٥ مارس ٢٠٢٦", title: "رفع مذكرة المطالبة التفصيلية",   type: "document",  done: true },
      { date: "١ أبريل ٢٠٢٦",  title: "جلسة الاستماع الأولى",            type: "session",   done: true, desc: "تمت — قرر القاضي تأجيل الجلسة لتقديم المستندات" },
      { date: "١٥ أبريل ٢٠٢٦", title: "جلسة التحقيق والمرافعة",          type: "session",   done: false, desc: "جلسة قادمة — يُرجى حضور العميل" },
      { date: "١ مايو ٢٠٢٦",   title: "صدور الحكم الابتدائي (متوقع)",    type: "milestone", done: false },
      { date: "—",              title: "استئناف (إن اقتضى)",              type: "update",    done: false },
      { date: "—",              title: "إغلاق القضية",                    type: "milestone", done: false },
    ],
    documents: [
      { name: "صحيفة الدعوى.pdf",       date: "١ مارس ٢٠٢٦",  type: "PDF"  },
      { name: "عقد العمل الأصلي.pdf",   date: "١ مارس ٢٠٢٦",  type: "PDF"  },
      { name: "مذكرة المطالبة.docx",    date: "١٥ مارس ٢٠٢٦", type: "Word" },
      { name: "محضر الجلسة الأولى.pdf", date: "١ أبريل ٢٠٢٦", type: "PDF"  },
    ],
    sharedTasks: [
      { title: "إعداد مذكرة الدفاع للجلسة القادمة",  status: "doing", visibleToClient: true },
      { title: "مراجعة عقد العمل الأصلي",            status: "done",  visibleToClient: true },
      { title: "التواصل مع خبير العمل",               status: "todo",  visibleToClient: true },
    ],
    team: [
      { name: "أحمد الغامدي",  role: "المحامي الرئيسي",  initials: "أ" },
      { name: "سلمى الشريف",  role: "مساعد قانوني",      initials: "س" },
    ],
    lawyerNoteForClient: "الجلسة القادمة بالغة الأهمية — يُرجى إحضار عقد العمل الأصلي وشهادات الخدمة. سنراجع المستندات قبل الجلسة بساعة.",
  },
  "2025-002": {
    id: "2025-002", title: "نزاع عقاري — أرض بحي النخيل", caseNo: "٢٠٢٥-٠٠٢",
    court: "المحكمة العامة — الرياض", stage: "pending", progress: 30, urgent: false,
    lawyer: { name: "سارة العتيبي", type: "محامية عقارية", phone: "+966509876543", rating: 4.6 },
    fee: { total: 12000, paid: 6000 },
    aiInsight: "نزاعات الملكية العقارية تستغرق عادةً ١٢–٢٤ شهراً. يُوصى بتجهيز صك الملكية الأصلي وخرائط المساحة.",
    timeline: [
      { date: "١٥ فبراير ٢٠٢٦", title: "تقديم الدعوى العقارية", type: "milestone", done: true },
      { date: "٢٠ فبراير ٢٠٢٦", title: "تبليغ الخصم",            type: "document",  done: true },
      { date: "—", title: "موعد الجلسة الأولى",   type: "session",   done: false, desc: "قيد الانتظار" },
      { date: "—", title: "تقرير المساح المعتمد",  type: "document",  done: false },
      { date: "—", title: "جلسة الحكم",            type: "milestone", done: false },
    ],
    documents: [
      { name: "صك الملكية.pdf",   date: "١٥ فبراير ٢٠٢٦", type: "PDF" },
      { name: "صحيفة الدعوى.pdf", date: "١٥ فبراير ٢٠٢٦", type: "PDF" },
    ],
  },
};

const STAGES: { key: CaseStage; label: string }[] = [
  { key: "filed",    label: "مرفوعة" },
  { key: "pending",  label: "قيد التداول" },
  { key: "session",  label: "جلسات" },
  { key: "judgment", label: "حكم" },
  { key: "closed",   label: "مغلقة" },
];

const EVENT_ICON: Record<TimelineEvent["type"], React.ElementType> = {
  session: CalendarCheck, document: FileText, update: ClipboardText,
  milestone: MapPin, message: ChatDots,
};
const EVENT_COLOR: Record<TimelineEvent["type"], string> = {
  session: "text-blue-500", document: "text-violet-500", update: "text-amber-500",
  milestone: "text-[#C8A762]", message: "text-emerald-500",
};

export default function ClientCaseDetailPage({ params }: { params: { id: string } }) {
  const { isDark } = useTheme();
  const data = MOCK_CASES[params.id] ?? MOCK_CASES["2025-001"];
  const [showDocs, setShowDocs] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const sm = isDark ? "text-zinc-500" : "text-slate-400";

  const stageIdx = STAGES.findIndex(s => s.key === data.stage);
  const paidPct  = Math.round((data.fee.paid / data.fee.total) * 100);

  return (
    <div className="max-w-3xl mx-auto space-y-4" dir="rtl">

      {/* Back */}
      <Link href="/dashboard/client/cases"
        className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${sm} hover:text-[#0B3D2E] transition-colors`}>
        <ArrowRight size={13} /> قضاياي
      </Link>

      {/* Header card */}
      <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className={`${card} overflow-hidden`}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              {data.urgent && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full mb-2">
                  <Warning size={9} weight="fill" /> عاجل
                </span>
              )}
              <h1 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>{data.title}</h1>
              <p className={`text-[11px] ${sm}`}>{data.court} · رقم القضية: {data.caseNo}</p>
            </div>
            <div className={`flex-shrink-0 rounded-xl border px-3 py-2 text-center ${isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-slate-100 bg-slate-50"}`}>
              <p className={`text-[10px] ${sm} mb-0.5`}>الأتعاب</p>
              <p className={`text-[16px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{data.fee.total.toLocaleString()}</p>
              <p className="text-[9px] text-emerald-500 font-bold">مدفوع: {data.fee.paid.toLocaleString()}</p>
            </div>
          </div>

          {/* Stage pipeline */}
          <div className="flex items-center gap-1 mb-2">
            {STAGES.map((s, i) => {
              const done = i < stageIdx;
              const current = i === stageIdx;
              return (
                <div key={s.key} className="flex items-center flex-1">
                  <div className={`flex-1 text-center text-[9px] font-bold py-1.5 rounded-lg transition-all ${
                    current
                      ? "bg-[#0B3D2E] text-white"
                      : done
                        ? isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                        : isDark ? "bg-white/[0.03] text-zinc-600" : "bg-slate-50 text-slate-400"
                  }`}>{done ? "✓ " : ""}{s.label}</div>
                  {i < STAGES.length - 1 && (
                    <div className={`w-3 h-px mx-0.5 ${done ? "bg-emerald-400/60" : isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className={`h-1.5 rounded-full overflow-hidden mb-1 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
            <motion.div className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-[#0B3D2E]"
              initial={{ width:0 }} animate={{ width: `${data.progress}%` }}
              transition={{ duration:0.9, ease:"easeOut", delay:0.2 }} />
          </div>
          <p className={`text-[9px] text-left ${sm}`}>{data.progress}% مكتمل</p>

          {/* Lawyer */}
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 mt-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#0B3D2E] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
                {data.lawyer.name.charAt(0)}
              </div>
              <div>
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{data.lawyer.name}</p>
                <p className={`text-[10px] flex items-center gap-1 ${sm}`}>
                  {data.lawyer.type} <span className="text-amber-500 font-bold">★ {data.lawyer.rating}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <a href={`tel:${data.lawyer.phone}`}
                className={`w-8 h-8 rounded-xl flex items-center justify-center border ${isDark ? "border-white/[0.06] text-zinc-400 hover:text-emerald-400" : "border-slate-200 text-slate-500 hover:text-emerald-600"} transition-colors`}>
                <Phone size={13} />
              </a>
              <Link href="/dashboard/client/messages"
                className={`w-8 h-8 rounded-xl flex items-center justify-center border ${isDark ? "border-white/[0.06] text-zinc-400 hover:text-blue-400" : "border-slate-200 text-slate-500 hover:text-blue-500"} transition-colors`}>
                <ChatDots size={13} />
              </Link>
            </div>
          </div>
        </div>

        {/* Next session banner */}
        {data.nextSession && (
          <div className={`px-5 py-3 border-t flex items-center gap-3 ${isDark ? "border-white/[0.06] bg-amber-500/5" : "border-amber-100 bg-amber-50/60"}`}>
            <CalendarCheck size={14} className="text-amber-500 flex-shrink-0" />
            <div className="flex-1">
              <p className={`text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>الجلسة القادمة</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/80"}`}>
                {data.nextSession.date} — {data.nextSession.time} · {data.nextSession.location}
              </p>
            </div>
            <span className="text-[9px] font-bold bg-amber-400/20 text-amber-600 dark:text-amber-300 px-2 py-0.5 rounded-full">تذكير مُفعّل</span>
          </div>
        )}
      </motion.div>

      {/* AI Insight */}
      {data.aiInsight && (
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
          className={`p-4 rounded-2xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkle size={13} weight="fill" className="text-[#C8A762]" />
            <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>تحليل نظامي AI</p>
          </div>
          <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-amber-800"}`}>{data.aiInsight}</p>
        </motion.div>
      )}

      {/* Timeline */}
      <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.08 }}
        className={`${card} p-4`}>
        <div className="flex items-center gap-2 mb-4">
          <Scales size={14} className="text-[#0B3D2E]" />
          <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>مسار القضية</h2>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isDark ? "bg-white/[0.05] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
            {data.timeline.filter(e => e.done).length}/{data.timeline.length} مراحل
          </span>
        </div>

        <div className="relative">
          <div className={`absolute start-[18px] top-3 bottom-3 w-px ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} />
          <div className="space-y-1">
            {data.timeline.map((ev, i) => {
              const EvIcon = EVENT_ICON[ev.type];
              const evColor = EVENT_COLOR[ev.type];
              return (
                <motion.div key={i}
                  initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }} transition={{ delay: i * 0.04 }}
                  className={`flex items-start gap-3 py-2 px-2 rounded-xl ${ev.done ? "" : "opacity-45"}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10 border ${
                    ev.done
                      ? isDark ? "bg-emerald-500/15 border-emerald-500/30" : "bg-emerald-50 border-emerald-200"
                      : isDark ? "bg-zinc-800 border-white/[0.06]" : "bg-slate-50 border-slate-200"
                  }`}>
                    {ev.done
                      ? <CheckCircle size={16} weight="fill" className="text-emerald-500" />
                      : <EvIcon size={14} className={evColor} />}
                  </div>
                  <div className="flex-1 pt-1.5">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{ev.title}</p>
                      {ev.date !== "—" && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.04] text-zinc-600" : "bg-slate-100 text-slate-500"}`}>{ev.date}</span>
                      )}
                    </div>
                    {ev.desc && <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-600" : "text-slate-500"}`}>{ev.desc}</p>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ─── Cross-Role: ما شاركه المحامي مع العميل ─── */}
      {(data.sharedTasks?.length || data.team?.length || data.lawyerNoteForClient) && (
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.09 }}
          className={`${card} p-4 space-y-4`}>

          {/* Header */}
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-[#0B3D2E]" />
            <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>ما شاركه معك محاميك</h2>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
              مرئي لك فقط
            </span>
          </div>

          {/* Lawyer note for client */}
          {data.lawyerNoteForClient && (
            <div className={`rounded-xl p-3 border-r-2 border-[#0B3D2E] ${
              isDark ? "bg-[#0B3D2E]/10" : "bg-emerald-50"
            }`}>
              <p className={`text-[10px] font-bold mb-1 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>رسالة من محاميك</p>
              <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{data.lawyerNoteForClient}</p>
            </div>
          )}

          {/* Shared tasks */}
          {data.sharedTasks && data.sharedTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ListChecks size={12} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المهام الجارية على قضيتك</p>
              </div>
              <div className="space-y-1.5">
                {data.sharedTasks.map((task, i) => (
                  <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${
                    isDark ? "bg-white/[0.03]" : "bg-slate-50"
                  }`}>
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 text-[8px] font-black ${
                      task.status === "done"  ? "bg-emerald-500/15 text-emerald-500" :
                      task.status === "doing" ? "bg-blue-500/15 text-blue-500" :
                                                isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-200 text-slate-400"
                    }`}>
                      {task.status === "done" ? "✓" : task.status === "doing" ? "●" : "○"}
                    </div>
                    <p className={`text-[12px] flex-1 ${
                      task.status === "done"
                        ? isDark ? "text-zinc-600 line-through" : "text-slate-400 line-through"
                        : isDark ? "text-zinc-300" : "text-slate-700"
                    }`}>{task.title}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      task.status === "done"  ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600" :
                      task.status === "doing" ? isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600" :
                                                isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-100 text-slate-500"
                    }`}>
                      {task.status === "done" ? "منجز" : task.status === "doing" ? "جارٍ" : "قادم"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team */}
          {data.team && data.team.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users size={12} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الفريق العامل على قضيتك</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.team.map((m, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                    isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"
                  }`}>
                    <div className="w-6 h-6 rounded-full bg-[#0B3D2E] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                      {m.initials}
                    </div>
                    <div>
                      <p className={`text-[11px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{m.name}</p>
                      <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy notice */}
          <div className={`flex items-center gap-1.5 text-[9px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
            <Lock size={9} />
            <span>يتحكم محاميك في ما تراه — بعض التفاصيل محجوبة للحفاظ على سرية العمل القانوني</span>
          </div>
        </motion.div>
      )}

      {/* Documents collapsible */}
      <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.10 }} className={card}>
        <button onClick={() => setShowDocs(v => !v)}
          className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"} rounded-2xl`}>
          <div className="flex items-center gap-2">
            <FolderOpen size={14} className="text-blue-500" />
            <span className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>المستندات</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"}`}>{data.documents.length}</span>
          </div>
          <motion.span animate={{ rotate: showDocs ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <CaretDown size={12} className={sm} />
          </motion.span>
        </button>
        <AnimatePresence>
          {showDocs && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }} className="overflow-hidden">
              <div className={`border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"} p-3 space-y-1`}>
                {data.documents.map((doc, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.03]" : "hover:bg-slate-50"}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black flex-shrink-0 ${doc.type === "PDF" ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"}`}>{doc.type}</div>
                    <div className="flex-1">
                      <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{doc.name}</p>
                      <p className={`text-[10px] ${sm}`}>{doc.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Fee */}
      <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.12 }} className={`${card} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Receipt size={14} className="text-emerald-500" />
          <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الأتعاب والمدفوعات</h2>
        </div>
        <div className={`flex justify-between text-[12px] mb-2 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
          <span>إجمالي الأتعاب</span>
          <span className="font-black font-mono">{data.fee.total.toLocaleString()} ريال</span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden mb-1 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
          <motion.div className="h-full rounded-full bg-emerald-500"
            initial={{ width:0 }} animate={{ width: `${paidPct}%` }}
            transition={{ duration:0.9, ease:"easeOut", delay:0.3 }} />
        </div>
        <div className={`flex justify-between text-[10px] ${sm}`}>
          <span>مدفوع: <strong className="text-emerald-500">{data.fee.paid.toLocaleString()}</strong></span>
          <span>متبقي: <strong className="text-amber-500">{(data.fee.total - data.fee.paid).toLocaleString()}</strong></span>
        </div>
      </motion.div>

    </div>
  );
}
