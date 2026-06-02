"use client";

import { motion } from "framer-motion";
import {
  Buildings,
  Gavel,
  HandHeart,
  Scales,
  SealCheck,
  Storefront,
  User,
  UsersThree,
} from "@phosphor-icons/react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { rowBtnClass, staggerListVariants, staggerItemVariants } from "./WaShared";
import type { WaStep, UserCategory } from "../types";

// NonNullable ensures val can be used safely as React key (no null)
type NonNullUserCategory = NonNullable<UserCategory>;

interface Props {
  isDark: boolean;
  isRTL: boolean;
  onSelect: (type: NonNullUserCategory, next: WaStep) => void;
}

const USER_TYPES: { icon: React.ReactNode; label: string; sub: string; val: NonNullUserCategory }[] = [
  { icon: <User size={18} weight="duotone" />, label: "فرد", sub: "حقوق شخصية واستشارات", val: "individual" },
  { icon: <Buildings size={18} weight="duotone" />, label: "شركة", sub: "حوكمة وعقود ومخاطر", val: "corporate" },
  { icon: <Storefront size={18} weight="duotone" />, label: "منشأة صغيرة", sub: "رخص وعمال وعقود", val: "micro" },
  { icon: <Gavel size={18} weight="duotone" />, label: "محامي", sub: "بحث وصياغة وقضايا", val: "lawyer" },
  { icon: <UsersThree size={18} weight="duotone" />, label: "مكتب محاماة", sub: "فريق وقضايا وسوق", val: "firm" },
  { icon: <SealCheck size={18} weight="duotone" />, label: "مقدم خدمة", sub: "توثيق وتعقيب وتحكيم", val: "provider" },
  { icon: <Scales size={18} weight="duotone" />, label: "جهة حكومية", sub: "عقود ورأي وإجراءات", val: "government" },
  { icon: <HandHeart size={18} weight="duotone" />, label: "جمعية خيرية", sub: "حوكمة وتطوع وتقارير", val: "ngo" },
];

export default function StepUserType({ isDark, isRTL, onSelect }: Props) {
  const NavArrow = isRTL ? <ArrowLeft size={14} className="text-gray-400 shrink-0" /> : <ArrowRight size={14} className="text-gray-400 shrink-0" />;

  return (
    <div className="flex flex-col gap-2 relative">
      <motion.p
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className={`text-xs mb-1.5 font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}
      >
        سيساعدنا ذلك في تخصيص تجربتك
      </motion.p>

      <motion.div
        variants={staggerListVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        {USER_TYPES.map(({ icon, label, sub, val }) => (
          <motion.button
            variants={staggerItemVariants}
            key={val}
            onClick={() => onSelect(val, "service-select")}
            className={rowBtnClass(isDark)}
            aria-label={`${label} — ${sub}`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-[#0B3D2E]/5 dark:bg-emerald-500/10 text-[#0B3D2E] dark:text-emerald-400">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight mb-0.5">{label}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</div>
            </div>
            {NavArrow}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
