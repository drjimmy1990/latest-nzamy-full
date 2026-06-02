"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Warning, Lightning, CalendarBlank,
  Microphone, VideoCamera, ChatText, Storefront,
  Robot, Gavel, Paperclip,
} from "@phosphor-icons/react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { MOCK_DAYS } from "../types";
import { rowBtnClass, staggerListVariants, staggerItemVariants } from "./WaShared";
import type { WaStep, UserCategory } from "../types";
import type { FloatingActorContext } from "../roleContext";

interface Props {
  step: WaStep;
  isDark: boolean;
  isRTL: boolean;
  selections: Record<string, string>;
  detailsTitle: string;
  detailsDesc: string;
  onNavigate: (next: WaStep) => void;
  onSelect: (key: string, value: string) => void;
  setDetailsTitle: (v: string) => void;
  setDetailsDesc: (v: string) => void;
  calDay: string | null;
  calSlot: string | null;
  setCalDay: (v: string | null) => void;
  setCalSlot: (v: string | null) => void;
  userCategory?: UserCategory | null;
  actorContext?: FloatingActorContext | null;
}

export default function StepConsult({
  step, isDark, isRTL, selections,
  detailsTitle, detailsDesc,
  onNavigate, onSelect,
  setDetailsTitle, setDetailsDesc,
  calDay, calSlot, setCalDay, setCalSlot,
  userCategory, actorContext,
}: Props) {
  const NavArrow = isRTL
    ? <ArrowLeft size={14} className="text-gray-400 shrink-0" />
    : <ArrowRight size={14} className="text-gray-400 shrink-0" />;

  // ── consult-timing ──
  if (step === "consult-timing") {
    const OPTIONS = [
      { icon: <Warning size={18} weight="fill" className="text-orange-500" />, label: "استشارة فورية", sub: "صوت/فيديو/كتابة في غضون ١٥–٢٠ دقيقة", next: "consult-instant-modality" as WaStep, badge: "الأسرع", badgeColor: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
      { icon: <Lightning size={18} weight="fill" className="text-[#C8A762]" />, label: "أقرب وقت متاح", sub: "نُشعرك فور توفر موعد", next: "consult-next-details" as WaStep, badge: null, badgeColor: "" },
      { icon: <CalendarBlank size={18} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />, label: "احجز ميعاد محدد", sub: "اختر يوماً ووقتاً محدداً", next: "consult-specific-details" as WaStep, badge: null, badgeColor: "" },
    ];
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-2 relative">
        {OPTIONS.map(({ icon, label, sub, next, badge, badgeColor }) => (
          <motion.button variants={staggerItemVariants} key={next} onClick={() => onNavigate(next)} className={rowBtnClass(isDark)}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-[#0B3D2E]/5 dark:bg-emerald-500/10">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{label}</span>
                {badge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</div>
            </div>
            {NavArrow}
          </motion.button>
        ))}
      </motion.div>
    );
  }

  // ── consult-instant-modality ──
  if (step === "consult-instant-modality") {
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        <motion.p variants={staggerItemVariants} className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-3 py-2">
          الاستشارة الفورية متاحة صوتاً أو فيديو أو كتابة فقط
        </motion.p>
        <div className="flex flex-col gap-2">
          {([
            { icon: <Microphone size={18} weight="fill" />, label: "صوت", val: "voice" },
            { icon: <VideoCamera size={18} weight="fill" />, label: "فيديو", val: "video" },
            { icon: <ChatText size={18} weight="fill" />, label: "كتابة", val: "text" },
          ] as const).map(({ icon, label, val }) => (
            <motion.button
              variants={staggerItemVariants}
              key={val}
              aria-pressed={selections.modality === val}
              onClick={() => { onSelect("modality", val); onNavigate("consult-instant-provider"); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-[1.25rem] border text-start transition-all relative overflow-hidden group ${
                selections.modality === val
                  ? "bg-[#0B3D2E] border-[#0B3D2E] text-white shadow-md shadow-[#0B3D2E]/20"
                  : isDark ? "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] text-white" : "border-gray-200/70 bg-white hover:bg-gray-50 text-gray-800"
              } hover:border-[#0B3D2E]/30 active:scale-[0.98]`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
              <span className={selections.modality === val ? "text-white" : "text-[#0B3D2E] dark:text-emerald-400"}>{icon}</span>
              <span className="text-[13px] font-bold">{label}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    );
  }

  // ── consult-instant-provider ──
  if (step === "consult-instant-provider") {
    const isTextMode = selections.modality === "text";
    const providers = [
      ...(isTextMode ? [{
        icon: <Robot size={20} weight="fill" />, label: "نظامي AI",
        price: "٥٠ ر.س للجلسة", sub: "أو مجاناً بالاشتراك الشهري", val: "ai",
        borderClass: "border-emerald-400 dark:border-emerald-500",
        badgeClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", badge: "AI",
      }] : []),
      {
        icon: <Gavel size={20} weight="fill" />, label: "محامي متخصص",
        price: "٧٠٠ ر.س", sub: "في غضون ١٥–٢٠ دقيقة", val: "lawyer",
        borderClass: "border-[#C8A762] dark:border-[#C8A762]",
        badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", badge: "محامي",
      },
    ];
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        {!isTextMode && (
          <motion.p variants={staggerItemVariants} className="text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl px-3 py-2">
            الاستشارات الصوتية والمرئية تتم مع محامٍ متخصص فقط
          </motion.p>
        )}
        {providers.map(({ icon, label, price, sub, val, borderClass, badgeClass, badge }) => (
          <motion.button variants={staggerItemVariants} key={val} onClick={() => { onSelect("provider", val); onNavigate("consult-details"); }}
            className={`w-full flex items-start gap-3.5 px-4 py-4 rounded-[1.25rem] border-2 text-start transition-all group relative overflow-hidden
              ${selections.provider === val ? (val === "ai" ? "bg-emerald-50 dark:bg-emerald-900/20 shadow-md shadow-emerald-500/10" : "bg-amber-50 dark:bg-amber-900/20 shadow-md shadow-amber-500/10") : isDark ? "bg-white/[0.02]" : "bg-white"}
              ${borderClass} hover:border-opacity-100 active:scale-[0.98]`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${val === "ai" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"}`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[13px] font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{label}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>{badge}</span>
              </div>
              <div className={`text-[13px] font-black mb-0.5 ${val === "ai" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-500"}`}>{price}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</div>
            </div>
          </motion.button>
        ))}
      </motion.div>
    );
  }

  // ── consult-details / consult-next-details / consult-specific-details ──
  if (step === "consult-details" || step === "consult-next-details" || step === "consult-specific-details") {
    const nextStep: WaStep = step === "consult-details" ? "payment-summary" : step === "consult-next-details" ? "consult-next-modality" : "consult-specific-modality";
    const modalityMap: Record<string, string> = { voice: "صوت", video: "فيديو", text: "كتابة", person: "حضوري" };
    
    let descPlaceholder = "اشرح مشكلتك باختصار...";
    if (actorContext?.roleLabel) {
      if (userCategory === "government") {
        if (actorContext.roleKey === "judge") descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح القضية أو الحكم المراد ترجيحه...`;
        else if (actorContext.roleKey === "prosecutor") descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح الواقعة أو الأدلة المراد تحليلها...`;
        else if (actorContext.roleKey === "officer") descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح الحادثة أو الإجراء الأمني...`;
        else descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح التحدي القانوني الخاص بالجهة...`;
      }
      else if (userCategory === "firm") {
        if (actorContext.roleKey === "trainee") descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح المسألة المراد البحث عنها أو الاستفسار التدريبي...`;
        else if (actorContext.roleKey === "hr_manager") descPlaceholder = `بصفتك (${actorContext.roleLabel}) بالمكتب، اشرح الاستفسار العمالي...`;
        else descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح الاستشارة المهنية المرتبطة بالمكتب...`;
      }
      else if (userCategory === "corporate" || userCategory === "business") descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح المشكلة التجارية أو التحدي القانوني...`;
      else if (userCategory === "ngo") descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح التحدي الخاص بالجمعية...`;
      else if (userCategory === "provider") descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح الاستفسار التشغيلي الخاص بخدماتك...`;
      else descPlaceholder = `بصفتك (${actorContext.roleLabel})، اشرح مشكلتك...`;
    } else {
      if (userCategory === "corporate" || userCategory === "business") descPlaceholder = "اشرح المشكلة التجارية أو التحدي القانوني للشركة...";
      else if (userCategory === "ngo") descPlaceholder = "اشرح التحدي الخاص بالجمعية أو استفسار الحوكمة...";
      else if (userCategory === "micro") descPlaceholder = "اشرح مشكلة المنشأة باختصار...";
      else if (userCategory === "government") descPlaceholder = "اشرح التحدي القانوني الخاص بالجهة...";
    }

    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        <motion.div variants={staggerItemVariants} className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] bg-[#0B3D2E]/10 dark:bg-emerald-900/30 text-[#0B3D2E] dark:text-emerald-400 rounded-full px-2.5 py-1 font-bold tracking-tight">استشارة قانونية</span>
          {selections.modality && <span className="text-[11px] font-bold bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-full px-2.5 py-1">{modalityMap[selections.modality] ?? selections.modality}</span>}
          {selections.provider && <span className="text-[11px] font-bold bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-full px-2.5 py-1">{selections.provider === "ai" ? "نظامي AI" : "محامي"}</span>}
        </motion.div>
        <motion.p variants={staggerItemVariants} className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>أضف كل ما تريد الاستفسار عنه — تفاصيل مشكلتك ومخاوفك وملاحظاتك.</motion.p>
        <motion.input
          variants={staggerItemVariants}
          id="consult-title"
          type="text"
          placeholder={userCategory === "corporate" || userCategory === "business" ? "عنوان الموضوع التجاري (اختياري)" : "عنوان الموضوع (اختياري)"}
          value={detailsTitle}
          onChange={e => setDetailsTitle(e.target.value)}
          aria-label="عنوان موضوع الاستشارة"
          className={`w-full rounded-[1.25rem] border px-4 py-3 text-[13px] font-medium outline-none transition-all focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/10 ${isDark ? "bg-white/[0.02] border-white/10 text-white placeholder:text-gray-600" : "bg-white border-gray-200/70 text-gray-800 placeholder:text-gray-400"}`}
        />
        <motion.textarea
          variants={staggerItemVariants}
          id="consult-desc"
          placeholder={descPlaceholder}
          value={detailsDesc}
          onChange={e => setDetailsDesc(e.target.value)}
          rows={3}
          aria-label="وصف مشكلتك القانونية"
          className={`w-full rounded-[1.25rem] border px-4 py-3 text-[13px] font-medium outline-none resize-none transition-all focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/10 ${isDark ? "bg-white/[0.02] border-white/10 text-white placeholder:text-gray-600" : "bg-white border-gray-200/70 text-gray-800 placeholder:text-gray-400"}`}
        />
        <motion.button variants={staggerItemVariants} className={`w-full flex items-center justify-center gap-2 rounded-[1.25rem] border-2 border-dashed py-2.5 text-[12px] font-bold transition-all active:scale-[0.98] ${isDark ? "border-white/20 text-gray-400 hover:text-emerald-400 hover:bg-white/5 hover:border-emerald-500/50" : "border-gray-300 text-gray-500 hover:text-[#0B3D2E] hover:bg-gray-50 hover:border-[#0B3D2E]/50"}`}
          aria-label="إرفاق ملف بالاستشارة">
          <Paperclip size={16} /> إرفاق ملف (اختياري)
        </motion.button>
        <motion.button
          variants={staggerItemVariants}
          disabled={detailsDesc.trim().length < 3}
          onClick={() => onNavigate(nextStep)}
          className="w-full mt-2 py-3.5 rounded-[1.25rem] bg-[#0B3D2E] text-white text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0d4d39] active:scale-[0.98] transition-all shadow-lg shadow-[#0B3D2E]/20"
        >
          استمرار
        </motion.button>
      </motion.div>
    );
  }

  // ── consult-next-modality / consult-specific-modality ──
  if (step === "consult-next-modality" || step === "consult-specific-modality") {
    const nextStep: WaStep = step === "consult-next-modality" ? "payment-summary" : "consult-calendar";
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        <motion.p variants={staggerItemVariants} className="text-xs font-medium text-[#0B3D2E] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-3 py-2">
          جميع الطرق متاحة بما فيها الحضوري
        </motion.p>
        <motion.div variants={staggerListVariants} className="grid grid-cols-2 gap-2">
          {([
            { icon: <Microphone size={18} weight="fill" />, label: "صوت", val: "voice" },
            { icon: <VideoCamera size={18} weight="fill" />, label: "فيديو", val: "video" },
            { icon: <ChatText size={18} weight="fill" />, label: "كتابة", val: "text" },
            { icon: <Storefront size={18} weight="fill" />, label: "حضوري", val: "person" },
          ] as const).map(({ icon, label, val }) => (
            <motion.button
              variants={staggerItemVariants}
              key={val}
              aria-pressed={selections.modality === val}
              onClick={() => { onSelect("modality", val); onNavigate(nextStep); }}
              className={`flex items-center gap-2 px-3 py-3 rounded-[1.25rem] border text-start transition-all text-[13px] font-bold active:scale-[0.98] ${
                selections.modality === val
                  ? "bg-[#0B3D2E] border-[#0B3D2E] text-white shadow-md shadow-[#0B3D2E]/20"
                  : isDark ? "border-white/[0.08] bg-white/[0.02] text-white hover:bg-white/[0.06]" : "border-gray-200/70 bg-white text-gray-800 hover:bg-gray-50"
              }`}
            >
              <span className={selections.modality === val ? "text-white" : "text-[#0B3D2E] dark:text-emerald-400"}>{icon}</span>
              {label}
            </motion.button>
          ))}
        </motion.div>
      </motion.div>
    );
  }

  // ── consult-calendar ──
  if (step === "consult-calendar") {
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        <motion.nav variants={staggerItemVariants} aria-label="اختر اليوم" className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide snap-x">
          {MOCK_DAYS.map(d => (
            <button
              key={d.date}
              aria-pressed={calDay === d.date}
              onClick={() => { setCalDay(d.date); setCalSlot(null); }}
              className={`shrink-0 flex flex-col items-center rounded-2xl border px-3 py-2.5 transition-all active:scale-[0.98] snap-start ${
                calDay === d.date
                  ? "bg-[#0B3D2E] border-[#0B3D2E] text-white shadow-md shadow-[#0B3D2E]/20"
                  : isDark ? "border-white/[0.08] bg-white/[0.02] text-gray-300 hover:bg-white/[0.06]" : "border-gray-200/70 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="font-bold text-[13px]">{d.label}</span>
              <span className="text-[10px] opacity-70 font-medium mt-0.5">{d.date}</span>
            </button>
          ))}
        </motion.nav>
        <AnimatePresence mode="wait">
          {calDay && (
            <motion.div
              key="slots"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2 pt-1" role="group" aria-label="اختر الوقت المناسب"
            >
              {MOCK_DAYS.find(d => d.date === calDay)?.slots.map((s, idx) => (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }}
                  key={s}
                  aria-pressed={calSlot === s}
                  onClick={() => setCalSlot(s)}
                  className={`rounded-xl border px-3 py-2 text-[12px] font-bold transition-all active:scale-[0.95] ${
                    calSlot === s
                      ? "bg-[#C8A762] border-[#C8A762] text-white shadow-md shadow-[#C8A762]/20"
                      : isDark ? "border-white/[0.08] bg-white/[0.02] text-gray-300 hover:bg-white/[0.06]" : "border-gray-200/70 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {s}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          variants={staggerItemVariants}
          disabled={!calDay || !calSlot}
          onClick={() => { onSelect("calDay", calDay ?? ""); onSelect("calSlot", calSlot ?? ""); onNavigate("payment-summary"); }}
          className="w-full mt-2 py-3.5 rounded-[1.25rem] bg-[#0B3D2E] text-white text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0d4d39] active:scale-[0.98] transition-all shadow-lg shadow-[#0B3D2E]/20"
        >
          تأكيد الموعد
        </motion.button>
      </motion.div>
    );
  }

  return null;
}
