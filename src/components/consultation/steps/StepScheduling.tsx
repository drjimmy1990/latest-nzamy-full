import { motion, AnimatePresence } from "framer-motion";
import { Lightning, Bell, CalendarBlank, CheckCircle } from "@phosphor-icons/react";
import { TypeDef, ConsultationType, ScheduleMode, calendarSlots } from "@/components/consultation/constants";

/**
 * WHAT CHANGED HERE, AND WHY
 *
 * 1. The «الآن فوري» card ran a 2200 ms sleep behind a spinner reading «نبحث
 *    عن محامٍ متاح» and then announced «تم العثور على محامٍ متاح! أ. أحمد
 *    الغامدي — خبرة ١٢ عاماً — متاح الآن», five gold stars included. No search
 *    existed, and neither did that lawyer. It is now a plain timing preference
 *    the client confirms — which is the only thing this step was ever able to
 *    collect, since fulfilment is manual from the admin queue.
 * 2. Every «١٥–٢٠ دقيقة» is gone. Nothing in the system can hold the team to
 *    an interval, so quoting one on the booking screen was a promise the app
 *    had no way to keep.
 * 3. The weekly grid is labelled as PREFERRED times, not available ones.
 *    `calendarSlots` in ./constants is a hardcoded April table with no
 *    connection to any lawyer's calendar; presenting it as availability told
 *    the client a slot was held for them. Reported in `skipped` — replacing it
 *    needs an availability source that does not exist yet.
 * 4. Prices read «تقديري» and no longer carry ×1.75 / ×1.25 multipliers.
 *    Per the owner's ruling of 26 August the client submits free and the team
 *    quotes afterwards, so no multiplier is ever applied at booking.
 */

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
  /** The client confirmed «الأسرع الممكن» as their preference. */
  instantConfirmed: boolean;
  setInstantConfirmed: (b: boolean) => void;
}

export function StepScheduling({
  isAr, typeList, consultType, setConsultType, scheduleMode, setScheduleMode,
  calDay, setCalDay, calTime, setCalTime, asapDone, setAsapDone,
  instantConfirmed, setInstantConfirmed,
}: StepSchedulingProps) {
  return (
    <div>
      <h2 className="mb-1 font-brand text-lg font-bold text-ink">
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
              onClick={() => { setConsultType(t.id); setScheduleMode(null); setCalDay(null); setCalTime(null); setInstantConfirmed(false); setAsapDone(false); }}
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
                <div className={`text-xs font-bold ${isSelected ? "text-white" : "text-ink"}`}>{t.label}</div>
                {/* Labelled an estimate at the point of choice, not only on the
                    review step: this is where the client decides, and a bare
                    figure here reads as the price they are about to be charged. */}
                <div className={`text-[10px] ${isSelected ? "text-white/70" : "text-ink-faint dark:text-gray-500"}`}>
                  {isAr ? `تقديري: ${t.price}` : `Est. ${t.price}`}
                </div>
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
              <p className="mb-1 text-sm font-semibold text-ink">
                {isAr ? "متى تفضّل الاستشارة؟" : "When would you prefer the consultation?"}
              </p>
              <p className="mb-3 text-[11px] text-ink-faint dark:text-gray-500">
                {isAr
                  ? "هذا تفضيل يصل مع طلبك — يؤكّده فريق نظامي عند التواصل معك."
                  : "This is a preference sent with your request — the Nezamy team confirms it when they contact you."}
              </p>

              {/* 3 big cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                {/* Instant */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setScheduleMode("instant"); setCalDay(null); setCalTime(null); setAsapDone(false); setInstantConfirmed(false); }}
                  className={`flex flex-col gap-2 rounded-2xl border-2 p-4 text-start transition-all ${
                    scheduleMode === "instant"
                      ? "border-royal bg-royal/5 dark:bg-royal/10"
                      : "border-slate-200 hover:border-royal/30 dark:border-white/10"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal/10 text-royal dark:text-gold">
                    <Lightning size={20} weight="duotone" />
                  </span>
                  <div className="font-brand text-sm font-bold text-ink">
                    {isAr ? "🟢 الأسرع الممكن" : "🟢 As Soon As Possible"}
                  </div>
                  <div className="text-[11px] leading-relaxed text-ink-muted dark:text-gray-400">
                    {isAr ? "يُعطى طلبك أولوية في قائمة الفريق" : "Your request is prioritised in the team's queue"}
                  </div>
                </motion.button>

                {/* ASAP */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setScheduleMode("asap"); setCalDay(null); setCalTime(null); setInstantConfirmed(false); }}
                  className={`flex flex-col gap-2 rounded-2xl border-2 p-4 text-start transition-all ${
                    scheduleMode === "asap"
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10"
                      : "border-slate-200 hover:border-amber-300 dark:border-white/10"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20">
                    <Bell size={20} weight="duotone" />
                  </span>
                  <div className="font-brand text-sm font-bold text-ink">
                    {isAr ? "⚡ أول وقت يتوفر" : "⚡ First Available Time"}
                  </div>
                  <div className="text-[11px] leading-relaxed text-ink-muted dark:text-gray-400">
                    {isAr ? "نخبرك عند تحديد موعد مناسب لتخصصك" : "We notify you once a suitable time is set"}
                  </div>
                </motion.button>

                {/* Calendar */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setScheduleMode("calendar"); setInstantConfirmed(false); setAsapDone(false); }}
                  className={`flex flex-col gap-2 rounded-2xl border-2 p-4 text-start transition-all ${
                    scheduleMode === "calendar"
                      ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-slate-200 hover:border-emerald-300 dark:border-white/10"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20">
                    <CalendarBlank size={20} weight="duotone" />
                  </span>
                  <div className="font-brand text-sm font-bold text-ink">
                    {isAr ? "📅 حدّد وقتاً تفضّله" : "📅 Suggest a Time"}
                  </div>
                  <div className="text-[11px] leading-relaxed text-ink-muted dark:text-gray-400">
                    {isAr ? "اقترح يوماً ووقتاً يناسبك خلال الأسبوع" : "Suggest a day and time that suits you this week"}
                  </div>
                </motion.button>
              </div>

              {/* Instant state */}
              <AnimatePresence>
                {scheduleMode === "instant" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-4">
                    {instantConfirmed ? (
                      <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <CheckCircle size={32} weight="fill" className="shrink-0 text-emerald-500" />
                        <div>
                          <div className="font-bold text-emerald-800 dark:text-emerald-300">{isAr ? "سُجِّل تفضيلك" : "Preference recorded"}</div>
                          {/* States what will be sent, and nothing about who
                              will take it — no lawyer has been assigned at this
                              point and no code path assigns one. */}
                          <div className="text-sm text-emerald-600 dark:text-emerald-400">
                            {isAr
                              ? "سيصل طلبك لفريق نظامي بعلامة «الأسرع الممكن»."
                              : "Your request reaches the Nezamy team marked “as soon as possible”."}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-2xl border border-royal/20 bg-royal/5 p-6 text-center dark:bg-royal/10">
                        <Lightning size={28} weight="duotone" className="text-royal dark:text-gold" />
                        <p className="text-sm text-ink-muted dark:text-gray-400">
                          {isAr
                            ? "يُراجع فريق نظامي الطلبات يدوياً ويتواصل معك لتأكيد الموعد والسعر."
                            : "The Nezamy team reviews requests manually and contacts you to confirm the time and price."}
                        </p>
                        <motion.button
                          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          onClick={() => setInstantConfirmed(true)}
                          className="rounded-xl bg-royal px-5 py-2 text-sm font-bold text-white"
                        >
                          {isAr ? "أفضّل الأسرع الممكن" : "I prefer the soonest"}
                        </motion.button>
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
                          {/* «تم تسجيل طلبك» here was the second false claim on
                              this step: nothing was registered — the request is
                              only created on the last step, by submitBooking(). */}
                          <div className="font-bold text-amber-800 dark:text-amber-300">{isAr ? "سُجِّل تفضيلك" : "Preference recorded"}</div>
                          <div className="text-sm text-amber-600 dark:text-amber-400">{isAr ? "سيصل طلبك بعلامة «أول وقت يتوفر»" : "Your request will be marked “first available time”"}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
                        <Bell size={28} weight="duotone" className="text-amber-500" />
                        <p className="text-sm text-amber-700 dark:text-amber-300">{isAr ? "يتواصل معك فريق نظامي عند تحديد موعد يناسب تخصص قضيتك." : "The Nezamy team contacts you once a time is set for your case type."}</p>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setAsapDone(true)} className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white">
                          {isAr ? "أفضّل أول وقت يتوفر" : "I prefer the first available"}
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
                            <span className={`text-xs font-bold ${isActive ? "text-white" : "text-ink"}`}>{d.date.split(" ")[0]}</span>
                            {hasFree && <span className={`h-1 w-1 rounded-full ${isActive ? "bg-white/50" : "bg-emerald-400"}`} />}
                          </motion.button>
                        );
                      })}
                    </div>
                    {/* Time slots */}
                    <AnimatePresence>
                      {calDay && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 overflow-hidden">
                          {/* «المواعيد المتاحة» said a slot was held. `calendarSlots`
                              is a fixed table in ./constants with no link to any
                              lawyer's calendar, so this can only be the time the
                              client would prefer — see the note at the top. */}
                          <p className="mb-2 text-xs font-semibold text-ink-muted dark:text-gray-400">{isAr ? `اختر وقتاً تفضّله — ${calDay}` : `Pick a preferred time — ${calDay}`}</p>
                          <div className="flex flex-wrap gap-2">
                            {(calendarSlots.find(d => (isAr ? d.dayAr : d.dayEn) === calDay)?.times ?? []).map(t => (
                              <motion.button key={t} whileTap={{ scale: 0.95 }} onClick={() => setCalTime(t)}
                                className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                                  calTime === t ? "bg-[#C8A762] text-white shadow-sm" : "border border-slate-200 bg-white hover:border-[#C8A762]/50 dark:border-white/10 dark:bg-dark-bg dark:hover:border-gold/30 text-ink"
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
