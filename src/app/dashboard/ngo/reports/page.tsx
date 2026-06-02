"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ClipboardText, FileText, DownloadSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

const REPORTS = [
  { id: "NGO-2026-Q1", title: "التقرير الربعي الأول 2026",           period: "يناير – مارس 2026",  type: "ربعي", status: "منشور" },
  { id: "NGO-2025-AN", title: "التقرير السنوي 2025 — المركز الوطني", period: "كامل العام 2025",      type: "سنوي", status: "منشور" },
  { id: "NGO-2026-Q2", title: "التقرير الربعي الثاني 2026",          period: "أبريل – يونيو 2026",  type: "ربعي", status: "مسودة" },
  { id: "NGO-FUND-26", title: "تقرير التبرعات — رمضان 1447هـ",       period: "مارس – أبريل 2026",   type: "خاص",  status: "قيد المراجعة" },
];

export default function NGOReportsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const bg   = isDark ? "bg-zinc-950" : "bg-slate-50";
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900/40 border-white/5" : "bg-white border-slate-200"}`;
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const div  = isDark ? "divide-white/5" : "divide-slate-100";

  const STATUS: Record<string, string> = {
    "منشور":        isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200",
    "مسودة":        isDark ? "bg-gray-500/10 text-gray-400 border-gray-500/20"          : "bg-gray-100 text-gray-500 border-gray-200",
    "قيد المراجعة": isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20"       : "bg-amber-50 text-amber-700 border-amber-200",
  };
  const TYPE: Record<string, string> = {
    "ربعي": isDark ? "bg-sky-500/10 text-sky-400 border-sky-500/20"       : "bg-sky-50 text-sky-700 border-sky-200",
    "سنوي": isDark ? "bg-violet-500/10 text-violet-400 border-violet-500/20" : "bg-violet-50 text-violet-700 border-violet-200",
    "خاص":  isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20"    : "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <div className={`${bg} min-h-[100dvh] pb-20`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-violet-500/10" : "bg-violet-50"}`}>
              <ClipboardText size={22} weight="duotone" className={isDark ? "text-violet-400" : "text-violet-600"} />
            </div>
            <div>
              <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>التقارير الدورية</h1>
              <p className={`text-xs ${muted}`}>{REPORTS.filter(r => r.status === "منشور").length} منشور · {REPORTS.filter(r => r.status === "مسودة").length} مسودة</p>
            </div>
          </div>
          <Link href="/ai/ngo/report-generator"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 text-violet-400" : "bg-violet-50 border border-violet-200 hover:bg-violet-100 text-violet-700"}`}>
            <FileText size={14} /> إعداد تقرير بالذكاء الاصطناعي
          </Link>
        </div>

        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`divide-y ${div}`}>
            {REPORTS.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.07 }}
                className={`px-5 py-4 flex items-center justify-between gap-4 transition ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50"}`}>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-sm truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{r.title}</div>
                  <div className={`text-xs mt-1 font-mono ${muted}`}>{r.id} · {r.period}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs border font-bold ${TYPE[r.type]}`}>{r.type}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs border font-bold ${STATUS[r.status]}`}>{r.status}</span>
                  <button className={`p-1.5 rounded-lg border transition ${isDark ? "border-white/10 bg-white/5 hover:bg-white/10 text-gray-400" : "border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500"}`}>
                    <DownloadSimple size={12} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
