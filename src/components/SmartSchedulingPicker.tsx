"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Lightning,
  CalendarBlank,
  Sparkle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  Bell,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SchedulingChoice = "earliest" | "calendar" | "instant" | null;

interface Props {
  mode: "consultation" | "case"; // consultation: 3 options, case: 2 options (no instant)
  selected: SchedulingChoice;
  onSelect: (c: SchedulingChoice) => void;
  isRTL: boolean;
  isDark: boolean;
}

// ─── Mock calendar data ───────────────────────────────────────────────────────

const MOCK_SLOTS = [
  { day: "الأحد", dayEn: "Sun", date: "6", slots: ["10:00", "14:00"] },
  { day: "الاثنين", dayEn: "Mon", date: "7", slots: ["09:00", "11:00", "16:00"] },
  { day: "الثلاثاء", dayEn: "Tue", date: "8", slots: [] },
  { day: "الأربعاء", dayEn: "Wed", date: "9", slots: ["10:00", "13:00"] },
  { day: "الخميس", dayEn: "Thu", date: "10", slots: ["09:00", "15:00", "17:00"] },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SmartSchedulingPicker({ mode, selected, onSelect, isRTL, isDark }: Props) {
  const [calendarSlot, setCalendarSlot] = useState<string | null>(null);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  const base = isDark
    ? "border-white/10 bg-white/5 hover:bg-white/10"
    : "border-slate-200 bg-white hover:bg-slate-50";

  const selectedBase = isDark
    ? "border-[#C8A762]/40 bg-[#C8A762]/10"
    : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5";

  const handleCalendarConfirm = () => {
    if (calendarSlot && calendarDay) {
      setShowCalendar(false);
      onSelect("calendar");
    }
  };

  const options = [
    {
      id: "earliest" as SchedulingChoice,
      icon: Lightning,
      labelAr: "أقرب وقت متاح",
      labelEn: "Next Available Slot",
      descAr: "النظام يُشعرك فور توفر موعد (منصة + واتساب)",
      descEn: "We notify you the moment a slot opens (platform + WhatsApp)",
      multiplierAr: "×١.٢٥",
      multiplierEn: "×1.25",
      multiplierLabel: "ASAP",
      accentClass: "text-amber-500",
      bgClass: isDark ? "bg-amber-500/10" : "bg-amber-50",
      borderActive: "border-amber-400/50",
      multiplierColor: "text-amber-500",
    },
    {
      id: "calendar" as SchedulingChoice,
      icon: CalendarBlank,
      labelAr: "اختار من المتاح",
      labelEn: "Pick from Available",
      descAr: "تقويم أسبوعي بـ Slots خضراء — اختار ما يناسبك",
      descEn: "Weekly calendar with green slots — pick what works",
      multiplierAr: "×١.٠",
      multiplierEn: "×1.0",
      multiplierLabel: "Standard",
      accentClass: "text-emerald-600 dark:text-emerald-400",
      bgClass: isDark ? "bg-emerald-500/10" : "bg-emerald-50",
      borderActive: "border-emerald-400/50",
      multiplierColor: "text-emerald-500",
    },
    ...(mode === "consultation"
      ? [
          {
            id: "instant" as SchedulingChoice,
            icon: Sparkle,
            labelAr: "الآن فوري",
            labelEn: "Right Now",
            descAr: "خلال ١٥–٢٠ دقيقة من تقديم الطلب — إذا لم يتوفر محامٍ يتحول لـ 'أقرب وقت' تلقائياً",
            descEn: "Within 15–20 minutes of submitting — if no lawyer found, auto-switches to Next Available",
            multiplierAr: "×١.٧٥",
            multiplierEn: "×1.75",
            multiplierLabel: "Premium",
            accentClass: "text-royal dark:text-blue-400",
            bgClass: isDark ? "bg-blue-500/10" : "bg-blue-50",
            borderActive: "border-blue-400/50",
            multiplierColor: "text-blue-500",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="mb-4">
        <h3 className="text-base font-bold" style={{ color: isDark ? "#e5e7eb" : "#111" }}>
          {isRTL
            ? mode === "consultation" ? "متى تريد استشارتك؟" : "متى تريد جلسة الدراسة؟"
            : mode === "consultation" ? "When do you want your consultation?" : "When to schedule the study session?"}
        </h3>
        {mode === "case" && (
          <p className="mt-1 text-xs" style={{ color: isDark ? "#9ca3af" : "#6b7280" }}>
            {isRTL
              ? "جلسة الدراسة مدفوعة — يُخصم مبلغها لاحقاً من أتعاب التمثيل عند توقيع التوكيل"
              : "Study session is paid — its fee is deducted from representation fees upon signing power of attorney"}
          </p>
        )}
      </div>

      {/* Options */}
      {options.map((opt) => {
        const Icon = opt.icon;
        const isSelected = selected === opt.id;
        return (
          <motion.button
            key={opt.id}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => {
              onSelect(opt.id);
              if (opt.id === "calendar") setShowCalendar(true);
              else setShowCalendar(false);
            }}
            className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-start transition-all ${
              isSelected ? `${opt.borderActive} ${opt.bgClass}` : base
            }`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isSelected ? opt.bgClass : isDark ? "bg-white/10" : "bg-slate-100"
            } ${opt.accentClass}`}>
              <Icon size={22} weight={isSelected ? "fill" : "duotone"} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: isDark ? "#e5e7eb" : "#111" }}>
                  {isRTL ? opt.labelAr : opt.labelEn}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                  isSelected ? "bg-white/20 text-white" : `${isDark ? "bg-white/10" : "bg-slate-100"} ${opt.multiplierColor}`
                }`}>
                  {isRTL ? opt.multiplierAr : opt.multiplierEn}
                </span>
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`ms-auto text-emerald-500`}
                  >
                    <CheckCircle size={17} weight="fill" />
                  </motion.span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: isDark ? "#9ca3af" : "#6b7280" }}>
                {isRTL ? opt.descAr : opt.descEn}
              </p>
            </div>
          </motion.button>
        );
      })}

      {/* ── Calendar picker (shown when "calendar" selected) ── */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className={`mt-1 rounded-2xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
              {/* Week header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: isDark ? "#e5e7eb" : "#374151" }}>
                  {isRTL ? "يونيو ٢٠٢٦" : "June 2026"}
                </span>
                <div className="flex gap-1">
                  <button className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${isDark ? "hover:bg-white/10" : "hover:bg-slate-200"}`}>
                    {isRTL ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
                  </button>
                  <button className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${isDark ? "hover:bg-white/10" : "hover:bg-slate-200"}`}>
                    {isRTL ? <ArrowLeft size={12} /> : <ArrowRight size={12} />}
                  </button>
                </div>
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {MOCK_SLOTS.map((d) => {
                  const hasFree = d.slots.length > 0;
                  const isActive = calendarDay === d.day;
                  return (
                    <button
                      key={d.day}
                      disabled={!hasFree}
                      onClick={() => { setCalendarDay(d.day); setCalendarSlot(null); }}
                      className={`flex flex-col items-center gap-1 rounded-xl py-2 text-center transition-all ${
                        !hasFree
                          ? "opacity-30 cursor-not-allowed"
                          : isActive
                            ? "bg-[#0B3D2E] text-white"
                            : isDark
                              ? "bg-white/5 hover:bg-white/15 text-gray-300"
                              : "bg-white hover:bg-emerald-50 text-slate-700 border border-slate-200"
                      }`}
                    >
                      <span className="text-[10px] font-medium opacity-70">{isRTL ? d.day.slice(0, 3) : d.dayEn}</span>
                      <span className="text-sm font-bold">{d.date}</span>
                      {hasFree && (
                        <span className={`text-[9px] font-semibold ${isActive ? "text-emerald-300" : "text-emerald-500"}`}>
                          {d.slots.length} {isRTL ? "وقت" : "slots"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Time slots */}
              {calendarDay && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3"
                >
                  <p className="mb-2 text-[11px] font-semibold" style={{ color: isDark ? "#9ca3af" : "#6b7280" }}>
                    {isRTL ? "الأوقات المتاحة" : "Available times"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(MOCK_SLOTS.find(d => d.day === calendarDay)?.slots ?? []).map((t) => (
                      <motion.button
                        key={t}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setCalendarSlot(t)}
                        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                          calendarSlot === t
                            ? "bg-[#C8A762] text-white shadow-sm"
                            : isDark
                              ? "bg-white/10 text-gray-300 hover:bg-white/20"
                              : "bg-white text-slate-700 border border-slate-200 hover:border-emerald-400"
                        }`}
                      >
                        <Clock size={11} />
                        {t}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Confirm CTA */}
              <motion.button
                whileHover={{ scale: calendarSlot ? 1.02 : 1 }}
                whileTap={{ scale: calendarSlot ? 0.98 : 1 }}
                onClick={handleCalendarConfirm}
                disabled={!calendarSlot}
                className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  calendarSlot
                    ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328]"
                    : isDark
                      ? "bg-white/5 text-gray-600 cursor-not-allowed"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                {calendarSlot
                  ? isRTL ? `تأكيد: ${calendarDay} - ${calendarSlot}` : `Confirm: ${calendarDay} at ${calendarSlot}`
                  : isRTL ? "اختار يوماً ووقتاً" : "Select a day and time"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Earliest registered banner ── */}
      <AnimatePresence>
        {selected === "earliest" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className={`flex items-start gap-3 rounded-2xl border p-3.5 ${
              isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"
            }`}
          >
            <Bell size={18} weight="duotone" className="shrink-0 mt-0.5 text-amber-500" />
            <p className="text-xs leading-relaxed" style={{ color: isDark ? "#d1d5db" : "#374151" }}>
              {isRTL
                ? "سيتم إشعارك فور توفر أقرب موعد عبر المنصة والواتساب — لديك ٣٠ دقيقة للتأكيد قبل انتقال الـ Slot لغيرك"
                : "You'll be notified the moment a slot opens via platform & WhatsApp — you have 30 minutes to confirm before it goes to someone else"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Instant banner ── */}
      <AnimatePresence>
        {selected === "instant" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className={`flex items-start gap-3 rounded-2xl border p-3.5 ${
              isDark ? "border-blue-500/20 bg-blue-500/5" : "border-blue-200 bg-blue-50"
            }`}
          >
            <Sparkle size={18} weight="duotone" className="shrink-0 mt-0.5 text-royal" />
            <p className="text-xs leading-relaxed" style={{ color: isDark ? "#d1d5db" : "#374151" }}>
              {isRTL
                ? "نبحث عن محامٍ متاح الآن — تصلك إجابة خلال ١٥–٢٠ دقيقة. إذا لم يتوفر محامٍ يتحول طلبك تلقائياً لـ 'أقرب وقت متاح'"
                : "Searching for an available lawyer now — expect a response within 15–20 minutes. If unavailable, your request auto-switches to Next Available Slot"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
