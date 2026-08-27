"use client";

import { motion } from "framer-motion";
import { WhatsappLogo, Headset } from "@phosphor-icons/react";
import { staggerListVariants, staggerItemVariants } from "./WaShared";

// ─── StepSuccess lived here and is DELETED ───────────────────────────────────
//
// It was replaced on 2026-08-27 by the success screen inside WhatsAppWidget.tsx
// (which is why that file carries a note saying this one is deliberately not
// imported), and what it left behind could not be allowed to sit in the tree
// waiting for someone to re-import it:
//
//   • `const orderId = workflow?.id ?? "WA-DEMO"` — it printed «رقم الطلب:
//     WA-DEMO» to a real client whenever no request had been created.
//   • «تم تسجيل الطلب محلياً … وهو جاهز للربط بالباك إند» — developer copy,
//     shown to the client, and false twice over now that the widget files a
//     real order.
//
// The widget's own success step states the actual outcome instead: the
// server's reference when a row was created, and a plain sentence saying
// WhatsApp is the only channel when one was not.
//
// StepCustomerService below is still used.

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
