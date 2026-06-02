"use client";

import { motion } from "framer-motion";
import { Robot, Gavel, Paperclip } from "@phosphor-icons/react";
import { Chip, staggerListVariants, staggerItemVariants } from "./WaShared";
import type { WaStep, UserCategory } from "../types";
import type { FloatingActorContext } from "../roleContext";

interface Props {
  step: WaStep;
  isDark: boolean;
  selections: Record<string, string>;
  contractNotes: string;
  onNavigate: (next: WaStep) => void;
  onSelect: (key: string, value: string) => void;
  setContractNotes: (v: string) => void;
  userCategory?: UserCategory | null;
  actorContext?: FloatingActorContext | null;
}

function getContractTypes(category?: UserCategory | null, actorContext?: FloatingActorContext | null): string[] {
  const role = actorContext?.roleKey;

  if (category === "corporate" || category === "business") {
    if (role === "hr_manager") return ["عقد عمل", "لائحة عمل", "مخالصة عمالية", "عدم إفصاح (NDA)", "أخرى"];
    if (role === "finance_manager") return ["عقد توريد", "شراكة", "تسوية مالية", "أخرى"];
    if (role === "compliance_officer") return ["عقد امتثال", "سياسة خصوصية", "اتفاقية بيانات", "أخرى"];
    if (role === "department_head" || role === "employee") return ["مراجعة عقد مورد", "عقد تشغيل", "اتفاقية صيانة", "أخرى"];
    return ["عقد تأسيس", "شراكة", "توريد", "توظيف", "NDA", "تقديم خدمات", "أخرى"];
  }

  if (category === "firm") {
    if (role === "hr_manager") return ["عقد عمل موظف", "عقد متدرب", "لائحة عمل المكتب", "أخرى"];
    if (role === "finance_manager") return ["اتفاقية أتعاب", "عقد توريد", "مخالصة عميل", "أخرى"];
    if (role === "compliance_manager") return ["اتفاقية عدم إفصاح", "سياسة تعارض مصالح", "أخرى"];
    return ["مراجعة عقد عميل", "اتفاقية أتعاب", "شراكة", "أخرى"];
  }

  if (category === "government") {
    if (role === "judge" || role === "prosecutor" || role === "officer") return ["عقد شخصي", "أخرى"];
    return ["منافسة عامة", "مشتريات", "عقد تشغيل", "SLA", "أخرى"];
  }

  if (category === "micro") return ["عقد عمل بسيط", "إيجار محل", "توريد", "أخرى"];
  if (category === "ngo") return ["عقد تطوع", "اتفاقية شراكة", "عقد رعاية", "توظيف", "أخرى"];
  
  // provider, individual, guest
  return ["عقد عمل", "عقد إيجار", "عقد بيع", "شراكة", "أخرى"];
}

const CONTRACT_SERVICES = [
  { icon: <Robot size={20} weight="fill" />, label: "مراجعة AI", desc: "تقرير فوري + تحديد البنود الغامضة", price: "١٥٠ ر.س", val: "ai-review", colorClass: "border-emerald-400 dark:border-emerald-500", iconColor: "text-emerald-600 dark:text-emerald-400" },
  { icon: <Gavel size={20} weight="fill" />, label: "محامي متخصص", desc: "مراجعة كاملة + تقرير مخاطر مفصّل", price: "٤٩٩ ر.س", val: "lawyer-review", colorClass: "border-[#C8A762]", iconColor: "text-[#C8A762]" },
];

export default function StepContract({ step, isDark, selections, contractNotes, onNavigate, onSelect, setContractNotes, userCategory, actorContext }: Props) {
  // ── contract-type ──
  if (step === "contract-type") {
    const types = getContractTypes(userCategory, actorContext);
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-2 relative">
        {types.map(label => (
          <motion.div variants={staggerItemVariants} key={label}>
            <Chip
              label={label}
              selected={selections.contractType === label}
              onClick={() => { onSelect("contractType", label); onNavigate("contract-service"); }}
            />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  // ── contract-service ──
  if (step === "contract-service") {
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        {CONTRACT_SERVICES.map(({ icon, label, desc, price, val, colorClass, iconColor }) => (
          <motion.button
            variants={staggerItemVariants}
            key={val}
            onClick={() => { onSelect("contractService", val); onNavigate("contract-details"); }}
            className={`w-full flex items-start gap-3.5 px-4 py-4 rounded-[1.25rem] border-2 text-start transition-all group relative overflow-hidden active:scale-[0.98]
              ${isDark ? "bg-white/[0.02]" : "bg-white"} ${colorClass} hover:border-opacity-100 shadow-sm`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${val === "ai-review" ? "bg-emerald-100 dark:bg-emerald-500/20" : "bg-amber-100 dark:bg-amber-500/20"}`}>
              <span className={iconColor}>{icon}</span>
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className={`text-[13px] font-bold ${isDark ? "text-white" : "text-gray-900"} mb-0.5`}>{label}</div>
              <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 leading-snug">{desc}</div>
              <div className={`text-[13px] font-black ${iconColor}`}>{price}</div>
            </div>
          </motion.button>
        ))}
      </motion.div>
    );
  }

  // ── contract-details ──
  if (step === "contract-details") {
    return (
      <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-3 relative">
        <motion.button
          variants={staggerItemVariants}
          className={`w-full flex flex-col items-center justify-center gap-2 rounded-[1.25rem] border-2 border-dashed py-6 transition-all group active:scale-[0.98] ${isDark ? "border-white/20 text-gray-400 hover:border-emerald-500/50 hover:bg-white/5" : "border-gray-300 text-gray-500 hover:border-[#0B3D2E]/40 hover:bg-gray-50 hover:text-[#0B3D2E]"}`}
          aria-label="اضغط لرفع ملف العقد"
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-white/5 group-hover:bg-[#0B3D2E]/10 dark:group-hover:bg-emerald-500/20 transition-colors">
            <Paperclip size={20} className={isDark ? "group-hover:text-emerald-400" : "group-hover:text-[#0B3D2E]"} />
          </div>
          <span className="text-[13px] font-bold">اضغط لرفع العقد</span>
          <span className="text-[10px] text-gray-400 font-medium">PDF, DOCX, JPG — حتى 10MB</span>
        </motion.button>
        <motion.input
          variants={staggerItemVariants}
          type="text"
          placeholder="ملاحظات إضافية (اختياري)"
          value={contractNotes}
          onChange={e => setContractNotes(e.target.value)}
          aria-label="ملاحظات إضافية على العقد"
          className={`w-full rounded-[1.25rem] border px-4 py-3 text-[13px] font-medium outline-none transition-all focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/10 ${isDark ? "bg-white/[0.02] border-white/10 text-white placeholder:text-gray-600" : "bg-white border-gray-200/70 text-gray-800 placeholder:text-gray-400"}`}
        />
        <motion.p variants={staggerItemVariants} className="text-[11px] font-bold text-[#0B3D2E] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-3 py-2 text-center">
          ستصلك نتيجة المراجعة + تقرير PDF على واتساب
        </motion.p>
        <motion.button
          variants={staggerItemVariants}
          onClick={() => onNavigate("payment-summary")}
          className="w-full mt-1 py-3.5 rounded-[1.25rem] bg-[#0B3D2E] text-white text-[13px] font-bold hover:bg-[#0d4d39] active:scale-[0.98] transition-all shadow-lg shadow-[#0B3D2E]/20"
        >
          استمرار
        </motion.button>
      </motion.div>
    );
  }

  return null;
}
