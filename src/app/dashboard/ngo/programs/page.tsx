"use client";

import { useState } from "react";
import Link from "next/link";
import { ChartBar, ClipboardText, HandHeart, Plus, Target, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const PROGRAMS = [
  { id: "PRG-001", name: "كفالة الأسر", budget: "320,000 ر.س", beneficiaries: 180, status: "نشط", report: "ربع سنوي" },
  { id: "PRG-002", name: "منح التعليم", budget: "140,000 ر.س", beneficiaries: 52, status: "نشط", report: "شهري" },
  { id: "PRG-003", name: "السلال الغذائية", budget: "95,000 ر.س", beneficiaries: 420, status: "مراجعة", report: "ربع سنوي" },
];

export default function NgoProgramsPage() {
  const { isDark } = useTheme();
  const [notice, setNotice] = useState("إدارة البرامج Backend-ready: كل إضافة أو اعتماد محلي فقط حتى ربط Programs/Reports APIs.");
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white shadow-sm";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className="max-w-6xl mx-auto space-y-5 p-4 md:p-8" dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B3D2E]/25 text-[#C8A762]">
              <Target size={21} weight="duotone" />
            </span>
            <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-300">Backend-ready</span>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-300">Beta local</span>
          </div>
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>البرامج والحملات</h1>
          <p className={`mt-1 text-sm ${muted}`}>برامج خيرية، مستفيدون، ميزانية، تقارير أثر، وحالة اعتماد محلية.</p>
        </div>
        <button
          onClick={() => setNotice("تم تجهيز نموذج إضافة برنامج محلياً. الحفظ الحقيقي ينتظر Program API وسجل تدقيق.")}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-black text-[#C8A762]"
        >
          <Plus size={16} />
          إضافة برنامج
        </button>
      </div>

      <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>{notice}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "البرامج", value: PROGRAMS.length, icon: Target },
          { label: "المستفيدون", value: "652", icon: HandHeart },
          { label: "الميزانية", value: "555,000 ر.س", icon: ChartBar },
          { label: "تقارير مستحقة", value: "2", icon: ClipboardText },
        ].map((stat) => (
          <div key={stat.label} className={`${card} p-5 flex items-center justify-between`}>
            <div>
              <p className={`text-xs mb-2 ${muted}`}>{stat.label}</p>
              <p className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>{stat.value}</p>
            </div>
            <stat.icon size={22} weight="duotone" className="text-[#C8A762]" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROGRAMS.map((program) => (
          <div key={program.id} className={`${card} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black">{program.name}</p>
                <p className={`mt-1 text-xs ${muted}`}>{program.id} • تقرير {program.report}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${program.status === "نشط" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"}`}>{program.status}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <p className={`text-[10px] ${muted}`}>الميزانية</p>
                <p className="mt-1 text-sm font-black">{program.budget}</p>
              </div>
              <div className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <p className={`text-[10px] ${muted}`}>المستفيدون</p>
                <p className="mt-1 text-sm font-black">{program.beneficiaries}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setNotice(`تم تجهيز اعتماد ${program.name} محلياً. الاعتماد الإنتاجي ينتظر Workflow API.`)}
                className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-400 border border-emerald-500/20"
              >
                اعتماد محلي
              </button>
              <button
                onClick={() => setNotice(`تصدير تقرير ${program.name} محلي فقط. التصدير الحقيقي ينتظر Reporting API.`)}
                className={`rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-700"}`}
              >
                تقرير أثر
              </button>
            </div>
          </div>
        ))}
      </div>

      <Link href="/dashboard/admin/sector-profiles" className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
        إدارة من أدمن نظامي
      </Link>
    </div>
  );
}
