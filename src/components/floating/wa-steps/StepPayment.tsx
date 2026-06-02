"use client";

import { motion } from "framer-motion";
import { AppleLogo, Bank, CreditCard, DeviceMobile } from "@phosphor-icons/react";
import { staggerListVariants, staggerItemVariants } from "./WaShared";
import type { WaStep } from "../types";

interface Props {
  step: WaStep;
  isDark: boolean;
  history: WaStep[];
  selections: Record<string, string>;
  onNavigate: (next: WaStep) => void;
  onSelect: (key: string, value: string) => void;
  onPaymentComplete: (paymentMethod: string) => void;
}

const PAYMENT_METHODS = [
  { label: "مدى", sub: "بطاقة مصرفية سعودية", icon: Bank, val: "mada", border: "border-green-200 dark:border-green-800/40", badge: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400", badgeLabel: "الأكثر شيوعاً" },
  { label: "Visa / Mastercard", sub: "بطاقة ائتمانية دولية", icon: CreditCard, val: "visa", border: "border-blue-200 dark:border-blue-800/40", badge: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", badgeLabel: "دولي" },
  { label: "STC Pay", sub: "محفظة STC", icon: DeviceMobile, val: "stc", border: "border-purple-200 dark:border-purple-800/40", badge: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", badgeLabel: "محلي" },
  { label: "Apple Pay", sub: "ادفع بـ Apple Pay", icon: AppleLogo, val: "apple", border: "border-gray-200 dark:border-white/10", badge: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300", badgeLabel: "سريع" },
];

export default function StepPayment({ step, isDark, history, selections, onNavigate, onSelect, onPaymentComplete }: Props) {
  // ── payment-summary ──
  if (step === "payment-summary") {
    const serviceName = (() => {
      if (history.some(h => h.startsWith("consult"))) return "استشارة قانونية";
      if (history.some(h => h.startsWith("contract"))) return "مراجعة عقد";
      if (history.some(h => h.startsWith("representation"))) return "تمثيل قضائي";
      if (history.some(h => h.startsWith("notary"))) return "توثيق رسمي";
      return "خدمة قانونية";
    })();

    const price = (() => {
      if (selections.provider === "ai") return "٥٠ ر.س";
      if (selections.provider === "lawyer") return "٧٠٠ ر.س";
      if (selections.contractService === "ai-review") return "١٥٠ ر.س";
      if (selections.contractService === "lawyer-review") return "٤٩٩ ر.س";
      return "يتم التحديد";
    })();
    const requiresPaymentChoice = price !== "يتم التحديد";

    const modalityLabel: Record<string, string> = { voice: "صوت", video: "فيديو", text: "كتابة", person: "حضوري" };

    const rows = [
      { label: "الخدمة", value: serviceName },
      ...(selections.modality ? [{ label: "الطريقة", value: modalityLabel[selections.modality] ?? selections.modality }] : []),
      ...(selections.provider ? [{ label: "المزود", value: selections.provider === "ai" ? "نظامي AI" : "محامي متخصص" }] : []),
      ...(selections.contractType ? [{ label: "نوع العقد", value: selections.contractType }] : []),
      ...(selections.specialty ? [{ label: "التخصص", value: selections.specialty }] : []),
      ...(selections.city ? [{ label: "المدينة", value: selections.city }] : []),
      ...(selections.notaryType ? [{ label: "نوع الوثيقة", value: selections.notaryType }] : []),
      ...(selections.urgency ? [{ label: "الاستعجال", value: selections.urgency === "urgent" ? "عاجل" : "عادي" }] : []),
      ...(selections.calDay && selections.calSlot ? [{ label: "الموعد", value: `${selections.calDay} – ${selections.calSlot}` }] : []),
      { label: "السعر", value: price },
    ];

    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        <motion.dl variants={staggerItemVariants} className={`rounded-[1.25rem] border divide-y overflow-hidden transition-all ${isDark ? "border-white/10 divide-white/10 bg-white/[0.02]" : "border-gray-200/70 divide-gray-100 bg-white"}`}>
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center px-4 py-3 text-[13px]">
              <dt className={`font-bold ${isDark ? "text-gray-400" : "text-gray-500"}`}>{label}</dt>
              <dd className={`font-black ${isDark ? "text-white" : "text-gray-900"}`}>{value}</dd>
            </div>
          ))}
        </motion.dl>
        <motion.p variants={staggerItemVariants} className="text-[11px] font-bold text-[#0B3D2E] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-3 py-2 text-center">
          {requiresPaymentChoice
            ? "بعد الاستشارة ستصلك نسخة PDF على واتساب بملخص الجلسة"
            : "لن يتم تحصيل أي مبلغ الآن — الطلب محلي وجاهز للربط بالباك إند"}
        </motion.p>
        <motion.button
          variants={staggerItemVariants}
          onClick={() => {
            if (requiresPaymentChoice) {
              onNavigate("payment-method");
              return;
            }
            onSelect("paymentMethod", "not_required");
            onPaymentComplete("not_required");
            onNavigate("success");
          }}
          className="w-full mt-1 py-3.5 rounded-[1.25rem] bg-[#0B3D2E] text-white text-[13px] font-bold hover:bg-[#0d4d39] active:scale-[0.98] transition-all shadow-lg shadow-[#0B3D2E]/20"
        >
          {requiresPaymentChoice ? "اختر طريقة الدفع" : "تأكيد الطلب والمتابعة"}
        </motion.button>
      </motion.div>
    );
  }

  // ── payment-method ──
  if (step === "payment-method") {
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        <motion.p variants={staggerItemVariants} className={`text-xs font-medium text-center ${isDark ? "text-gray-400" : "text-gray-500"}`}>جميع المدفوعات محمية بنظام Escrow</motion.p>
        {PAYMENT_METHODS.map(({ label, sub, icon: PaymentIcon, val, border, badge, badgeLabel }) => (
          <motion.button
            variants={staggerItemVariants}
            key={val}
            aria-pressed={selections.paymentMethod === val}
            onClick={() => { onSelect("paymentMethod", val); onPaymentComplete(val); onNavigate("success"); }}
            className={`w-full flex items-center gap-3.5 px-4 py-4 rounded-[1.25rem] border-2 text-start transition-all group relative overflow-hidden active:scale-[0.98] ${
              selections.paymentMethod === val ? "border-[#0B3D2E] bg-emerald-50 dark:bg-emerald-900/20 shadow-md shadow-[#0B3D2E]/10" : `${border} ${isDark ? "bg-white/[0.02]" : "bg-white"} hover:border-opacity-100 shadow-sm`
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            <span className="shrink-0 text-[#0B3D2E] dark:text-emerald-400" aria-hidden="true">
              <PaymentIcon size={22} weight="duotone" />
            </span>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className={`text-[13px] font-bold mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{label}</div>
              <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{sub}</div>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 tracking-tight ${badge}`}>{badgeLabel}</span>
          </motion.button>
        ))}
        <motion.p variants={staggerItemVariants} className={`text-[10px] text-center mt-1 font-medium opacity-60 ${isDark ? "text-gray-400" : "text-gray-500"}`}>جاهز للربط ببوابة دفع — بنية تحتية معدّة</motion.p>
      </motion.div>
    );
  }

  return null;
}
