"use client";

import { motion } from "framer-motion";
import { CheckCircle, WhatsappLogo, Headset } from "@phosphor-icons/react";
import { staggerListVariants, staggerItemVariants } from "./WaShared";

interface SuccessStepProps {
  isDark: boolean;
  onClose: () => void;
  workflow?: {
    id: string;
    href: string;
  } | null;
}

// ─── Order number is stable per widget open — stored in ref ──────────────────
export function StepSuccess({ isDark, onClose, workflow }: SuccessStepProps) {
  const orderId = workflow?.id ?? "WA-DEMO";

  return (
    <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col items-center gap-4 py-2 text-center relative">
      <motion.div
        variants={staggerItemVariants}
        className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center relative before:absolute before:inset-0 before:rounded-full before:bg-emerald-400/20 before:animate-ping"
      >
        <CheckCircle size={36} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400 relative z-10" />
      </motion.div>

      <motion.div variants={staggerItemVariants}>
        <p className={`text-[15px] font-black ${isDark ? "text-white" : "text-gray-900"}`}>
          رقم الطلب: <span className="font-mono text-[#C8A762] ml-1 bg-[#C8A762]/10 px-2 py-0.5 rounded-md">{orderId}</span>
        </p>
      </motion.div>

      <motion.div variants={staggerItemVariants} className={`w-full rounded-[1.25rem] border px-4 py-3.5 text-[12px] space-y-2 text-start font-medium leading-relaxed ${isDark ? "border-white/10 bg-white/[0.02]" : "border-gray-200/70 bg-gray-50/50"}`}>
        <p className={isDark ? "text-gray-300" : "text-gray-700"}>تم تسجيل الطلب محلياً حسب نوع حسابك ودورك، وهو جاهز للربط بالباك إند.</p>
        <p className={isDark ? "text-gray-300" : "text-gray-700"}>لا يوجد إرسال تلقائي الآن؛ زر واتساب يفتح رسالة متابعة واضحة لإرسالها بنفسك.</p>
      </motion.div>

      {workflow && (
        <motion.a
          variants={staggerItemVariants}
          href={workflow.href}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[1.25rem] bg-[#25D366] text-white text-[13px] font-bold hover:bg-[#1ebe5d] active:scale-[0.98] transition-all shadow-lg shadow-[#25D366]/20"
          aria-label="إرسال تفاصيل الطلب عبر واتساب"
        >
          <WhatsappLogo size={20} weight="fill" /> إرسال التفاصيل عبر واتساب
        </motion.a>
      )}

      <motion.button
        variants={staggerItemVariants}
        onClick={onClose}
        className={`w-full py-3.5 rounded-[1.25rem] border-2 text-[13px] font-bold active:scale-[0.98] transition-all group overflow-hidden relative ${isDark ? "border-white/10 text-white hover:bg-white/5" : "border-gray-200/70 text-gray-800 hover:bg-gray-50"}`}
      >
        <span className={isDark ? "text-white" : "text-gray-800"}>إغلاق</span>
      </motion.button>
    </motion.div>
  );
}

// ─── Customer Service step ────────────────────────────────────────────────────

interface CustomerServiceProps {
  isDark: boolean;
  onReset: () => void;
  whatsappHref: string;
}

export function StepCustomerService({ isDark, onReset, whatsappHref }: CustomerServiceProps) {
  return (
    <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
      <motion.div variants={staggerItemVariants} className={`rounded-[1.25rem] border px-4 py-4 text-center ${isDark ? "border-white/10 bg-white/[0.02]" : "border-gray-200/70 bg-gray-50"}`}>
        <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-gray-900"}`}>فريقنا متاح ٢٤/٧ للمساعدة</p>
        <p className={`text-[11px] font-medium mt-1.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>اختر طريقة التواصل المفضلة</p>
      </motion.div>

      <motion.a
        variants={staggerItemVariants}
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[1.25rem] bg-[#25D366] text-white text-[13px] font-bold hover:bg-[#1ebe5d] active:scale-[0.98] transition-all shadow-lg shadow-[#25D366]/20"
        aria-label="تواصل معنا عبر واتساب"
      >
        <WhatsappLogo size={20} weight="fill" /> واتساب مباشر
      </motion.a>

      <motion.a
        variants={staggerItemVariants}
        href="tel:+966560655552"
        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-[1.25rem] border-2 text-[13px] font-bold active:scale-[0.98] transition-all ${isDark ? "border-white/10 bg-white/[0.02] text-white hover:bg-white/[0.06]" : "border-gray-200/70 bg-white text-gray-800 hover:bg-gray-50"}`}
        aria-label="اتصل بنا على الرقم +966 56 065 5552"
      >
        <Headset size={20} weight="fill" /> اتصل بنا
      </motion.a>

      <motion.button
        variants={staggerItemVariants}
        onClick={onReset}
        className={`w-full py-3.5 rounded-[1.25rem] border text-[13px] font-bold active:scale-[0.98] transition-all ${isDark ? "border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.02]" : "border-gray-200/70 text-gray-600 hover:bg-gray-50"}`}
      >
        العودة للقائمة الرئيسية
      </motion.button>
    </motion.div>
  );
}
