import { motion, AnimatePresence } from "framer-motion";
import { Lightning, Bell, CalendarBlank, CheckCircle, Star, Spinner } from "@phosphor-icons/react";
import { TypeDef, ConsultationType, ScheduleMode, calendarSlots } from "@/components/consultation/constants";

interface StepSchedulingProps {
  isAr: boolean;
  typeList: TypeDef[];
  consultType: ConsultationType | null;
  setConsultType: (t: ConsultationType | null) => void;
  scheduleMode: ScheduleMode;
  setScheduleMode: (m: ScheduleMode) => void;
  calDay: string | null;
  setCalDay: (d: string | null) => void;
  calTime: string | null;
  setCalTime: (t: string | null) => void;
  asapDone: boolean;
  setAsapDone: (b: boolean) => void;
  instantSearching: boolean;
  setInstantSearching: (b: boolean) => void;
  instantFound: boolean;
  setInstantFound: (b: boolean) => void;
  handleInstantSearch: () => void;
}

export function StepScheduling({
  isAr, typeList, consultType, setConsultType, scheduleMode, setScheduleMode,
  calDay, setCalDay, calTime, setCalTime, asapDone, setAsapDone,
  instantSearching, setInstantSearching, instantFound, setInstantFound, handleInstantSearch
}: StepSchedulingProps) {
  return (
    <div>
      <h2 className="mb-1 font-brand text-lg font-bold text-ink dark:text-gray-100">
        {isAr ? "نوع الاستشارة والموعد" : "Consultation Type & Timing"}
      </h2>
      <p className="mb-5 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? "اختر طريقة الاستشارة ثم حدد وقتك المفضل" : "Choose consultation method then set your preferred time"}
      </p>

      {/* Type picker */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {typeList.map((t) => {
          const Icon = t.icon;
          const isSelected = consultType === t.id;
          return (
            <motion.button
              key={t.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setConsultType(t.id); setScheduleMode(null); setCalDay(null); setCalTime(null); setInstantFound(false); setInstantSearching(false); setAsapDone(false); }}
              className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all ${
                isSelected
                  ? "border-royal bg-royal text-white shadow-[0_4px_20px_-4px_rgba(11,61,46,0.25)]"
                  : `${t.color} bg-white dark:bg-dark-bg dark:border-white/10`
              }`}
            >
              {t.badge && (
                <span className={`absolute -top-2 start-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                  isSelected ? "bg-gold text-white" : "bg-gold/10 text-gold-dark"
                }`}>
                  {t.badge}
                </span>
              )}
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSelected ? "bg-white/15" : "bg-royal/5 dark:bg-white/5"}`}>
                <Icon size={20} weight="duotone" className={isSelected ? "text-white" : "text-royal dark:text-gold"} />
              </span>
              <div>
                <div className={`text-xs font-bold ${isSelected ? "text-white" : "text-ink dark:text-gray-200"}`}>{t.label}</div>
                <div className={`text-[10px] ${isSelected ? "text-white/70" : "text-ink-faint dark:text-gray-500"}`}>{t.price}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Scheduling (hidden for AI) */}
      <AnimatePresence>
        {consultType && consultType !== "ai" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-4 border-t border-slate-100 pt-5 dark:border-white/10">
              <p className="mb-3 text-sm font-semibold text-ink dark:text-gray-200">
                {isAr ? "متى تريد الاستشارة؟" : "When do you want the consultation?"}
              </p>

              {/* 3 big cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                {/* Instant */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setScheduleMode("instant"); setCalDay(null); setCalTime(null); setAsapDone(false); }}
                  className={`flex flex-col gap-2 rounded-2xl border-2 p-4 text-start transition-all ${
                    scheduleMode === "instant"
                      ? "border-royal bg-royal/5 dark:bg-royal/10"
                      : "border-slate-200 hover:border-royal/30 dark:border-white/10"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal/10 text-royal dark:text-gold">
                    <Lightning size={20} weight="duotone" />
                  </span>
                  <div className="font-brand text-sm font-bold text-ink dark:text-gray-100">
                    {isAr ? "🟢 الآن فوري" : "🟢 Right Now"}
                  </div>
                  <div className="text-[11px] leading-relaxed text-ink-muted dark:text-gray-400">
                    {isAr ? "خلال ١٥–٢٠ دقيقة — ×١.٧٥ من السعر" : "Within 15–20 min — ×1.75 price"}
                  </div>
                </motion.button>

                {/* ASAP */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setScheduleMode("asap"); setCalDay(null); setCalTime(null); setInstantFound(false); setInstantSearching(false); }}
                  className={`flex flex-col gap-2 rounded-2xl border-2 p-4 text-start transition-all ${
                    scheduleMode === "asap"
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10"
                      : "border-slate-200 hover:border-amber-300 dark:border-white/10"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20">
                    <Bell size={20} weight="duotone" />
                  </span>
                  <div className="font-brand text-sm font-bold text-ink dark:text-gray-100">
                    {isAr ? "⚡ أقرب وقت متاح" : "⚡ Next Available Slot"}
                  </div>
                  <div className="text-[11px] leading-relaxed text-ink-muted dark:text-gray-400">
                    {isAr ? "نخبرك فوراً عند توفر محامٍ — ×١.٢٥" : "We notify you when a lawyer is free — ×1.25"}
                  </div>
                </motion.button>

                {/* Calendar */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setScheduleMode("calendar"); setInstantFound(false); setInstantSearching(false); setAsapDone(false); }}
                  className={`flex flex-col gap-2 rounded-2xl border-2 p-4 text-start transition-all ${
                    scheduleMode === "calendar"
                      ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-slate-200 hover:border-emerald-300 dark:border-white/10"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20">
                    <CalendarBlank size={20} weight="duotone" />
                  </span>
                  <div className="font-brand text-sm font-bold text-ink dark:text-gray-100">
                    {isAr ? "📅 اختار من المتاح" : "📅 Pick from Calendar"}
                  </div>
                  <div className="text-[11px] leading-relaxed text-ink-muted dark:text-gray-400">
                    {isAr ? "تقويم أسبوعي — السعر الأساسي ×١.٠" : "Weekly calendar — base price ×1.0"}
                  </div>
                </motion.button>
              </div>

              {/* Instant state */}
              <AnimatePresence>
                {scheduleMode === "instant" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-4">
                    {instantFound ? (
                      <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <CheckCircle size={32} weight="fill" className="shrink-0 text-emerald-500" />
                        <div>
                          <div className="font-bold text-emerald-800 dark:text-emerald-300">{isAr ? "تم العثور على محامٍ متاح!" : "Available lawyer found!"}</div>
                          <div className="text-sm text-emerald-600 dark:text-emerald-400">{isAr ? "أ. أحمد الغامدي — خبرة ١٢ عاماً — متاح الآن" : "Ahmed Al-Ghamdi — 12 yrs exp — Available now"}</div>
                          <div className="mt-1 flex gap-1">{[1,2,3,4,5].map(s => <Star key={s} size={11} weight="fill" className="text-gold" />)}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-2xl border border-royal/20 bg-royal/5 p-6 text-center dark:bg-royal/10">
                        {instantSearching ? (
                          <>
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                              <Spinner size={28} className="text-royal dark:text-gold" />
                            </motion.div>
                            <p className="text-sm font-medium text-ink dark:text-gray-200">{isAr ? "نبحث عن محامٍ متاح الآن..." : "Searching for an available lawyer..."}</p>
                            <p className="text-xs text-ink-muted dark:text-gray-400">{isAr ? "عادةً خلال ١٥–٢٠ دقيقة" : "Usually within 15–20 minutes"}</p>
                          </>
                        ) : (
                          <>
                            <Lightning size={28} weight="duotone" className="text-royal dark:text-gold" />
                            <p className="text-sm text-ink-muted dark:text-gray-400">{isAr ? "سيتم البحث عن محامٍ متاح فور تأكيد الطلب" : "We'll search for an available lawyer upon booking confirmation"}</p>
                            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleInstantSearch} className="rounded-xl bg-royal px-5 py-2 text-sm font-bold text-white">
                              {isAr ? "ابحث الآن" : "Search Now"}
                            </motion.button>
                          </>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ASAP state */}
              <AnimatePresence>
                {scheduleMode === "asap" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-4">
                    {asapDone ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                        <Bell size={24} weight="fill" className="shrink-0 text-amber-500" />
                        <div>
                          <div className="font-bold text-amber-800 dark:text-amber-300">{isAr ? "تم تسجيل طلبك!" : "Request registered!"}</div>
                          <div className="text-sm text-amber-600 dark:text-amber-400">{isAr ? "سنرسل لك إشعاراً فور توفر محامٍ في تخصصك" : "We'll notify you as soon as a lawyer is available in your specialty"}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
                        <Bell size={28} weight="duotone" className="text-amber-500" />
                        <p className="text-sm text-amber-700 dark:text-amber-300">{isAr ? "سنتواصل معك فور توفر موعد في تخصصك. الإشعار عبر الواتساب والمنصة." : "We'll contact you when a slot opens in your specialty. Notification via WhatsApp and platform."}</p>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setAsapDone(true)} className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white">
                          {isAr ? "سجّل طلب الإشعار" : "Register for Notification"}
                        </motion.button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Calendar */}
              <AnimatePresence>
                {scheduleMode === "calendar" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-4">
                    {/* Days row */}
                    <div className="grid grid-cols-7 gap-1">
                      {calendarSlots.map(d => {
                        const hasFree = d.times.length > 0;
                        const isActive = calDay === (isAr ? d.dayAr : d.dayEn);
                        return (
                          <motion.button key={d.date} whileTap={{ scale: 0.94 }} disabled={!hasFree} onClick={() => { setCalDay(isAr ? d.dayAr : d.dayEn); setCalTime(null); }}
                            className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-center transition-all ${
                              !hasFree ? "cursor-not-allowed opacity-30" :
                              isActive ? "bg-royal text-white shadow-sm" :
                              "bg-slate-50 hover:bg-royal/5 dark:bg-white/5 dark:hover:bg-royal/10"
                            }`}>
                            <span className={`text-[9px] ${isActive ? "text-white/70" : "text-ink-faint dark:text-gray-500"}`}>{isAr ? d.dayAr.slice(0, 2) : d.dayEn}</span>
                            <span className={`text-xs font-bold ${isActive ? "text-white" : "text-ink dark:text-gray-200"}`}>{d.date.split(" ")[0]}</span>
                            {hasFree && <span className={`h-1 w-1 rounded-full ${isActive ? "bg-white/50" : "bg-emerald-400"}`} />}
                          </motion.button>
                        );
                      })}
                    </div>
                    {/* Time slots */}
                    <AnimatePresence>
                      {calDay && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 overflow-hidden">
                          <p className="mb-2 text-xs font-semibold text-ink-muted dark:text-gray-400">{isAr ? `المواعيد المتاحة — ${calDay}` : `Available slots — ${calDay}`}</p>
                          <div className="flex flex-wrap gap-2">
                            {(calendarSlots.find(d => (isAr ? d.dayAr : d.dayEn) === calDay)?.times ?? []).map(t => (
                              <motion.button key={t} whileTap={{ scale: 0.95 }} onClick={() => setCalTime(t)}
                                className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                                  calTime === t ? "bg-[#C8A762] text-white shadow-sm" : "border border-slate-200 bg-white hover:border-[#C8A762]/50 dark:border-white/10 dark:bg-dark-bg dark:hover:border-gold/30 text-ink dark:text-gray-200"
                                }`}>{t}</motion.button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
