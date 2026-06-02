"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Buildings, FloppyDisk, Globe, MapPin, SealCheck, Users, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { FIRM_PRACTICE_MODEL_LABEL, FIRM_SIZE_LABEL, FIRM_STRUCTURE_LABEL } from "@/constants/firmProfileReadiness";
import { useAdminSettings } from "@/hooks/useAdminSettings";

export default function FirmProfilePage() {
  const { isDark } = useTheme();
  const { currentFirmFeatures } = useAdminSettings();
  const [name, setName] = useState("شركة السند للمحاماة والاستشارات");
  const [headline, setHeadline] = useState("تقاضٍ تجاري، عقود، امتثال، وتحكيم للشركات المتوسطة والكبيرة");
  const [toast, setToast] = useState("الملف المهني للمكتب Backend-ready: بيانات الهوية والاعتماد محلية فقط حتى Firm/Profile API.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const input = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${isDark ? "border-white/10 bg-[#0d1117] text-white" : "border-slate-200 bg-white text-slate-800"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-300">
            <SealCheck size={13} weight="duotone" />
            Backend-ready
          </div>
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>الملف المهني للمكتب</h1>
          <p className={`mt-1 text-sm ${muted}`}>هوية المكتب العامة واعتماده ومجالات ممارسته، كواجهة جاهزة للربط.</p>
        </div>
        <button
          onClick={() => setToast("تم تجهيز حفظ الملف محليا فقط. الحفظ الإنتاجي ينتظر Firm/Profile API ومراجعة اعتماد الأدمن.")}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-black text-[#C8A762]"
        >
          <FloppyDisk size={15} />
          حفظ محلي
        </button>
      </div>

      <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>{toast}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={`lg:col-span-2 ${card} p-5 space-y-4`}>
          <Field label="اسم المكتب/الشركة">
            <input value={name} onChange={(event) => setName(event.target.value)} className={input} />
          </Field>
          <Field label="وصف مختصر">
            <textarea value={headline} onChange={(event) => setHeadline(event.target.value)} rows={3} className={input} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Info icon={Buildings} label="حجم الشركة" value={FIRM_SIZE_LABEL[currentFirmFeatures.firmSize]} isDark={isDark} />
            <Info icon={Users} label="الهيكل" value={FIRM_STRUCTURE_LABEL[currentFirmFeatures.structure]} isDark={isDark} />
            <Info icon={Globe} label="نموذج الممارسة" value={FIRM_PRACTICE_MODEL_LABEL[currentFirmFeatures.practiceModel]} isDark={isDark} />
            <Info icon={MapPin} label="المقاعد النشطة" value={`${currentFirmFeatures.activeSeats} مقعد`} isDark={isDark} />
          </div>
        </div>

        <div className={`${card} p-5`}>
          <div className="rounded-2xl bg-[#0B3D2E] p-5 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#C8A762]/15 text-[#C8A762]">
                <Buildings size={24} weight="duotone" />
              </span>
              <div>
                <p className="text-lg font-black">{name}</p>
                <p className="text-[11px] text-emerald-100">مزود قانوني Backend-ready</p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-emerald-50">{headline}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-xl bg-white/10 p-3">الباقة: {currentFirmFeatures.plan}</span>
              <span className="rounded-xl bg-white/10 p-3">النقاط: {currentFirmFeatures.availablePoints.toLocaleString("ar-SA")}</span>
            </div>
          </div>
          <p className={`mt-4 text-xs leading-relaxed ${muted}`}>هذه بطاقة معاينة فقط. النشر العام، التوثيق، الشارات، ومراجعة الأدمن تحتاج backend وحالة اعتماد حقيقية.</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-bold text-gray-500">{label}</span>{children}</label>;
}

function Info({ icon: Icon, label, value, isDark }: { icon: React.ElementType; label: string; value: string; isDark: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-slate-100 bg-slate-50"}`}>
      <Icon size={17} className="text-[#C8A762]" weight="duotone" />
      <p className="mt-2 text-[10px] text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
