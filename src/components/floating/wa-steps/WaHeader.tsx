"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, WhatsappLogo, X } from "@phosphor-icons/react";

interface WaHeaderProps {
  stepHeader: string;
  showBack: boolean;
  showServiceSubtitle: boolean;
  isRTL: boolean;
  isDark: boolean;
  onBack: () => void;
  onClose: () => void;
}

export default function WaHeader({
  stepHeader,
  showBack,
  showServiceSubtitle,
  isRTL,
  isDark,
  onBack,
  onClose,
}: WaHeaderProps) {
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="relative flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.01] overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
      <div className="flex items-center gap-3 relative z-10">
        {showBack ? (
          <motion.button
            initial={{ opacity: 0, x: isRTL ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isRTL ? -10 : 10 }}
            onClick={onBack}
            aria-label="رجوع للخطوة السابقة"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-gray-400 active:scale-95"
          >
            <BackArrow size={16} weight="bold" />
          </motion.button>
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-[#25D366] to-[#1DA851] flex items-center justify-center shrink-0 shadow-lg shadow-[#25D366]/20 relative"
          >
            <WhatsappLogo size={18} weight="fill" className="text-white" />
            <div className="absolute top-0 left-0 right-0 bottom-0 rounded-full border border-white/20 pointer-events-none" />
          </motion.div>
        )}
        <div className="flex flex-col justify-center">
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[14px] font-black tracking-tight text-gray-900 dark:text-white leading-none mb-1"
          >
            {stepHeader}
          </motion.p>
          {showServiceSubtitle && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-[10px] font-bold tracking-widest text-[#25D366] uppercase"
            >
              نظامي · Legal AI
            </motion.p>
          )}
        </div>
      </div>

      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={onClose}
        aria-label="إغلاق نافذة المساعدة"
        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-white relative z-10"
      >
        <X size={16} weight="bold" />
      </motion.button>
    </div>
  );
}
