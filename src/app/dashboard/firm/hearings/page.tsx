"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarCheck, Clock, ArrowUpRight, MapPin, Gavel,
  User, Bell, Plus, CaretLeft, CheckCircle, XCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

// ─── Modals ───────────────────────────────────────────────────────────────────

function AddHearingModal({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  const [done, setDone] = useState(false);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}>
        
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>إضافة جلسة جديدة</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تم جدولة الجلسة بنجاح!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>تم ربط الجلسة بملف القضية وإرسال تذكير للمحامي.</p>
            <button onClick={onClose} className="rounded-xl px-5 py-2 text-[13px] font-bold bg-[#0B3D2E] text-white">إغلاق</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>القضية المرتبطة</label>
              <select className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}>
                <option>نزاع تجاري — شركة الأفق</option>
                <option>استئناف العقار ٢١٣</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>التاريخ</label>
                <input type="date" className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
              </div>
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الوقت</label>
                <input type="time" className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
              </div>
            </div>
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>نوع الجلسة ومكانها</label>
              <input type="text" placeholder="مثال: مرافعة - المحكمة التجارية قاعة ٣" className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
            </div>
            <button onClick={() => setDone(true)} className="w-full rounded-xl bg-[#0B3D2E] py-2.5 text-[13px] font-bold text-[#C8A762] mt-2">جدولة الجلسة</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

interface Hearing {
  id: string;
  caseTitle: string;
  court: string;
  room?: string;
  date: string;
  time: string;
  assignee: string;
  status: "upcoming" | "today" | "completed";
  type: string;
}

const MOCK_HEARINGS: Hearing[] = [
  { id: "1", caseTitle: "نزاع تجاري — شركة الأفق",        court: "المحكمة التجارية",  room: "قاعة ٣", date: "اليوم",    time: "١٠:٠٠ ص", assignee: "أ. سارة المنصور", status: "today",     type: "جلسة مرافعة" },
  { id: "2", caseTitle: "فسخ عقد إيجار",                   court: "المحكمة العامة",    room: "قاعة ٧", date: "اليوم",    time: "٢:٣٠ م",  assignee: "أ. تركي العمر",   status: "today",     type: "جلسة للاستماع" },
  { id: "3", caseTitle: "استئناف العقار ٢١٣",               court: "محكمة الاستئناف",              date: "غداً",     time: "٩:٠٠ ص",  assignee: "أ. سارة المنصور", status: "upcoming",  type: "جلسة استماع" },
  { id: "4", caseTitle: "قضية عمالية — فصل تعسفي ٤٥٦٧",   court: "المحكمة العمالية",              date: "٢٨ أبريل", time: "١١:٠٠ ص", assignee: "أ. نورة الشمري",  status: "upcoming",  type: "إعداد صلح" },
  { id: "5", caseTitle: "نزاع ملكية فكرية",                 court: "المحكمة التجارية",              date: "١٠ مايو",  time: "١٠:٣٠ ص", assignee: "أ. نورة الشمري",  status: "upcoming",  type: "جلسة أولى" },
  { id: "6", caseTitle: "عقد بناء — الذهبي",               court: "المحكمة التجارية",              date: "١٥ مايو",  time: "٩:٣٠ ص",  assignee: "أ. خالد الحربي",  status: "upcoming",  type: "تقديم لائحة" },
];

const STATUS_STYLE: Record<Hearing["status"], { label: string; color: string; dot: string }> = {
  today:     { label: "اليوم",   color: "text-red-500 bg-red-500/10 border-red-500/20",       dot: "bg-red-400 animate-pulse" },
  upcoming:  { label: "قادمة",  color: "text-royal bg-royal/10 border-royal/20",              dot: "bg-royal" },
  completed: { label: "مكتملة", color: "text-slate-400 bg-slate-100 border-slate-200",        dot: "bg-slate-300" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FirmHearingsPage() {
  const { isDark } = useTheme();
  const [showAddHearing, setShowAddHearing] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const todayHearings    = MOCK_HEARINGS.filter(h => h.status === "today");
  const upcomingHearings = MOCK_HEARINGS.filter(h => h.status === "upcoming");

  return (
    <div className="max-w-[1000px] mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            الجلسات
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {todayHearings.length} جلسة اليوم · {upcomingHearings.length} قادمة
          </p>
        </div>
        <div className="flex gap-2">
          <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <Bell size={15} />
            تذكيرات
          </button>
          <button onClick={() => setShowAddHearing(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />
            جلسة جديدة
          </button>
        </div>
      </motion.div>

      {/* Today's hearings */}
      {todayHearings.length > 0 && (
        <div>
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            جلسات اليوم
          </p>
          <div className="space-y-2">
            {todayHearings.map((h, i) => (
              <motion.div key={h.id}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                <Link href={`/dashboard/firm/cases/${h.id}`}
                  className={`group ${card} p-5 flex items-center gap-4 hover:border-red-300/30 hover:scale-[1.005] transition-all block border-l-4 border-l-red-400`}>
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center bg-red-500/10`}>
                      <Gavel size={18} weight="duotone" className="text-red-500 mb-0.5" />
                      <span className="text-[10px] font-bold text-red-500">{h.time}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{h.caseTitle}</p>
                      <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE.today.color}`}>
                        {h.type}
                      </span>
                    </div>
                    <div className={`flex items-center gap-3 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      <span className="flex items-center gap-1"><MapPin size={11} />{h.court}{h.room ? ` — ${h.room}` : ""}</span>
                      <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                      <span className="flex items-center gap-1"><User size={11} />{h.assignee}</span>
                    </div>
                  </div>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isDark ? "text-zinc-700 group-hover:bg-white/[0.06] group-hover:text-zinc-300" : "text-slate-200 group-hover:bg-royal group-hover:text-white"}`}>
                    <CaretLeft size={15} />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming hearings */}
      <div>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          الجلسات القادمة
        </p>
        <div className="space-y-2">
          {upcomingHearings.map((h, i) => (
            <motion.div key={h.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
              <Link href={`/dashboard/firm/cases/${h.id}`}
                className={`group ${card} p-4 flex items-center gap-4 hover:border-royal/20 transition-all block`}>
                <div className={`flex-shrink-0 w-11 h-11 rounded-2xl flex flex-col items-center justify-center ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                  <CalendarCheck size={16} weight="duotone" className="text-royal mb-0.5" />
                  <span className={`text-[9px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{h.date}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold truncate mb-0.5 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{h.caseTitle}</p>
                  <div className={`flex items-center gap-3 text-[11px] flex-wrap ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    <span className="flex items-center gap-1"><Clock size={10} />{h.time}</span>
                    <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                    <span className="flex items-center gap-1"><MapPin size={10} />{h.court}</span>
                    <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                    <span className="flex items-center gap-1"><User size={10} />{h.assignee}</span>
                  </div>
                </div>
                <div className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-lg ${isDark ? "bg-white/[0.04] text-zinc-400" : "bg-slate-50 text-slate-500"}`}>
                  {h.type}
                </div>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isDark ? "text-zinc-700 group-hover:bg-white/[0.06] group-hover:text-zinc-300" : "text-slate-200 group-hover:bg-royal group-hover:text-white"}`}>
                  <CaretLeft size={15} />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Month summary */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className={`${card} p-5`}>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-4 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          ملخص أبريل
        </p>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "إجمالي الجلسات", value: "١٤", color: "text-royal",        bg: "bg-royal/8" },
            { label: "تم انجازها",      value: "٦",  color: "text-emerald-500",  bg: "bg-emerald-500/8" },
            { label: "قادمة",           value: "٨",  color: "text-amber-500",    bg: "bg-amber-500/8" },
          ].map((s, i) => (
            <div key={i} className={`p-3 rounded-xl ${s.bg} text-center`}>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <AnimatePresence>
        {showAddHearing && <AddHearingModal onClose={() => setShowAddHearing(false)} isDark={isDark} />}
      </AnimatePresence>
    </div>
  );
}
