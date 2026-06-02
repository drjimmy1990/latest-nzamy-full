"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Archive, Clock, Coins, Download, FileText, Gavel, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const EVENTS = [
  { type: "قضية", title: "تم تغيير مسؤول قضية نزاع توريد", actor: "الشريك المدير", time: "منذ 12 دقيقة", icon: Gavel },
  { type: "نقاط", title: "طلب قسم العقود 15,000 نقطة إضافية", actor: "مدير القسم", time: "منذ ساعة", icon: Coins },
  { type: "صلاحيات", title: "تعديل نطاق الامتثال إلى قراءة التقارير فقط", actor: "امتثال", time: "اليوم", icon: ShieldCheck },
  { type: "مستند", title: "أرشفة مسودة عقد قديمة", actor: "سكرتارية قانونية", time: "أمس", icon: FileText },
  { type: "بيتا", title: "محاولة تصدير سجل تدقيق كواجهة محلية", actor: "النظام", time: "هذا الأسبوع", icon: Archive },
];

export default function FirmActivityPage() {
  const { isDark } = useTheme();
  const [toast, setToast] = useState("سجل النشاط Backend-ready: هذه أحداث mock/local فقط حتى ربط AdminAuditEvent وFirmAuditEvent.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>سجل نشاط المكتب</h1>
          <p className={`mt-1 text-sm ${muted}`}>تجهيز بصري لسجل من فعل ماذا ومتى وعلى أي كيان، قبل ربط سجل التدقيق الحقيقي.</p>
        </div>
        <button
          onClick={() => setToast("تصدير سجل النشاط جاهز للربط فقط. يلزم Audit export API وصلاحيات خادمية قبل الإنتاج.")}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
        >
          <Download size={15} />
          تصدير
        </button>
      </div>

      <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>{toast}</span>
      </div>

      <div className={`${card} p-4`}>
        <div className="space-y-3">
          {EVENTS.map((event, index) => (
            <motion.div key={`${event.type}-${index}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className={`flex items-start gap-3 rounded-xl border p-4 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B3D2E]/15 text-[#C8A762]">
                <event.icon size={18} weight="duotone" />
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#C8A762]/10 px-2 py-0.5 text-[10px] font-bold text-[#C8A762]">{event.type}</span>
                  <span className={`inline-flex items-center gap-1 text-[11px] ${muted}`}><Clock size={11} />{event.time}</span>
                </div>
                <p className={`mt-2 text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{event.title}</p>
                <p className={`mt-1 text-xs ${muted}`}>الفاعل: {event.actor}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
