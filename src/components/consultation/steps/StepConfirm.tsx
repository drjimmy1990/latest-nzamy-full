import { motion } from "framer-motion";
import { CheckCircle, ShieldCheck } from "@phosphor-icons/react";
import { SpecialtyDef, TypeDef, ConsultationType, ScheduleMode } from "@/components/consultation/constants";
import Link from "next/link";

interface StepConfirmProps {
  isAr: boolean;
  confirmed: boolean;
  setConfirmed: (b: boolean) => void;
  selectedSpecialty?: SpecialtyDef;
  description: string;
  consultType: ConsultationType | null;
  selectedType?: TypeDef;
  scheduleMode: ScheduleMode;
  calDay: string | null;
  calTime: string | null;
}

export function StepConfirm({
  isAr, confirmed, setConfirmed, selectedSpecialty, description,
  consultType, selectedType, scheduleMode, calDay, calTime
}: StepConfirmProps) {
  if (confirmed) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
          className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 dark:bg-emerald-500/10">
          <CheckCircle size={44} weight="fill" className="text-emerald-500" />
        </motion.div>
        <h2 className="font-brand text-2xl font-extrabold text-ink dark:text-gray-100">
          {isAr ? "تم الحجز بنجاح!" : "Booking Confirmed!"}
        </h2>
        <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
          {isAr
            ? scheduleMode === "asap" ? "سنرسل لك إشعاراً فور توفر المحامي المناسب"
            : scheduleMode === "instant" ? "سيتواصل معك المحامي خلال ١٥–٢٠ دقيقة"
            : `موعدك: ${calDay} — ${calTime}`
            : scheduleMode === "asap" ? "We'll notify you when a suitable lawyer is available"
            : scheduleMode === "instant" ? "The lawyer will contact you within 15–20 minutes"
            : `Your appointment: ${calDay} at ${calTime}`}
        </p>
        <div className="mx-auto mt-6 max-w-[300px] rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-start dark:border-emerald-500/20 dark:bg-emerald-500/10">
          <div className="space-y-2 text-xs text-emerald-700 dark:text-emerald-300">
            <div className="flex items-center gap-2"><CheckCircle size={13} weight="fill" />{isAr ? "رقم الطلب: #CL-20260330" : "Order #: #CL-20260330"}</div>
            <div className="flex items-center gap-2"><CheckCircle size={13} weight="fill" />{isAr ? `التخصص: ${selectedSpecialty?.label}` : `Specialty: ${selectedSpecialty?.label}`}</div>
            <div className="flex items-center gap-2"><CheckCircle size={13} weight="fill" />{isAr ? `النوع: ${selectedType?.label}` : `Type: ${selectedType?.label}`}</div>
            <div className="flex items-center gap-2"><CheckCircle size={13} weight="fill" />{isAr ? `التكلفة: ${selectedType?.price}` : `Cost: ${selectedType?.price}`}</div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard/client" className="rounded-2xl bg-royal px-6 py-3 text-sm font-semibold text-white">
            {isAr ? "عودة للداشبورد" : "Back to Dashboard"}
          </Link>
          <Link href="/notifications" className="rounded-2xl border border-slate-200 px-6 py-3 text-sm text-ink-muted dark:border-white/10 dark:text-gray-400">
            {isAr ? "متابعة الطلب" : "Track Request"}
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <h2 className="mb-5 font-brand text-lg font-bold text-ink dark:text-gray-100">
        {isAr ? "مراجعة وتأكيد" : "Review & Confirm"}
      </h2>
      <div className="space-y-3">
        {[
          { labelAr: "التخصص", labelEn: "Specialty", value: selectedSpecialty?.label },
          { labelAr: "وصف المشكلة", labelEn: "Issue Description", value: description.slice(0, 80) + (description.length > 80 ? "..." : "") },
          { labelAr: "نوع الاستشارة", labelEn: "Consultation Type", value: isAr ? `${selectedType?.label} — ${selectedType?.price}` : `${selectedType?.label} — ${selectedType?.price}` },
          {
            labelAr: "الموعد", labelEn: "Timing",
            value: consultType === "ai"
              ? (isAr ? "فوري — AI" : "Instant — AI")
              : scheduleMode === "instant"
                ? (isAr ? "الآن فوري (١٥–٢٠ دقيقة)" : "Right Now (15–20 min)")
                : scheduleMode === "asap"
                  ? (isAr ? "أقرب وقت متاح" : "Next Available Slot")
                  : `${calDay} — ${calTime}`,
          },
        ].map((row, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-surface p-3.5 dark:border-white/10 dark:bg-dark-bg">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-royal/5">
              <CheckCircle size={11} weight="fill" className="text-royal dark:text-gold" />
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint dark:text-gray-600">{isAr ? row.labelAr : row.labelEn}</div>
              <div className="text-sm text-ink dark:text-gray-200">{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-xl border border-gold/20 bg-gold/5 p-4">
        <ShieldCheck size={20} weight="duotone" className="shrink-0 text-gold-dark" />
        <p className="text-xs leading-relaxed text-ink-muted dark:text-gray-400">
          {isAr
            ? "مبلغ الاستشارة محجوز في نظام Escrow ولا يُحوَّل للمحامي إلا بعد إتمام الجلسة وتأكيدك."
            : "The consultation fee is held in Escrow and is only transferred to the lawyer after the session completes and you confirm."}
        </p>
      </div>

      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setConfirmed(true)}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-royal py-4 text-sm font-bold text-white shadow-[0_4px_20px_-4px_rgba(11,61,46,0.4)]">
        <ShieldCheck size={18} weight="fill" />
        {isAr ? "تأكيد واستمرار للدفع" : "Confirm & Proceed to Payment"}
      </motion.button>
    </div>
  );
}
