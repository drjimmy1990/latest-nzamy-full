"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Microphone, PencilLine, CheckCircle, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { PartyData } from "./types";

// ─── Voice Button ─────────────────────────────────────────────────────────────
export function VoiceBtn({ label = "صوت" }: { label?: string }) {
  const [active, setActive] = useState(false);
  const { isDark } = useTheme();
  return (
    <motion.button whileTap={{ scale: 0.92 }} onClick={() => setActive(v => !v)}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold border transition-colors ${
        active
          ? "bg-red-500/15 text-red-400 border-red-500/30"
          : isDark
            ? "bg-white/[0.06] text-zinc-300 border-white/[0.07] hover:text-white"
            : "bg-zinc-100 text-zinc-500 border-zinc-200 hover:text-zinc-700"
      }`}>
      <motion.span animate={active ? { scale: [1, 1.3, 1] } : {}} transition={{ repeat: Infinity, duration: 0.8 }}>
        <Microphone size={11} weight={active ? "fill" : "regular"} />
      </motion.span>
      {active ? "جارٍ الإملاء..." : label}
    </motion.button>
  );
}

// ─── Party Form ───────────────────────────────────────────────────────────────
export function PartyForm({ data, onChange, isDark }: {
  data: PartyData;
  onChange: (field: keyof PartyData, value: string) => void;
  isDark: boolean;
}) {
  const inp = `w-full rounded-xl border p-3 text-[12px] outline-none transition-colors ${
    isDark
      ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"
  }`;
  const lbl = `block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`;
  return (
    <div className="space-y-3 mt-4">
      <div className="flex gap-2">
        {([["company", "🏢 شركة"], ["individual", "👤 فرد"], ["government", "🏛️ جهة حكومية"]] as const).map(([t, l]) => (
          <button key={t} onClick={() => onChange("type", t)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-medium border transition-all ${
              data.type === t
                ? isDark ? "bg-[#0B3D2E]/30 border-[#0B3D2E]/50 text-emerald-300" : "bg-[#0B3D2E]/10 border-[#0B3D2E]/30 text-[#0B3D2E]"
                : isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"
            }`}>{l}</button>
        ))}
      </div>
      {data.type === "company" && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>اسم الشركة</label><input className={inp} value={data.companyName} onChange={e => onChange("companyName", e.target.value)} placeholder="الاسم التجاري" /></div>
          <div><label className={lbl}>السجل التجاري</label><input className={inp} value={data.commercialReg} onChange={e => onChange("commercialReg", e.target.value)} placeholder="10 أرقام" /></div>
          <div><label className={lbl}>الرقم الموحد (700)</label><input className={inp} value={data.unifiedNum} onChange={e => onChange("unifiedNum", e.target.value)} placeholder="700XXXXXXX" /></div>
          <div><label className={lbl}>الممثل النظامي</label><input className={inp} value={data.representative} onChange={e => onChange("representative", e.target.value)} placeholder="الاسم الكامل" /></div>
          <div>
            <label className={lbl}>صفة الممثل</label>
            <select className={inp} value={data.representativeRole} onChange={e => onChange("representativeRole", e.target.value)}>
              <option value="">اختر الصفة</option>
              <option value="مدير عام">مدير عام</option>
              <option value="عضو مجلس إدارة">عضو مجلس إدارة</option>
              <option value="مفوض بالتوقيع">مفوض بالتوقيع</option>
              <option value="مدير">مدير</option>
            </select>
          </div>
          <div className="col-span-2"><label className={lbl}>العنوان</label><input className={inp} value={data.address} onChange={e => onChange("address", e.target.value)} placeholder="المدينة — الحي — الشارع" /></div>
        </div>
      )}
      {data.type === "individual" && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>الاسم الكامل</label><input className={inp} value={data.fullName} onChange={e => onChange("fullName", e.target.value)} placeholder="الاسم الرباعي" /></div>
          <div><label className={lbl}>رقم الهوية / الإقامة</label><input className={inp} value={data.idNumber} onChange={e => onChange("idNumber", e.target.value)} placeholder="10 أرقام" /></div>
          <div><label className={lbl}>الجنسية</label><input className={inp} value={data.nationality} onChange={e => onChange("nationality", e.target.value)} placeholder="سعودي / غير ذلك" /></div>
        </div>
      )}
      {data.type === "government" && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>اسم الجهة</label><input className={inp} value={data.entityName} onChange={e => onChange("entityName", e.target.value)} placeholder="اسم الجهة الحكومية" /></div>
          <div><label className={lbl}>الرقم الموحد</label><input className={inp} value={data.unifiedNumGov} onChange={e => onChange("unifiedNumGov", e.target.value)} placeholder="الرقم الموحد" /></div>
          <div><label className={lbl}>المسؤول / جهة التواصل</label><input className={inp} value={data.contactPerson} onChange={e => onChange("contactPerson", e.target.value)} placeholder="الجهة المختصة" /></div>
        </div>
      )}
    </div>
  );
}

// ─── Paragraph Hover Editor ───────────────────────────────────────────────────
export function ParagraphEditor({
  para, isDark, editNote, onEditNote
}: {
  para: { id: string; title: string; body: string };
  isDark: boolean;
  editNote: string;
  onEditNote: (val: string) => void;
}) {
  const [hovered, setHovered]    = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
    >
      <div
        onClick={() => setPanelOpen(v => !v)}
        className={`cursor-pointer rounded-xl p-4 border transition-all ${
          panelOpen
            ? isDark ? "border-amber-500/40 bg-amber-900/10" : "border-amber-400/40 bg-amber-50"
            : hovered
              ? isDark ? "border-white/[0.12] bg-white/[0.04]" : "border-zinc-300 bg-zinc-50"
              : isDark ? "border-transparent" : "border-transparent"
        }`}
      >
        <p className={`text-[12px] font-bold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{para.title}</p>
        <p className={`text-[13px] leading-relaxed whitespace-pre-line ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{para.body}</p>

        <AnimatePresence>
          {hovered && !panelOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute top-2 start-2 flex items-center gap-1 rounded-lg px-2 py-1 bg-amber-500/90 text-white text-[10px] font-bold">
              <PencilLine size={10} /> اضغط للتعديل
            </motion.div>
          )}
        </AnimatePresence>

        {editNote && (
          <div className={`mt-2 flex items-center gap-1 text-[10px] ${isDark ? "text-amber-400" : "text-amber-600"}`}>
            <PencilLine size={10} />
            <span>تم إضافة تعديل على هذا البند</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="overflow-hidden"
          >
            <div className={`mt-1 rounded-xl border p-3 space-y-2 ${isDark ? "border-amber-500/25 bg-amber-900/10" : "border-amber-200 bg-amber-50/80"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <PencilLine size={12} className="text-amber-500" />
                  <p className={`text-[11px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>تعديلك على هذا البند</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <VoiceBtn label="صوّت تعديلك" />
                  <button onClick={() => setPanelOpen(false)}>
                    <X size={13} className={isDark ? "text-zinc-600" : "text-zinc-400"} />
                  </button>
                </div>
              </div>
              <textarea
                value={editNote}
                onChange={e => onEditNote(e.target.value)}
                placeholder="اكتب تعديلك على هذا البند... أو استخدم الإملاء الصوتي"
                rows={3}
                className={`w-full rounded-xl border px-3 py-2 text-[12px] outline-none resize-none leading-relaxed ${
                  isDark
                    ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600"
                    : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"
                }`}
              />
              {editNote && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`flex items-center gap-1 text-[10px] ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                  <CheckCircle size={11} weight="fill" />
                  تم حفظ التعديل — سيُطبَّق في النسخة النهائية
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
