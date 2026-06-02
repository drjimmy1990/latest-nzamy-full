"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardText, FileText, Plus, ShieldCheck, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const BOARD_MEMBERS = [
  { id: "BRD-001", name: "أحمد السالم", role: "رئيس المجلس", status: "نشط", committees: "الاستثمار والحوكمة" },
  { id: "BRD-002", name: "نورة الحربي", role: "نائب الرئيس", status: "نشط", committees: "المراجعة الداخلية" },
  { id: "BRD-003", name: "عبدالله القحطاني", role: "عضو مجلس", status: "ينتظر تحديث", committees: "البرامج والأثر" },
];

const DECISIONS = [
  { id: "DEC-011", title: "اعتماد برنامج كفالة الأسر", status: "معتمد", owner: "رئيس المجلس" },
  { id: "DEC-012", title: "فتح أصل وقفي جديد", status: "مراجعة", owner: "لجنة الاستثمار" },
  { id: "DEC-013", title: "تحديث سياسة تعارض المصالح", status: "مسودة", owner: "لجنة الحوكمة" },
];

export default function NgoBoardPage() {
  const { isDark } = useTheme();
  const [notice, setNotice] = useState("مجلس الإدارة Backend-ready: القرارات والاعتمادات محلية فقط حتى ربط Board/Governance APIs.");
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white shadow-sm";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className="max-w-6xl mx-auto space-y-5 p-4 md:p-8" dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B3D2E]/25 text-[#C8A762]">
              <UsersThree size={21} weight="duotone" />
            </span>
            <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-300">Backend-ready</span>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-300">Beta local</span>
          </div>
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>مجلس الإدارة</h1>
          <p className={`mt-1 text-sm ${muted}`}>أعضاء المجلس، اللجان، القرارات، ومصفوفة اعتماد حوكمي واضحة.</p>
        </div>
        <button
          onClick={() => setNotice("تم تجهيز دعوة عضو مجلس محلياً. الدعوات الحقيقية تنتظر Auth/RBAC API.")}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-black text-[#C8A762]"
        >
          <Plus size={16} />
          دعوة عضو
        </button>
      </div>

      <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>{notice}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "أعضاء المجلس", value: BOARD_MEMBERS.length, icon: UsersThree },
          { label: "قرارات مفتوحة", value: "2", icon: ClipboardText },
          { label: "سياسات حوكمة", value: "6", icon: ShieldCheck },
          { label: "محاضر جاهزة", value: "4", icon: FileText },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className={`${card} overflow-hidden`}>
          <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <h2 className="text-sm font-black">أعضاء المجلس واللجان</h2>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {BOARD_MEMBERS.map((member) => (
              <div key={member.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black">{member.name}</p>
                    <p className={`mt-1 text-xs ${muted}`}>{member.role} • {member.committees}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${member.status === "نشط" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"}`}>{member.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${card} overflow-hidden`}>
          <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <h2 className="text-sm font-black">القرارات والاعتمادات</h2>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {DECISIONS.map((decision) => (
              <div key={decision.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black">{decision.title}</p>
                    <p className={`mt-1 text-xs ${muted}`}>{decision.id} • المسؤول: {decision.owner}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    decision.status === "معتمد" ? "bg-emerald-500/10 text-emerald-400" :
                    decision.status === "مراجعة" ? "bg-amber-500/10 text-amber-300" :
                    "bg-blue-500/10 text-blue-300"
                  }`}>{decision.status}</span>
                </div>
                <button
                  onClick={() => setNotice(`تم تجهيز إجراء ${decision.title} محلياً. سجل القرار الحقيقي ينتظر BoardDecision API.`)}
                  className={`mt-4 rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-700"}`}
                >
                  إجراء محلي
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Link href="/dashboard/admin/sector-profiles" className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
        إدارة من أدمن نظامي
      </Link>
    </div>
  );
}
