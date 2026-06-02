"use client";

import { motion } from "framer-motion";
import { Robot, Storefront, ShieldCheck, Clock, Warning } from "@phosphor-icons/react";
import { Chip, rowBtnClass, staggerListVariants, staggerItemVariants } from "./WaShared";
import type { WaStep, UserCategory } from "../types";
import type { FloatingActorContext } from "../roleContext";

interface Props {
  step: WaStep;
  isDark: boolean;
  selections: Record<string, string>;
  onNavigate: (next: WaStep) => void;
  onSelect: (key: string, value: string) => void;
  userCategory?: UserCategory | null;
  actorContext?: FloatingActorContext | null;
}

function getNotaryTypes(category?: UserCategory | null, actorContext?: FloatingActorContext | null): string[] {
  const role = actorContext?.roleKey;

  if (category === "corporate" || category === "business") {
    if (role === "hr_manager") return ["وكالة مراجع حكومي", "إقرار تفويض", "أخرى"];
    if (role === "compliance_officer") return ["توثيق سياسات", "إقرار امتثال", "أخرى"];
    return ["قرار شركاء", "وكالة تجارية", "فسخ شراكة", "عقد تأسيس", "أخرى"];
  }

  if (category === "firm") {
    if (role === "managing_partner" || role === "partner") return ["توثيق عقد شراكة", "وكالة محاماة", "أخرى"];
    if (role === "hr_manager") return ["إقرار مخالصة", "توثيق عقد عمل", "أخرى"];
    return ["وكالة محاماة", "توثيق اتفاقية أتعاب", "أخرى"];
  }

  if (category === "micro" || category === "ngo") return ["وكالة مراجع", "إقرار", "تفويض", "أخرى"];
  return ["وكالة شرعية", "إقرار دين", "تنازل", "قسمة تراضي", "أخرى"];
}

const NOTARY_LOCATIONS = [
  { icon: <Storefront size={18} weight="fill" />, label: "في مكتب المحامي", val: "office" },
  { icon: <ShieldCheck size={18} weight="fill" />, label: "كاتب العدل (مع مرافقة)", val: "notary" },
  { icon: <Robot size={18} weight="fill" />, label: "إلكتروني (عن بعد)", val: "remote" },
];

export default function StepNotary({ step, isDark, selections, onNavigate, onSelect, userCategory, actorContext }: Props) {
  if (step === "notary-type") {
    const types = getNotaryTypes(userCategory, actorContext);
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-2 relative">
        {types.map(label => (
          <motion.div variants={staggerItemVariants} key={label}>
            <Chip label={label} selected={selections.notaryType === label} onClick={() => { onSelect("notaryType", label); onNavigate("notary-location"); }} />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  if (step === "notary-location") {
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-2 relative">
        {NOTARY_LOCATIONS.map(({ icon, label, val }) => (
          <motion.button variants={staggerItemVariants} key={val} onClick={() => { onSelect("notaryLocation", val); onNavigate("notary-urgency"); }} className={rowBtnClass(isDark)}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-[#0B3D2E]/5 dark:bg-emerald-500/10">
              <span className="text-[#0B3D2E] dark:text-emerald-400">{icon}</span>
            </div>
            <span className="text-[13px] font-bold text-gray-900 dark:text-white flex-1">{label}</span>
          </motion.button>
        ))}
      </motion.div>
    );
  }

  if (step === "notary-urgency") {
    const URGENCY_OPTIONS = [
      { icon: <Clock size={22} weight="fill" />, label: "عادي", sub: "٢–٣ أيام عمل", val: "normal" },
      { icon: <Warning size={22} weight="fill" />, label: "عاجل", sub: "خلال ٢٤ ساعة — رسوم إضافية", val: "urgent" },
    ];
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 relative">
        {URGENCY_OPTIONS.map(({ icon, label, sub, val }) => (
          <motion.button
            variants={staggerItemVariants}
            key={val}
            aria-pressed={selections.urgency === val}
            onClick={() => { onSelect("urgency", val); onNavigate("payment-summary"); }}
            className={`flex flex-col items-center justify-center gap-2 rounded-[1.25rem] border-2 py-5 px-2 transition-all group relative overflow-hidden active:scale-[0.98] ${
              val === "urgent"
                ? selections.urgency === val ? "bg-red-600 border-red-600 text-white shadow-md shadow-red-600/20" : isDark ? "border-red-900/50 bg-white/[0.02] text-white hover:bg-red-900/20" : "border-red-200 bg-white text-gray-800 hover:bg-red-50"
                : selections.urgency === val ? "bg-[#0B3D2E] border-[#0B3D2E] text-white shadow-md shadow-[#0B3D2E]/20" : isDark ? "border-white/[0.08] bg-white/[0.02] text-white hover:bg-white/[0.06]" : "border-gray-200/70 bg-white text-gray-800 hover:bg-gray-50"
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/[0.05] to-transparent translate-y-[100%] group-hover:translate-y-[-100%] transition-transform duration-700 pointer-events-none" />
            <span className={selections.urgency === val ? "text-white" : val === "urgent" ? "text-red-500" : "text-[#0B3D2E] dark:text-emerald-400"}>{icon}</span>
            <span className="text-[13px] font-bold mt-1">{label}</span>
            <span className="text-[10px] opacity-70 font-medium text-center leading-tight">{sub}</span>
          </motion.button>
        ))}
      </motion.div>
    );
  }

  return null;
}
