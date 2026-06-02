"use client";

import { useState } from "react";
import Link from "next/link";
import { Buildings, ChartBar, FileText, Plus, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const AWQAF = [
  { id: "WQF-001", name: "وقف النماء السكني", asset: "عقار سكني", revenue: "42,000 ر.س", program: "كفالة الأسر", status: "نشط" },
  { id: "WQF-002", name: "وقف التعليم الرقمي", asset: "محفظة ريع", revenue: "18,500 ر.س", program: "منح تعليمية", status: "مراجعة" },
  { id: "WQF-003", name: "وقف الرعاية الصحية", asset: "أصل نقدي", revenue: "31,200 ر.س", program: "علاج الحالات", status: "نشط" },
];

export default function NgoAwqafPage() {
  const { isDark } = useTheme();
  const [notice, setNotice] = useState("إدارة الأوقاف Backend-ready: البيانات محلية فقط حتى ربط CMS/DB وسجل اعتماد.");
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white shadow-sm";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className="max-w-6xl mx-auto space-y-5 p-4 md:p-8" dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B3D2E]/25 text-[#C8A762]">
              <Buildings size={21} weight="duotone" />
            </span>
            <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-300">Backend-ready</span>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-300">Beta local</span>
          </div>
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>الأوقاف والأصول</h1>
          <p className={`mt-1 text-sm ${muted}`}>الوقف يظهر كنوع مستقل داخل NGO: أصل، ريع، برنامج مرتبط، وحالة اعتماد.</p>
        </div>
        <button
          onClick={() => setNotice("تم تجهيز نموذج إضافة وقف محلياً. الحفظ الحقيقي ينتظر WaqfAsset API وسجل تدقيق.")}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-black text-[#C8A762]"
        >
          <Plus size={16} />
          إضافة وقف
        </button>
      </div>

      <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>{notice}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "الأوقاف المسجلة", value: AWQAF.length, icon: Buildings },
          { label: "ريع شهري تقديري", value: "91,700 ر.س", icon: ChartBar },
          { label: "برامج مرتبطة", value: "3", icon: ShieldCheck },
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

      <div className={`${card} overflow-hidden`}>
        <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <h2 className="text-sm font-black">سجل الأوقاف</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3">
          {AWQAF.map((item) => (
            <div key={item.id} className={`p-5 border-b md:border-l ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black">{item.name}</p>
                  <p className={`mt-1 text-xs ${muted}`}>{item.id} • {item.asset}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === "نشط" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"}`}>{item.status}</span>
              </div>
              <p className={`mt-4 text-xs ${muted}`}>الريع: <span className="font-black text-[#C8A762]">{item.revenue}</span></p>
              <p className={`mt-1 text-xs ${muted}`}>البرنامج: {item.program}</p>
              <button
                onClick={() => setNotice(`معاينة مصدر ${item.name} محلية فقط. اعتماد المصدر الرسمي ينتظر CMS/DB.`)}
                className={`mt-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-700"}`}
              >
                <FileText size={14} />
                معاينة المصدر
              </button>
            </div>
          ))}
        </div>
      </div>

      <Link href="/dashboard/admin/sector-profiles" className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
        إدارة من أدمن نظامي
      </Link>
    </div>
  );
}
