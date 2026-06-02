"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Plus, Handshake } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

const CONTRACTS = [
  { id: "NC-001", title: "عقد تطوع — برنامج التعليم المجتمعي",    party: "ريم الحربي",             value: "—",       status: "ساري",   expire: "2026-12-31" },
  { id: "NC-002", title: "اتفاقية شراكة مع جمعية رعاية الأسرة",    party: "جمعية رعاية الأسرة",     value: "120,000", status: "ساري",   expire: "2026-06-30" },
  { id: "NC-003", title: "عقد خدمات — استضافة البوابة الإلكترونية", party: "شركة التقنية السحابية",  value: "48,000",  status: "منتهٍ",  expire: "2025-12-31" },
  { id: "NC-004", title: "عقد تطوع — برنامج الصحة النفسية",         party: "نورة القحطاني",          value: "—",       status: "معلق",   expire: "—" },
];

export default function NGOContractsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const bg   = isDark ? "bg-zinc-950" : "bg-slate-50";
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900/40 border-white/5" : "bg-white border-slate-200"}`;
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const div  = isDark ? "divide-white/5" : "divide-slate-100";
  const STATUS: Record<string, string> = {
    "ساري":  isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200",
    "منتهٍ": isDark ? "bg-gray-500/10 text-gray-400 border-gray-500/20"         : "bg-gray-100 text-gray-500 border-gray-200",
    "معلق":  isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20"      : "bg-amber-50 text-amber-700 border-amber-200",
  };

  return (
    <div className={`${bg} min-h-[100dvh] pb-20`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}>
              <FileText size={22} weight="duotone" className={isDark ? "text-blue-400" : "text-blue-600"} />
            </div>
            <div>
              <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>العقود والاتفاقيات</h1>
              <p className={`text-xs ${muted}`}>{CONTRACTS.filter(c => c.status === "ساري").length} عقد ساري</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/ai/ngo/volunteer-contract"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700"}`}>
              <Handshake size={14} /> صائغ عقد تطوع
            </Link>
            <button className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200" : "bg-gray-100 border border-gray-200 hover:bg-gray-200 text-gray-700"}`}>
              <Plus size={14} /> عقد جديد
            </button>
          </div>
        </div>

        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`divide-y ${div}`}>
            {CONTRACTS.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.07 }}
                className={`px-5 py-4 flex items-center justify-between gap-4 transition ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50"}`}>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-sm truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{c.title}</div>
                  <div className={`text-xs mt-1 ${muted}`}>{c.id} · {c.party}{c.value !== "—" ? ` · ${c.value} ر.س` : ""}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-mono ${muted}`}>{c.expire}</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs border font-bold ${STATUS[c.status]}`}>{c.status}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
