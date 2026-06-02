"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Gavel, Lightning, Scales, ArrowLeft, ArrowRight,
  ChatCircle, ShieldCheck, Star, Clock, CurrencyDollar,
  CheckCircle, X, User,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────
interface EscalationProps {
  /** The AI response summary to show context */
  aiSummary?: string;
  /** Legal area detected by AI (e.g. "عمالي", "تجاري") */
  legalArea?: string;
  /** Optional complexity score 0-100 from AI analysis */
  complexityScore?: number;
  /** Callback when user dismisses */
  onDismiss?: () => void;
  /** Style variant */
  variant?: "inline" | "modal" | "banner";
}

// ─── Specialties for matching ─────────────────────────────────────────────────
const SPECIALTIES = {
  ar: [
    { id: "labor",      label: "قضايا عمالية",      Icon: Scales },
    { id: "commercial",  label: "قضايا تجارية",      Icon: Gavel },
    { id: "criminal",    label: "قضايا جنائية",      Icon: ShieldCheck },
    { id: "family",      label: "أحوال شخصية",      Icon: User },
    { id: "real_estate", label: "عقارات",            Icon: Star },
    { id: "admin",       label: "قضايا إدارية",      Icon: Clock },
  ],
  en: [
    { id: "labor",      label: "Labor Cases",       Icon: Scales },
    { id: "commercial",  label: "Commercial",        Icon: Gavel },
    { id: "criminal",    label: "Criminal",          Icon: ShieldCheck },
    { id: "family",      label: "Family Law",        Icon: User },
    { id: "real_estate", label: "Real Estate",       Icon: Star },
    { id: "admin",       label: "Administrative",    Icon: Clock },
  ],
};

// ─── Bilingual text ───────────────────────────────────────────────────────────
const txt = {
  ar: {
    titleDetected: (area: string) => `قضيتك تبدو ${area} — هل تريد محامياً متخصصاً؟`,
    subtitleDetected: (area: string) => `الذكاء الاصطناعي وجد أن وضعك قد يتعلق ب ${area} — محامي متخصص يقدر يفيدك أكثر`,
    titleGeneric: "هل تحتاج محامي متخصص؟",
    subtitleGeneric: "الذكاء الاصطناعي أعطاك نتيجة أولية — لكن قضيتك قد تحتاج محامي",
    complexHigh: "⚠️ قضيتك تبدو معقدة — ننصح بالتحدث مع محامي متخصص",
    complexMid: "قضيتك فيها تفاصيل تحتاج نظر محامي — فكّر في استشارة",
    complexLow: "قضيتك تبدو واضحة، لكن المحامي يقدر يساعدك أكثر",
    step1: "اختر التخصص",
    step2: "طريقة التواصل",
    deposit: "رسوم الجدية",
    depositAmount: "٥٠ ﷼",
    depositNote: "تُخصم من أتعاب المحامي عند التعاقد",
    optConsult: "استشارة فورية",
    optConsultDesc: "جلسة ٣٠ دقيقة فيديو أو هاتف",
    optConsultPrice: "٩٩ - ٢٤٩ ﷼",
    optCase: "توكيل في قضية",
    optCaseDesc: "ادفع رسوم الجدية ونوصلك بمحامي",
    optCasePrice: "٥٠ ﷼ رسوم جدية",
    optMarket: "انشر في السوق",
    optMarketDesc: "استقبل عروض من محامين متعددين",
    optMarketPrice: "مجاني",
    cta: "ابحث عن محامي الآن",
    dismiss: "لا، النتيجة كافية",
    guarantee: "ضمان الجودة",
    guaranteeDesc: "كل المحامين مرخصين ومعتمدين من وزارة العدل",
    response: "وقت الرد",
    responseDesc: "يتم الرد خلال ساعتين كحد أقصى",
  },
  en: {
    titleDetected: (area: string) => `Your case appears ${area} — Need a specialist lawyer?`,
    subtitleDetected: (area: string) => `AI detected your case relates to ${area} — a specialist can help more`,
    titleGeneric: "Need a Specialist Lawyer?",
    subtitleGeneric: "AI gave you an initial result — but your case may need a lawyer",
    complexHigh: "⚠️ Your case looks complex — we recommend consulting a specialist",
    complexMid: "Your case has details that need a lawyer's eye — consider a consultation",
    complexLow: "Your case seems straightforward, but a lawyer can help more",
    step1: "Choose Specialty",
    step2: "How to Connect",
    deposit: "Seriousness Deposit",
    depositAmount: "SAR 50",
    depositNote: "Deducted from lawyer fees upon engagement",
    optConsult: "Instant Consultation",
    optConsultDesc: "30-min video or phone session",
    optConsultPrice: "SAR 99 - 249",
    optCase: "Case Engagement",
    optCaseDesc: "Pay seriousness deposit & get matched",
    optCasePrice: "SAR 50 deposit",
    optMarket: "Post to Marketplace",
    optMarketDesc: "Receive offers from multiple lawyers",
    optMarketPrice: "Free",
    cta: "Find a Lawyer Now",
    dismiss: "No, AI result is enough",
    guarantee: "Quality Guarantee",
    guaranteeDesc: "All lawyers are MOJ-licensed and verified",
    response: "Response Time",
    responseDesc: "Maximum 2-hour response time",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function EscalationFlow({
  aiSummary,
  legalArea,
  complexityScore = 60,
  onDismiss,
  variant = "inline",
}: EscalationProps) {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const t = isAr ? txt.ar : txt.en;
  const specs = isAr ? SPECIALTIES.ar : SPECIALTIES.en;
  const dir = isAr ? "rtl" : "ltr";

  // اكتشف اسم التخصص للعرض
  const detectedSpec = legalArea ? specs.find(s => s.id === legalArea) : null;
  const pageTitle = detectedSpec
    ? t.titleDetected(detectedSpec.label)
    : t.titleGeneric;
  const pageSubtitle = detectedSpec
    ? t.subtitleDetected(detectedSpec.label)
    : t.subtitleGeneric;

  const [selectedSpec, setSelectedSpec] = useState<string | null>(legalArea || null);
  // If the legal area is already known from context → skip step 1 directly
  const [step, setStep] = useState<1 | 2>(legalArea ? 2 : 1);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const complexityMsg =
    complexityScore >= 70 ? t.complexHigh :
    complexityScore >= 40 ? t.complexMid :
    t.complexLow;

  const card = isDark
    ? "bg-zinc-900/70 border-white/[0.06]"
    : "bg-white border-slate-200/70 shadow-sm";

  const Arrow = isAr ? ArrowLeft : ArrowRight;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      dir={dir}
      className={`rounded-2xl border overflow-hidden ${card} ${
        variant === "banner" ? "border-t-4 border-t-royal" : ""
      }`}
    >
      {/* ── Header ── */}
      <div className={`relative px-6 pt-6 pb-4 ${isDark ? "bg-gradient-to-b from-royal/10 to-transparent" : "bg-gradient-to-b from-royal/[0.04] to-transparent"}`}>
        {/* Dismiss */}
        <button
          onClick={() => { setDismissed(true); onDismiss?.(); }}
          className={`absolute top-4 ${isAr ? "left-4" : "right-4"} p-1 rounded-lg transition-colors ${isDark ? "text-zinc-600 hover:bg-white/5" : "text-slate-400 hover:bg-slate-100"}`}
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 shadow-md">
            <Gavel size={22} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
              {pageTitle}
            </h3>
            <p className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{pageSubtitle}</p>
          </div>
        </div>

        {/* Complexity notice */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium ${
          complexityScore >= 70
            ? isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-amber-50 text-amber-700 border border-amber-200"
            : isDark ? "bg-royal/10 text-emerald-400 border border-royal/20" : "bg-royal/5 text-royal border border-royal/10"
        }`}>
          <Lightning size={14} weight="fill" />
          {complexityMsg}
        </div>
      </div>

      {/* ── Step content ── */}
      <div className="px-6 pb-6">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {/* Specialty grid */}
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 mt-4 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {t.step1}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {specs.map((sp) => {
                  const IconComp = sp.Icon;
                  return (
                    <button
                      key={sp.id}
                      onClick={() => setSelectedSpec(sp.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all hover:scale-[1.02] active:scale-[0.98] ${
                        selectedSpec === sp.id
                          ? isDark ? "border-royal/30 bg-royal/10 shadow-sm" : "border-royal/30 bg-royal/5 shadow-sm"
                          : isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100"
                      }`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        selectedSpec === sp.id
                          ? isDark ? "bg-royal/20 text-emerald-400" : "bg-royal/10 text-royal"
                          : isDark ? "text-zinc-500" : "text-slate-400"
                      }`}>
                        <IconComp size={16} weight="duotone" />
                      </div>
                      <span className={`text-[11px] font-medium ${selectedSpec === sp.id ? "text-royal" : isDark ? "text-zinc-400" : "text-slate-600"}`}>
                        {sp.label}
                      </span>
                      {selectedSpec === sp.id && (
                        <CheckCircle size={14} weight="fill" className="text-royal" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Next button */}
              <button
                onClick={() => selectedSpec && setStep(2)}
                disabled={!selectedSpec}
                className={`w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                  selectedSpec
                    ? "bg-royal text-white shadow-md hover:bg-royal-light"
                    : isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                {t.step2} <Arrow size={14} />
              </button>
            </motion.div>
          ) : (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {/* Context confirmation banner when specialty was auto-detected */}
              {selectedSpec && (
                <div className={`flex items-center gap-2 mt-4 mb-3 px-3 py-2 rounded-xl text-[11px] font-medium ${
                  isDark ? "bg-emerald-900/20 border border-emerald-800/30 text-emerald-300" : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                }`}>
                  <CheckCircle size={13} weight="fill" />
                  فهمنا — قضيتك تخص {specs.find(s => s.id === selectedSpec)?.label ?? selectedSpec}
                  {!legalArea && (
                    <button
                      onClick={() => setStep(1)}
                      className="ms-auto underline opacity-60 hover:opacity-100 text-[10px]"
                    >
                      تغيير
                    </button>
                  )}
                </div>
              )}
              {/* Connection options */}
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 mt-4 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {t.step2}
              </p>
              <div className="space-y-2.5">
                {[
                  { href: "/book/consultation", label: t.optConsult, desc: t.optConsultDesc, price: t.optConsultPrice, icon: ChatCircle, highlight: true },
                  { href: "/lawyers",           label: t.optCase,    desc: t.optCaseDesc,    price: t.optCasePrice,    icon: Scales,     highlight: false },
                  { href: "/marketplace",        label: t.optMarket,  desc: t.optMarketDesc,  price: t.optMarketPrice,  icon: User,       highlight: false },
                ].map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <Link
                      key={opt.href}
                      href={opt.href}
                      className={`flex items-center gap-3 p-4 rounded-xl border transition-all hover:scale-[1.01] ${
                        opt.highlight
                          ? isDark ? "border-royal/20 bg-royal/8 hover:bg-royal/12" : "border-royal/20 bg-royal/[0.04] hover:bg-royal/[0.07]"
                          : isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]" : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        opt.highlight
                          ? "bg-royal text-white shadow-sm"
                          : isDark ? "bg-white/[0.04] text-zinc-400" : "bg-slate-100 text-slate-500"
                      }`}>
                        <Icon size={18} weight="duotone" />
                      </div>
                      <div className="flex-1">
                        <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{opt.label}</p>
                        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{opt.desc}</p>
                      </div>
                      <div className="text-end shrink-0">
                        <p className={`text-[12px] font-bold ${opt.highlight ? "text-royal" : isDark ? "text-zinc-400" : "text-slate-600"}`}>
                          {opt.price}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[
                  { label: t.guarantee, desc: t.guaranteeDesc, icon: ShieldCheck },
                  { label: t.response,  desc: t.responseDesc,  icon: Clock },
                ].map((badge) => {
                  const Icon = badge.icon;
                  return (
                    <div key={badge.label} className={`flex items-start gap-2 p-3 rounded-xl ${isDark ? "bg-white/[0.02]" : "bg-slate-50"}`}>
                      <Icon size={16} weight="duotone" className="text-royal mt-0.5 shrink-0" />
                      <div>
                        <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{badge.label}</p>
                        <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{badge.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Back button */}
              <button
                onClick={() => setStep(1)}
                className={`mt-3 text-xs font-medium ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"} transition-colors`}
              >
                ← {t.step1}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dismiss link */}
        <button
          onClick={() => { setDismissed(true); onDismiss?.(); }}
          className={`w-full text-center mt-4 text-[11px] font-medium ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"} transition-colors`}
        >
          {t.dismiss}
        </button>
      </div>
    </motion.div>
  );
}
