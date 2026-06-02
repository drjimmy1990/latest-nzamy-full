"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Buildings, ChartBar, Coins, MapPin, Plus, Users, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

const BRANCHES = [
  { city: "الرياض", manager: "سارة المنصور", people: 18, activeCases: 42, revenue: 720000, points: 180000, risk: "مستقر" },
  { city: "جدة", manager: "تركي العمر", people: 9, activeCases: 21, revenue: 310000, points: 90000, risk: "يحتاج متابعة" },
  { city: "الخبر", manager: "نورة الشمري", people: 6, activeCases: 14, revenue: 180000, points: 60000, risk: "جاهز للتوسع" },
];

export default function FirmBranchesPage() {
  const { isDark } = useTheme();
  const [toast, setToast] = useState("فروع شركة المحاماة Backend-ready: بيانات الفروع والربط بالمقاعد والنقاط محلية فقط حتى Firm/Branches API.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <SubscriptionGuard featureKey="firm-branches">
      <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-300">
              <Buildings size={13} weight="duotone" />
              Backend-ready
            </div>
            <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>فروع مكتب/شركة المحاماة</h1>
            <p className={`mt-1 text-sm ${muted}`}>إدارة الفروع حسب المدينة، المدير، الفريق، القضايا، الإيراد، واستهلاك النقاط.</p>
          </div>
          <button
            onClick={() => setToast("إضافة فرع جديد جاهزة للربط فقط. يلزم لاحقا FirmBranch API وتدقيق إداري قبل حفظ الإنتاج.")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-black text-[#C8A762]"
          >
            <Plus size={15} weight="bold" />
            فرع جديد
          </button>
        </div>

        <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
          <span>{toast}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {BRANCHES.map((branch, index) => (
            <motion.div key={branch.city} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={`${card} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B3D2E]/15 text-[#C8A762]">
                    <MapPin size={21} weight="duotone" />
                  </span>
                  <div>
                    <p className={`text-base font-black ${isDark ? "text-white" : "text-slate-800"}`}>{branch.city}</p>
                    <p className={`text-[11px] ${muted}`}>مدير الفرع: {branch.manager}</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400">{branch.risk}</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <Metric icon={Users} label="الفريق" value={`${branch.people}`} isDark={isDark} />
                <Metric icon={Buildings} label="قضايا نشطة" value={`${branch.activeCases}`} isDark={isDark} />
                <Metric icon={ChartBar} label="الإيراد" value={`${branch.revenue.toLocaleString("ar-SA")} ر.س`} isDark={isDark} />
                <Metric icon={Coins} label="نقاط الفرع" value={branch.points.toLocaleString("ar-SA")} isDark={isDark} />
              </div>

              <button
                onClick={() => setToast(`تم تجهيز فتح إعدادات فرع ${branch.city} محليا فقط. الربط الحقيقي ينتظر Branch/Profile API.`)}
                className={`mt-4 w-full rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                إدارة الفرع محليا
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </SubscriptionGuard>
  );
}

function Metric({ icon: Icon, label, value, isDark }: { icon: React.ElementType; label: string; value: string; isDark: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
      <div className="flex items-center gap-2 text-[#C8A762]">
        <Icon size={14} weight="duotone" />
        <span className="text-[10px]">{label}</span>
      </div>
      <p className={`mt-1 font-black ${isDark ? "text-white" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
