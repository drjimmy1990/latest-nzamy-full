"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowRight, Handshake, CheckSquare, FolderOpen,
  ChatDots, Graph, Clock, CheckCircle, Plus,
  FileText, UploadSimple, PaperPlaneTilt, FilePdf,
  Scales, DotsThree, Circle, Download, Eye,
  SealCheck, UsersThree,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const CaseGraphView = dynamic(
  () => import("@/app/dashboard/business/kanban/CaseGraphView"),
  { ssr: false, loading: () => <div className="h-96 flex items-center justify-center text-sm opacity-40">جاري تحميل الجراف...</div> }
);

// ─── Types ────────────────────────────────────────────────────────────────────
type TaskStatus = "todo" | "inprogress" | "done";

interface WTask { id: string; title: string; assignee: "me" | "partner"; status: TaskStatus; due: string; }
interface WDoc  { id: string; name: string; uploadedBy: "me" | "partner"; date: string; }
interface WMsg  { id: string; from: "me" | "partner"; text: string; time: string; }

// ─── Mock ─────────────────────────────────────────────────────────────────────
const WS = {
  id: "col-1", caseTitle: "نزاع تجاري — مطالبة بعقد توريد", caseType: "تجاري",
  myName: "أ. محمد العتيبي", myRole: "محامي الاستئناف",
  partnerName: "أ. سعد الحربي", partnerRole: "محامي الدرجة الأولى",
  mySplit: 40, totalFee: 15000, startDate: "مارس ٢٠٢٦",
};

const INIT_TASKS: WTask[] = [
  { id: "t1", title: "مراجعة لائحة الاستئناف",  assignee: "me",      status: "inprogress", due: "الأحد"    },
  { id: "t2", title: "إعداد حافظة المستندات",   assignee: "me",      status: "todo",       due: "الاثنين"  },
  { id: "t3", title: "تحليل الحكم الابتدائي",   assignee: "partner", status: "done",       due: "أمس"      },
  { id: "t4", title: "تحضير شهادة الشاهد",      assignee: "partner", status: "inprogress", due: "الثلاثاء" },
];

const INIT_DOCS: WDoc[] = [
  { id: "d1", name: "لائحة الاستئناف (مسودة).pdf", uploadedBy: "me",      date: "اليوم"   },
  { id: "d2", name: "حكم المحكمة الابتدائية.pdf",  uploadedBy: "partner", date: "أمس"     },
  { id: "d3", name: "عقد التوريد الأصلي.pdf",       uploadedBy: "partner", date: "الاثنين" },
];

const INIT_MSGS: WMsg[] = [
  { id: "m1", from: "partner", text: "السلام عليكم — حملت الحكم الابتدائي، راجعه وخبرني رأيك.", time: "أمس ١٠:٣٠ص" },
  { id: "m2", from: "me",      text: "شكراً — سأراجعه اليوم وأرد بملاحظاتي.",                 time: "أمس ١١:٠٠ص" },
];

const TASK_CFG: Record<TaskStatus, { label: string; dot: string; color: string; col: string }> = {
  todo:       { label: "لم تبدأ",    dot: "bg-slate-400",   color: "text-slate-400",   col: "border-slate-300/40" },
  inprogress: { label: "جارٍ",       dot: "bg-amber-500 animate-pulse",  color: "text-amber-500",   col: "border-amber-400/40" },
  done:       { label: "مكتمل",      dot: "bg-emerald-500", color: "text-emerald-500", col: "border-emerald-400/40" },
};

const TABS = [
  { id: "tasks",    label: "المهام",     icon: CheckSquare },
  { id: "docs",     label: "المستندات",  icon: FolderOpen  },
  { id: "notes",    label: "الملاحظات",  icon: ChatDots    },
  { id: "graph",    label: "الجراف",     icon: Graph       },
  { id: "chat",     label: "المراسلة",   icon: PaperPlaneTilt },
];

// ─── Graph nodes built from workspace data ────────────────────────────────────
function buildGraphNodes() {
  const n: any[] = [];
  const e: any[] = [];
  n.push({ id: "g_me",      type: "person", title: WS.myName,      desc: WS.myRole,      pos: { x: 80,  y: 200 }, author: { name: "أنا",    role: "محامي", color: "bg-[#0B3D2E]" } });
  n.push({ id: "g_case",    type: "event",  title: WS.caseTitle,   desc: WS.caseType,    pos: { x: 420, y: 200 }, author: { name: "نظامي", role: "AI",    color: "bg-[#C8A762]" } });
  n.push({ id: "g_partner", type: "person", title: WS.partnerName, desc: WS.partnerRole, pos: { x: 760, y: 200 }, author: { name: "شريك",  role: "محامي", color: "bg-amber-600"  } });
  e.push({ id: "e1", from: "g_me",   to: "g_case",    type: "support", label: "محامي استئناف" });
  e.push({ id: "e2", from: "g_partner", to: "g_case", type: "support", label: "محامي درجة أولى" });
  INIT_DOCS.forEach((d, i) => {
    n.push({ id: `g_doc_${i}`, type: "doc", title: d.name, desc: d.date, pos: { x: 200 + i * 260, y: 420 }, author: { name: "ملف", role: "مستند", color: "bg-slate-500" } });
    e.push({ id: `e_doc_${i}`, from: "g_case", to: `g_doc_${i}`, type: "neutral", label: "مرفق" });
  });
  return { nodes: n, edges: e };
}
const GRAPH_DATA = buildGraphNodes();

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const { isDark } = useTheme();
  const [tab, setTab]       = useState("tasks");
  const [tasks, setTasks]   = useState(INIT_TASKS);
  const [msgs, setMsgs]     = useState(INIT_MSGS);
  const [msgInput, setMsgInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [notes, setNotes]   = useState<{ text: string; time: string }[]>([]);

  const myFee    = Math.round((WS.totalFee * WS.mySplit) / 100);
  const doneCnt  = tasks.filter(t => t.status === "done").length;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const toggleTask = (id: string) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t));

  const sendMsg = () => {
    if (!msgInput.trim()) return;
    setMsgs(prev => [...prev, { id: `m${Date.now()}`, from: "me", text: msgInput.trim(), time: "الآن" }]);
    setMsgInput("");
  };

  const addNote = () => {
    if (!noteInput.trim()) return;
    setNotes(prev => [...prev, { text: noteInput.trim(), time: "الآن" }]);
    setNoteInput("");
  };

  return (
    <div className={`max-w-[1100px] mx-auto space-y-5 p-4 md:p-6`} dir="rtl">

      {/* Breadcrumb */}
      <Link href="/dashboard/lawyer/marketplace"
        className={`inline-flex items-center gap-1.5 text-[13px] ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"} transition-colors`}>
        <ArrowRight size={13} /> السوق
      </Link>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5`}>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Scales size={16} className="text-[#0B3D2E]" weight="duotone" />
              <h1 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{WS.caseTitle}</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-[#0B3D2E]/20 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>{WS.caseType}</span>
            </div>
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              بدأ: {WS.startDate} · {doneCnt}/{tasks.length} مهام منجزة
            </p>
          </div>

          {/* Partners strip */}
          <div className={`flex items-center gap-4 p-3 rounded-xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-zinc-100 bg-zinc-50"}`}>
            <div className="text-center">
              <div className="w-9 h-9 rounded-xl bg-[#0B3D2E] flex items-center justify-center mx-auto mb-1">
                <span className="text-white text-[11px] font-bold">أنا</span>
              </div>
              <p className={`text-[10px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{WS.myName}</p>
              <p className="text-[10px] font-bold text-emerald-500">{myFee.toLocaleString()} ر.س</p>
            </div>
            <Handshake size={20} className="text-[#C8A762]" weight="duotone" />
            <div className="text-center">
              <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center mx-auto mb-1">
                <span className="text-white text-[11px] font-bold">س.ح</span>
              </div>
              <p className={`text-[10px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{WS.partnerName}</p>
              <p className={`text-[10px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{(WS.totalFee - myFee).toLocaleString()} ر.س</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-2xl overflow-x-auto ${isDark ? "bg-zinc-900/60 border border-white/[0.06]" : "bg-slate-100/80"}`}>
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all whitespace-nowrap flex-shrink-0 min-w-[72px] ${
                tab === t.id
                  ? isDark ? "bg-white/[0.08] text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                  : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-500 hover:text-slate-700"
              }`}>
              <Icon size={13} weight={tab === t.id ? "duotone" : "regular"} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>

          {/* ── TASKS (Kanban) ── */}
          {tab === "tasks" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["todo", "inprogress", "done"] as TaskStatus[]).map(col => {
                const colTasks = tasks.filter(t => t.status === col);
                const cfg = TASK_CFG[col];
                return (
                  <div key={col}>
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{cfg.label}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{colTasks.length}</span>
                    </div>
                    <div className="space-y-2.5 min-h-[80px]">
                      {colTasks.length === 0 && (
                        <div className={`${card} p-5 flex flex-col items-center justify-center opacity-30`}>
                          <Circle size={18} className={isDark ? "text-zinc-700" : "text-slate-300"} />
                        </div>
                      )}
                      {colTasks.map((task, i) => (
                        <motion.div key={task.id}
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                          className={`${card} p-3.5 cursor-pointer hover:border-[#0B3D2E]/20 transition-all`}
                          onClick={() => toggleTask(task.id)}>
                          <div className="flex items-start gap-2.5 mb-2">
                            <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              task.status === "done" ? "bg-emerald-500 border-emerald-500" : isDark ? "border-zinc-600" : "border-zinc-300"
                            }`}>
                              {task.status === "done" && <CheckCircle size={10} weight="fill" className="text-white" />}
                            </div>
                            <p className={`text-[13px] font-semibold leading-snug flex-1 ${task.status === "done" ? "line-through opacity-50" : ""} ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                              {task.title}
                            </p>
                          </div>
                          <div className={`flex items-center justify-between text-[10px] mt-2 pt-2 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                            <span className={`flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                              <UsersThree size={10} />
                              {task.assignee === "me" ? "مُسنَد إليّ" : WS.partnerName}
                            </span>
                            <span className={`flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                              <Clock size={10} /> {task.due}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── DOCS ── */}
          {tab === "docs" && (
            <div className={`${card} divide-y ${isDark ? "divide-white/[0.04]" : "divide-zinc-50"}`}>
              {INIT_DOCS.map(doc => (
                <div key={doc.id} className="flex items-center gap-4 px-5 py-3.5 group">
                  <FilePdf size={20} weight="duotone" className="text-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-medium truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{doc.name}</p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      {doc.uploadedBy === "me" ? "رُفع بواسطتي" : `رُفع بواسطة ${WS.partnerName}`} · {doc.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.uploadedBy === "me" && <SealCheck size={14} weight="fill" className="text-[#C8A762]" />}
                    <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Eye size={14} /></button>
                    <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Download size={14} /></button>
                  </div>
                </div>
              ))}
              <label className={`px-5 py-4 flex items-center gap-3 cursor-pointer ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50"} transition-colors`}>
                <UploadSimple size={18} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                <span className={`text-[12px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>رفع مستند جديد</span>
                <input type="file" className="hidden" />
              </label>
            </div>
          )}

          {/* ── NOTES ── */}
          {tab === "notes" && (
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
                  <button onClick={addNote} disabled={!noteInput.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors disabled:opacity-40">
                    حفظ الملاحظة
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {notes.map((n, i) => (
                  <div key={i} className={`${card} p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-[#0B3D2E]">أنا</span>
                        </div>
                        <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{WS.myName}</p>
                      </div>
                      <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{n.time}</p>
                    </div>
                    <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{n.text}</p>
                  </div>
                ))}
                {notes.length === 0 && (
                  <div className={`${card} p-10 text-center opacity-40`}>
                    <ChatDots size={32} className="mx-auto mb-2" />
                    <p className="text-sm">لا توجد ملاحظات بعد</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── GRAPH ── */}
          {tab === "graph" && (
            <div className={`${card} overflow-hidden`} style={{ height: "560px" }}>
              <div className={`p-3 border-b flex items-center gap-2 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <Graph size={14} weight="duotone" className="text-[#0B3D2E]" />
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  جراف القضية المشتركة — {WS.caseTitle}
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full mr-auto ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#C8A762]/10 text-[#0B3D2E]"}`}>
                  نظامي AI
                </span>
              </div>
              <div className="h-[calc(100%-48px)]">
                <CaseGraphView
                  isDark={isDark}
                  isGlobal={false}
                  initialNodes={GRAPH_DATA.nodes}
                  initialEdges={GRAPH_DATA.edges}
                />
              </div>
            </div>
          )}

          {/* ── CHAT ── */}
          {tab === "chat" && (
            <div className={`${card} flex flex-col`} style={{ height: "480px" }}>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {msgs.map(msg => (
                  <div key={msg.id} className={`flex ${msg.from === "me" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      msg.from === "me"
                        ? "bg-[#0B3D2E] text-white"
                        : isDark ? "bg-white/[0.06] text-zinc-200" : "bg-zinc-100 text-zinc-700"
                    }`}>
                      <p className="text-[13px] leading-relaxed">{msg.text}</p>
                      <p className={`text-[9px] mt-1 ${msg.from === "me" ? "text-white/50" : isDark ? "text-zinc-600" : "text-zinc-400"}`}>{msg.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className={`flex items-center gap-3 px-5 py-4 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                <input
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMsg()}
                  placeholder="اكتب رسالتك..."
                  className={`flex-1 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-700 placeholder:text-zinc-400"}`}
                />
                <button onClick={sendMsg} disabled={!msgInput.trim()}
                  className="h-9 w-9 rounded-xl bg-[#0B3D2E] flex items-center justify-center text-[#C8A762] disabled:opacity-30 hover:bg-[#155e41] transition-colors">
                  <PaperPlaneTilt size={16} weight="fill" />
                </button>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
