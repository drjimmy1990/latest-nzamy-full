"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Archive, ArrowCounterClockwise, FileText, Gavel, MagnifyingGlass, UserCircle, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const ITEMS = [
  { kind: "قضية", title: "نزاع توريد مغلق", meta: "حكم نهائي · التقاضي", date: "2026-03-12", icon: Gavel },
  { kind: "عميل", title: "شركة الأفق للتجارة", meta: "غير نشط · 4 قضايا مغلقة", date: "2026-02-04", icon: UserCircle },
  { kind: "مستند", title: "مسودة عقد وكالة قديمة", meta: "نسخة 2 · العقود", date: "2026-01-21", icon: FileText },
];

export default function FirmArchivePage() {
  const { isDark } = useTheme();
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("الأرشيف الموحد Backend-ready: الاستعادة والحذف النهائي محليان فقط حتى ربط Archive API.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const filtered = ITEMS.filter((item) => !query || `${item.kind} ${item.title} ${item.meta}`.includes(query));

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-300">
          <Archive size={13} weight="duotone" />
          Backend-ready
        </div>
        <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>الأرشيف الموحد للمكتب</h1>
        <p className={`mt-1 text-sm ${muted}`}>قضايا وعملاء ومستندات مؤرشفة في مكان واحد، بدون حذف إنتاجي الآن.</p>
      </div>

      <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>{toast}</span>
      </div>

      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-slate-200 bg-white"}`}>
        <MagnifyingGlass size={15} className={muted} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث في الأرشيف..." className={`w-full bg-transparent text-sm outline-none ${isDark ? "text-white placeholder:text-zinc-600" : "text-slate-800 placeholder:text-slate-400"}`} />
      </div>

      <div className="space-y-3">
        {filtered.map((item, index) => (
          <motion.div key={item.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className={`${card} p-4 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B3D2E]/15 text-[#C8A762]">
                <item.icon size={21} weight="duotone" />
              </span>
              <div>
                <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{item.title}</p>
                <p className={`mt-1 text-xs ${muted}`}>{item.kind} · {item.meta} · {item.date}</p>
              </div>
            </div>
            <button
              onClick={() => setToast(`استعادة ${item.title} جاهزة للربط فقط. يلزم Archive API وسجل before/after.`)}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              <ArrowCounterClockwise size={14} />
              استعادة محلية
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
