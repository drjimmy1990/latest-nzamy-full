"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  ClipboardText, Plus, Clock, CheckCircle, Warning,
  FileText, ArrowSquareOut, Sparkle, DownloadSimple, Bell,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const MOCK_CONTRACTS = [
  { id: 1, name: "عقد توريد — شركة الأمل للتوزيع",      type: "توريد",     status: "active",   expires: "٢٠٢٦/٦/١٤",  risk: "low",    value: "٢٤٠,٠٠٠ ريال" },
  { id: 2, name: "عقد خدمات تقنية — SaaS",              type: "خدمات",     status: "expiring", expires: "٢٠٢٦/٤/٢٨",  risk: "medium", value: "٨٤,٠٠٠ ريال" },
  { id: 3, name: "اتفاقية سرية — شريك استراتيجي",       type: "NDA",       status: "active",   expires: "٢٠٢٧/١/١",   risk: "low",    value: "—" },
  { id: 4, name: "عقد مقاولات إنشائية",                 type: "مقاولات",   status: "expired",  expires: "٢٠٢٦/٢/١",   risk: "high",   value: "٥٤٠,٠٠٠ ريال" },
  { id: 5, name: "عقد وكالة تجارية",                    type: "وكالة",     status: "active",   expires: "٢٠٢٦/٩/٣٠",  risk: "low",    value: "١٢٠,٠٠٠ ريال" },
];

const STATUS = {
  active:   { label: "ساري",      color: "text-emerald-500", bg: "bg-emerald-500/10" },
  expiring: { label: "ينتهي قريباً", color: "text-amber-500",  bg: "bg-amber-500/10"   },
  expired:  { label: "منتهي",     color: "text-red-500",    bg: "bg-red-500/10"     },
};

const RISK = {
  low:    { label: "منخفض", color: "text-emerald-500" },
  medium: { label: "متوسط", color: "text-amber-500"   },
  high:   { label: "مرتفع", color: "text-red-500"     },
};

export default function CorpCLMPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<"all" | "active" | "expiring" | "expired">("all");
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  const filtered = filter === "all" ? MOCK_CONTRACTS : MOCK_CONTRACTS.filter(c => c.status === filter);
  const expiringCount = MOCK_CONTRACTS.filter(c => c.status === "expiring").length;

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مدير العقود</h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">جديد</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            إدارة دورة حياة عقود شركتك — تنبيهات انتهاء الصلاحية، تحليل المخاطر، تجديد ذكي
          </p>
        </div>
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-white shadow-md">
          <Plus size={14} /> عقد جديد
        </motion.button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "إجمالي العقود", value: MOCK_CONTRACTS.length, color: "text-blue-500", bg: isDark ? "bg-blue-500/5 border-blue-700/20" : "bg-blue-50 border-blue-200" },
          { label: "تنتهي خلال ٣٠ يوم", value: expiringCount, color: "text-amber-500", bg: isDark ? "bg-amber-500/5 border-amber-700/20" : "bg-amber-50 border-amber-200" },
          { label: "منتهية", value: MOCK_CONTRACTS.filter(c => c.status === "expired").length, color: "text-red-500", bg: isDark ? "bg-red-500/5 border-red-700/20" : "bg-red-50 border-red-200" },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl border p-4 text-center ${s.bg}`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Expiring alert */}
      {expiringCount > 0 && (
        <div className={`flex items-center gap-3 rounded-xl border p-3.5 ${isDark ? "border-amber-700/30 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <Bell size={16} className="text-amber-500 flex-shrink-0" />
          <p className={`text-[12px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>
            <strong>{expiringCount} عقد</strong> يقترب من انتهاء صلاحيته — يُنصح بالتجديد المبكر
          </p>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "active", "expiring", "expired"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold border transition-all ${
              filter === f
                ? "bg-[#0B3D2E] border-[#0B3D2E] text-white"
                : isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-white text-zinc-500"
            }`}>
            {f === "all" ? "الكل" : f === "active" ? "سارية" : f === "expiring" ? "تنتهي قريباً" : "منتهية"}
          </button>
        ))}
      </div>

      {/* Contracts list */}
      <div className="space-y-2">
        {filtered.map((contract, i) => {
          const st = STATUS[contract.status as keyof typeof STATUS];
          const rk = RISK[contract.risk as keyof typeof RISK];
          return (
            <motion.div key={contract.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={`${card} p-4 shadow-sm`}>
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
                  <FileText size={16} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{contract.name}</p>
                    <span className={`flex-shrink-0 text-[9px] font-bold rounded-full px-1.5 py-0.5 ${st.bg} ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{contract.type}</span>
                    <span className={`text-[10px] flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      <Clock size={9} /> {contract.expires}
                    </span>
                    <span className={`text-[10px] font-semibold ${rk.color}`}>خطر {rk.label}</span>
                    <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{contract.value}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className={`rounded-lg p-1.5 ${isDark ? "hover:bg-zinc-800 text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}>
                    <ArrowSquareOut size={13} />
                  </button>
                  <button className={`rounded-lg p-1.5 ${isDark ? "hover:bg-zinc-800 text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}>
                    <DownloadSimple size={13} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* AI analysis button */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>تحليل AI لمحفظة العقود</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>يحدد البنود الخطرة ويقترح تحسينات لكل عقد</p>
          </div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white shadow-md">
            <Sparkle size={13} weight="fill" /> تحليل
          </motion.button>
        </div>
      </div>
    </div>
  );
}
