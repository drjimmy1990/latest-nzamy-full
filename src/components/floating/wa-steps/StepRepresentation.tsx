"use client";

import { motion } from "framer-motion";
import { Gavel, Users, FileText, MapPin } from "@phosphor-icons/react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Chip, rowBtnClass, staggerListVariants, staggerItemVariants } from "./WaShared";
import type { WaStep, UserCategory } from "../types";
import type { FloatingActorContext } from "../roleContext";

interface Props {
  step: WaStep;
  isDark: boolean;
  isRTL: boolean;
  selections: Record<string, string>;
  repDetails: string;
  onNavigate: (next: WaStep) => void;
  onSelect: (key: string, value: string) => void;
  setRepDetails: (v: string) => void;
  userCategory?: UserCategory | null;
  actorContext?: FloatingActorContext | null;
}

function getSpecialties(category?: UserCategory | null, actorContext?: FloatingActorContext | null): string[] {
  const role = actorContext?.roleKey;

  if (category === "corporate" || category === "business") {
    if (role === "hr_manager") return ["عمالية", "تأمينات اجتماعية", "أخرى"];
    if (role === "finance_manager") return ["تجارية (مطالبات مالية)", "تنفيذ", "أخرى"];
    if (role === "compliance_officer") return ["مخالفات تنظيمية (زكاة/بلدية)", "غرامات", "أخرى"];
    if (role === "department_head" || role === "employee") return ["مطالبة إدارية", "نزاع تعاقدي", "أخرى"];
    return ["تجارية", "عمالية", "إدارية", "ضريبية/زكوية", "ملكية فكرية", "أخرى"];
  }

  if (category === "firm") {
    // Usually firms deal with general commercial/labor unless specialized
    return ["تجارية", "عمالية", "مدنية", "إدارية", "أخرى"];
  }

  if (category === "government") {
    if (role === "prosecutor") return ["جزائية", "أخرى"];
    if (role === "gov_counsel") return ["إدارية (ديوان المظالم)", "تجارية", "لجان شبه قضائية", "أخرى"];
    return ["إدارية", "لجان شبه قضائية", "تجارية", "أخرى"];
  }

  if (category === "micro") return ["تجارية", "عمالية", "أخرى"];
  return ["عمالية", "تجارية", "مدنية", "جنائية", "أسرة", "إدارية"];
}

const CITIES = ["الرياض", "جدة", "مكة المكرمة", "الدمام", "المدينة المنورة", "أبها", "أخرى"];
const STAGES = ["ابتدائي", "استئناف", "نقض/تمييز", "تنفيذ"];

export default function StepRepresentation({ step, isDark, isRTL, selections, repDetails, onNavigate, onSelect, setRepDetails, userCategory, actorContext }: Props) {
  const NavArrow = isRTL
    ? <ArrowLeft size={14} className="text-gray-400 ms-auto shrink-0" />
    : <ArrowRight size={14} className="text-gray-400 ms-auto shrink-0" />;

  // ── representation-sub ──
  if (step === "representation-sub") {
    const SUB_TYPES = [
      { icon: <Gavel size={18} weight="fill" />, label: "ترافع وصياغة", val: "litigation" },
      { icon: <Users size={18} weight="fill" />, label: "حضور جلسة", val: "attendance" },
      { icon: <FileText size={18} weight="fill" />, label: "صياغة مذكرة", val: "memo" },
    ];
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-2 relative">
        {SUB_TYPES.map(({ icon, label, val }) => (
          <motion.button variants={staggerItemVariants} key={val} onClick={() => { onSelect("repSub", val); onNavigate("representation-specialty"); }} className={rowBtnClass(isDark)}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-[#0B3D2E]/5 dark:bg-emerald-500/10">
              <span className="text-[#0B3D2E] dark:text-emerald-400">{icon}</span>
            </div>
            <span className="text-[13px] font-bold text-gray-900 dark:text-white flex-1">{label}</span>
            {NavArrow}
          </motion.button>
        ))}
      </motion.div>
    );
  }

  if (step === "representation-specialty") {
    const specialties = getSpecialties(userCategory, actorContext);
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-2 relative">
        {specialties.map(label => (
          <motion.div variants={staggerItemVariants} key={label}>
            <Chip label={label} selected={selections.specialty === label} onClick={() => { onSelect("specialty", label); onNavigate("representation-city"); }} />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  if (step === "representation-city") {
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-2 relative">
        {CITIES.map(label => (
          <motion.div variants={staggerItemVariants} key={label}>
            <Chip label={label} selected={selections.city === label} onClick={() => { onSelect("city", label); onNavigate("representation-role"); }} />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  if (step === "representation-role") {
    const ROLES = [
      { icon: <MapPin size={22} weight="fill" />, label: "مدعي", sub: "Plaintiff", val: "plaintiff" },
      { icon: <Users size={22} weight="fill" />, label: "مدعى عليه", sub: "Defendant", val: "defendant" },
    ];
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 relative">
        {ROLES.map(({ icon, label, sub, val }) => (
          <motion.button
            variants={staggerItemVariants}
            key={val}
            aria-pressed={selections.role === val}
            onClick={() => { onSelect("role", val); onNavigate("representation-stage"); }}
            className={`flex flex-col items-center justify-center gap-2 rounded-[1.25rem] border-2 py-5 transition-all group relative overflow-hidden active:scale-[0.98] ${
              selections.role === val
                ? "bg-[#0B3D2E] border-[#0B3D2E] text-white shadow-md shadow-[#0B3D2E]/20"
                : isDark ? "border-white/[0.08] bg-white/[0.02] text-white hover:bg-white/[0.06]" : "border-gray-200/70 bg-white text-gray-800 hover:bg-gray-50"
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/[0.05] to-transparent translate-y-[100%] group-hover:translate-y-[-100%] transition-transform duration-700 pointer-events-none" />
            <span className={selections.role === val ? "text-white" : "text-[#0B3D2E] dark:text-emerald-400"}>{icon}</span>
            <span className="text-[13px] font-bold mt-1">{label}</span>
            <span className="text-[10px] opacity-60 font-medium">{sub}</span>
          </motion.button>
        ))}
      </motion.div>
    );
  }

  if (step === "representation-stage") {
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-2 relative">
        {STAGES.map(label => (
          <motion.div variants={staggerItemVariants} key={label}>
            <Chip label={label} selected={selections.stage === label} onClick={() => { onSelect("stage", label); onNavigate("representation-details"); }} />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  if (step === "representation-details") {
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        <motion.textarea
          variants={staggerItemVariants}
          placeholder="اشرح وضع قضيتك..."
          value={repDetails}
          onChange={e => setRepDetails(e.target.value)}
          rows={4}
          aria-label="تفاصيل قضيتك للتمثيل القضائي"
          className={`w-full rounded-[1.25rem] border px-4 py-3 text-[13px] font-medium outline-none resize-none transition-all focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/10 ${isDark ? "bg-white/[0.02] border-white/10 text-white placeholder:text-gray-600" : "bg-white border-gray-200/70 text-gray-800 placeholder:text-gray-400"}`}
        />
        <motion.button
          variants={staggerItemVariants}
          disabled={repDetails.trim().length < 5}
          onClick={() => onNavigate("payment-summary")}
          className="w-full mt-2 py-3.5 rounded-[1.25rem] bg-[#0B3D2E] text-white text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0d4d39] active:scale-[0.98] transition-all shadow-lg shadow-[#0B3D2E]/20"
        >
          استمرار
        </motion.button>
      </motion.div>
    );
  }

  return null;
}
