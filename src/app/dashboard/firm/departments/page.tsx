"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Buildings, Coins, Gavel, Gear, Plus, ShieldCheck, Users } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import { useAdminSettings } from "@/hooks/useAdminSettings";

const PRACTICE_DEPARTMENTS = [
  { name: "التقاضي", manager: "محام أول", people: 6, points: 50000, spent: 31300, icon: Gavel },
  { name: "العقود والشركات", manager: "شريك", people: 4, points: 40000, spent: 18200, icon: Buildings },
  { name: "الامتثال والمخاطر", manager: "مدير امتثال", people: 3, points: 30000, spent: 11200, icon: ShieldCheck },
];

const OPERATIONS_DEPARTMENTS = [
  { name: "المالية والفوترة", role: "مدير مالي", access: "يرى صرف الشركة والفواتير" },
  { name: "الموارد البشرية والتدريب", role: "HR", access: "يرى الفريق والحضور والمتدربين" },
  { name: "السكرتارية القانونية", role: "سكرتير قانوني", access: "يرى الجلسات والمستندات المعيّنة" },
];

export default function FirmDepartmentsPage() {
  const { isDark } = useTheme();
  const { currentFirmFeatures } = useAdminSettings();
  const [toast, setToast] = useState("الأقسام Backend-ready: التقسيم والصلاحيات وتوزيع النقاط محلية فقط حتى ربط Org/RBAC/Wallet APIs.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <SubscriptionGuard featureKey="firm-departments">
      <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>أقسام شركة المحاماة</h1>
            <p className={`mt-1 text-sm ${muted}`}>نفرق بين أقسام ممارسة قانونية وإدارات تشغيل داخلية حتى لا تختلط شركة المحاماة بالشركة التجارية.</p>
          </div>
          <button
            onClick={() => setToast("إنشاء قسم جديد جاهز للربط فقط. يلزم لاحقا org_units API وتدقيق before/after.")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-black text-[#C8A762]"
          >
            <Plus size={15} weight="bold" />
            قسم جديد
          </button>
        </div>

        <div className={`rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
          {toast}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRACTICE_DEPARTMENTS.map((dept, index) => {
            const pct = Math.round((dept.spent / dept.points) * 100);
            return (
              <motion.div key={dept.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={`${card} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B3D2E]/15 text-[#C8A762]">
                      <dept.icon size={19} weight="duotone" />
                    </span>
                    <div>
                      <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{dept.name}</p>
                      <p className={`text-[11px] ${muted}`}>{dept.manager}</p>
                    </div>
                  </div>
                  <Users size={18} className={muted} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className={`rounded-xl p-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                    <p className={muted}>الفريق</p>
                    <p className={`mt-1 font-black ${isDark ? "text-white" : "text-slate-800"}`}>{dept.people}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                    <p className={muted}>النقاط</p>
                    <p className={`mt-1 font-black ${isDark ? "text-white" : "text-slate-800"}`}>{dept.points.toLocaleString("ar-SA")}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className={muted}>الصرف</span>
                    <span className={muted}>{pct}%</span>
                  </div>
                  <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className={`${card} p-5`}>
          <div className="mb-4 flex items-center gap-2">
            <Gear size={18} weight="duotone" className="text-[#C8A762]" />
            <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>إدارات تشغيل داخلية</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {OPERATIONS_DEPARTMENTS.map((dept) => (
              <div key={dept.name} className={`rounded-xl border p-4 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{dept.name}</p>
                <p className={`mt-1 text-[11px] ${muted}`}>{dept.role}</p>
                <p className={`mt-3 text-[12px] leading-relaxed ${muted}`}>{dept.access}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`${card} p-5 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
          <div>
            <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>رصيد الشركة العام</p>
            <p className={`mt-1 text-xs ${muted}`}>مدير الشركة يرى الكل، مدير القسم يرى قسمه فقط، والمحامي يرى استهلاكه أو الحد المخصص له.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-[#C8A762]/25 bg-[#C8A762]/10 px-4 py-3 text-[#C8A762]">
            <Coins size={18} weight="duotone" />
            <span className="font-mono text-lg font-black">{currentFirmFeatures.availablePoints.toLocaleString("ar-SA")}</span>
          </div>
        </div>
      </div>
    </SubscriptionGuard>
  );
}
