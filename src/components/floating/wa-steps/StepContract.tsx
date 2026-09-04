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

// Task B1, item 163: "١٥٠ ر.س" / "٤٩٩ ر.س" were fixed numbers with no
// catalog behind them — they matched neither clientServiceCatalog.ts's
// contract-analyze/contract-review entries (79 / 800) nor
// services/contracts/page.tsx's own tiers (249 / 499) nor
// pricing.individuals.ts's drafting price (1,500). Same non-binding-estimate
// wording StepConsult.tsx already uses for its "lawyer" tier, minus the
// number this flow has none of.
const NO_FIXED_PRICE_NOTE = "تقدير غير مُلزِم — يؤكد الفريق الأتعاب قبل البدء";
const CONTRACT_SERVICES = [
  { icon: <Robot size={20} weight="fill" />, label: "مراجعة AI", desc: "تقرير فوري + تحديد البنود الغامضة", price: NO_FIXED_PRICE_NOTE, val: "ai-review", colorClass: "border-emerald-400 dark:border-emerald-500", iconColor: "text-emerald-600 dark:text-emerald-400" },
  { icon: <Gavel size={20} weight="fill" />, label: "محامي متخصص", desc: "مراجعة كاملة + تقرير مخاطر مفصّل", price: NO_FIXED_PRICE_NOTE, val: "lawyer-review", colorClass: "border-[#C8A762]", iconColor: "text-[#C8A762]" },
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
              <div className={`text-[11px] font-bold mt-0.5 ${iconColor}`}>{price}</div>
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
        {/* This was a dashed dropzone reading «اضغط لرفع العقد · PDF, DOCX,
            JPG — حتى 10MB» on a <button> with NO onClick and no file input
            anywhere in the component. A visitor pressed it, nothing happened,
            and there was no other way to tell them so.
            Not re-wired, and the reason is the surface rather than the effort:
            this widget is mounted site-wide for ANONYMOUS visitors, and every
            upload path in this app (POST /api/v1/documents → Supabase Storage)
            requires a session — so a real picker here would fail for most of
            the people who see it, which is the same dead end with more steps.
            What is true is that the flow ends by opening WhatsApp with the
            office, and a contract sent in that conversation does reach the
            team. So that is what it says now. */}
        <motion.div
          variants={staggerItemVariants}
          className={`w-full flex items-start gap-3 rounded-[1.25rem] border px-4 py-3.5 ${isDark ? "border-white/10 bg-white/[0.02] text-zinc-400" : "border-gray-200/70 bg-white text-gray-600"}`}
        >
          <span className="shrink-0 pt-0.5 text-[#0B3D2E] dark:text-emerald-400" aria-hidden="true">
            <Paperclip size={18} />
          </span>
          <p className="text-[12px] font-medium leading-relaxed">
            أرسل نسخة العقد في محادثة واتساب التي تُفتح بعد إتمام الطلب — يستلمها الفريق مع تفاصيل طلبك.
          </p>
        </motion.div>
        <motion.input
          variants={staggerItemVariants}
          type="text"
          placeholder="ملاحظات إضافية (اختياري)"
          value={contractNotes}
          onChange={e => setContractNotes(e.target.value)}
          aria-label="ملاحظات إضافية على العقد"
          className={`w-full rounded-[1.25rem] border px-4 py-3 text-[13px] font-medium outline-none transition-all focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/10 ${isDark ? "bg-white/[0.02] border-white/10 text-white placeholder:text-gray-600" : "bg-white border-gray-200/70 text-gray-800 placeholder:text-gray-400"}`}
        />
        {/* THE THIRD COPY OF A SENTENCE THIS REPO HAS ALREADY RULED FALSE.
            «ستصلك نتيجة المراجعة + تقرير PDF على واتساب» stood here. Its twin
            on the payment screen — «بعد الاستشارة ستصلك نسخة PDF على واتساب
            بملخص الجلسة» — was deleted with the finding recorded in
            StepPayment.tsx:71-77: nothing in this platform generates a review
            report PDF, and nothing sends a file over WhatsApp. The office
            replies in the conversation, by hand.
            Not zero-filled and not softened into «قريباً»: what the flow
            actually does is file an order and open a chat, so that is what it
            says. */}
        <motion.p variants={staggerItemVariants} className="text-[11px] font-bold text-[#0B3D2E] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-3 py-2 text-center">
          يصل طلب المراجعة إلى الفريق، ويوافيك بالنتيجة في المحادثة أو في «طلباتي»
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
