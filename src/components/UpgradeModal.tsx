"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, ArrowFatUp, CreditCard, Lightning, Star, ShieldCheck, Sparkle } from "@phosphor-icons/react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { useTheme } from "@/components/ThemeProvider";

// ─── Plan Definitions ─────────────────────────────────────────────────────────

interface PlanInfo {
  id: string;
  label: string;
  price: string;
  period: string;
  color: string;
  features: string[];
  nextPlan?: string;
}

const PLAN_MAP: Record<string, PlanInfo> = {
  free: {
    id: "free",
    label: "المجاني",
    price: "٠",
    period: "دائماً",
    color: "zinc",
    features: ["٥ استفسارات AI/شهر", "مطالعة الأنظمة", "بدون محامي"],
    nextPlan: "ai-individual",
  },
  "ai-individual": {
    id: "ai-individual",
    label: "AI فردي",
    price: "٩٩",
    period: "شهرياً",
    color: "emerald",
    features: ["٤٠ استفسار AI/شهر", "يستشهد بالمواد القانونية", "تصعيد فوري للمحامي", "أرشفة الاستشارات"],
    nextPlan: "legal-protection",
  },
  "legal-protection": {
    id: "legal-protection",
    label: "الحماية القانونية",
    price: "٢٩٩",
    period: "شهرياً",
    color: "royal",
    features: ["٨٠ استفسار AI/شهر", "١ استشارة مجانية/شهر", "١ مراجعة عقد مجانية", "محامي شخصي مخصص"],
    nextPlan: undefined,
  },
  starter: {
    id: "starter",
    label: "المبتدئ",
    price: "١٩٩",
    period: "شهرياً",
    color: "blue",
    features: ["٣ مستخدمين", "٢٠ قضية/شهر", "كل أدوات AI", "دعم واتساب"],
    nextPlan: "professional",
  },
  professional: {
    id: "professional",
    label: "المحترف",
    price: "٤٩٩",
    period: "شهرياً",
    color: "purple",
    features: ["١٠ مستخدمين", "١٠٠ قضية/شهر", "كل أدوات AI", "تقارير أداء", "أولوية الدعم"],
    nextPlan: "elite",
  },
  elite: {
    id: "elite",
    label: "النخبة",
    price: "٩٩٩",
    period: "شهرياً",
    color: "amber",
    features: ["غير محدود", "استخدام مشترك كل AI", "مدير حساب مخصص", "دعم واتساب VIP"],
    nextPlan: undefined,
  },
};

const COLOR_MAP: Record<string, { badge: string; bar: string; glow: string }> = {
  zinc:    { badge: "bg-zinc-100 text-zinc-600 border-zinc-200",       bar: "bg-zinc-400",    glow: "" },
  emerald: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", glow: "shadow-emerald-500/20" },
  royal:   { badge: "bg-[#0B3D2E]/10 text-[#0B3D2E] border-[#0B3D2E]/20", bar: "bg-[#0B3D2E]", glow: "shadow-[#0B3D2E]/20" },
  blue:    { badge: "bg-blue-50 text-blue-700 border-blue-200",        bar: "bg-blue-500",    glow: "shadow-blue-500/20" },
  purple:  { badge: "bg-purple-50 text-purple-700 border-purple-200",  bar: "bg-purple-500",  glow: "shadow-purple-500/20" },
  amber:   { badge: "bg-amber-50 text-amber-700 border-amber-200",     bar: "bg-amber-500",   glow: "shadow-amber-500/20" },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** If provided, shows a specific feature that required upgrade as the reason */
  featureBlocked?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UpgradeModal({ open, onClose, featureBlocked }: UpgradeModalProps) {
  const { isDark } = useTheme();
  const user = useUser();

  const currentTier = user.tier ?? "free";
  const current = PLAN_MAP[currentTier] ?? PLAN_MAP.free;
  const next = current.nextPlan ? PLAN_MAP[current.nextPlan] : null;
  const currentColors = COLOR_MAP[current.color] ?? COLOR_MAP.zinc;
  const nextColors = next ? (COLOR_MAP[next.color] ?? COLOR_MAP.emerald) : null;

  // Credits usage bar
  const creditsUsed = (user.creditsMax ?? 0) - (user.credits ?? 0);
  const creditsPercent = user.creditsMax ? Math.round((creditsUsed / user.creditsMax) * 100) : 0;

  const card = isDark
    ? "bg-zinc-900/80 border-white/[0.07] backdrop-blur-xl"
    : "bg-white border-slate-200 shadow-2xl";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className={`fixed z-[10001] inset-x-4 top-[10%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[480px] rounded-3xl border overflow-hidden ${card}`}
            dir="rtl"
          >
            {/* Header */}
            <div className={`relative px-6 pt-6 pb-5 ${isDark ? "bg-gradient-to-b from-[#0B3D2E]/20 to-transparent" : "bg-gradient-to-b from-[#0B3D2E]/[0.04] to-transparent"}`}>
              <button
                onClick={onClose}
                className={`absolute top-4 left-4 p-1.5 rounded-xl transition-colors ${isDark ? "text-zinc-500 hover:bg-white/[0.05]" : "text-slate-400 hover:bg-slate-100"}`}
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 shadow-md">
                  <ArrowFatUp size={20} weight="fill" className="text-[#C8A762]" />
                </div>
                <div>
                  <h2 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>ترقية الباقة</h2>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {featureBlocked
                      ? `"${featureBlocked}" متاحة في باقة أعلى`
                      : "استمتع بكامل إمكانيات نظامي"}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-4">

              {/* Current Plan Card */}
              <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-slate-100 bg-slate-50/60"}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>باقتك الحالية</p>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${currentColors.badge}`}>
                    {current.label}
                  </span>
                </div>

                {/* Credits Bar */}
                {user.creditsMax != null && (
                  <div className="mb-3">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className={isDark ? "text-zinc-500" : "text-slate-400"}>الكريديت المستخدم</span>
                      <span className={`font-mono font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                        {creditsUsed} / {user.creditsMax}
                      </span>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-200"}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${creditsPercent}%` }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className={`h-full rounded-full ${creditsPercent >= 90 ? "bg-red-500" : creditsPercent >= 70 ? "bg-amber-500" : currentColors.bar}`}
                      />
                    </div>
                  </div>
                )}

                <ul className="space-y-1">
                  {current.features.map((f, i) => (
                    <li key={i} className={`flex items-center gap-2 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                      <CheckCircle size={11} weight="fill" className={isDark ? "text-zinc-600" : "text-slate-300"} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Next Plan / Pay-per-piece */}
              {next && nextColors ? (
                <div className={`rounded-2xl border p-4 relative overflow-hidden ${
                  isDark
                    ? `border-[${next.color === "royal" ? "#0B3D2E" : next.color}]/30 bg-gradient-to-br from-[#0B3D2E]/10 to-transparent`
                    : `border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-transparent`
                }`}>
                  {/* Glow */}
                  <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full ${nextColors.bar} opacity-[0.07] blur-2xl pointer-events-none`} />

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkle size={14} weight="fill" className="text-[#C8A762]" />
                      <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الترقية المقترحة</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${nextColors.badge}`}>
                      {next.label}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1 mb-3">
                    <span className={`text-[26px] font-black ${isDark ? "text-white" : "text-slate-800"}`}>{next.price}</span>
                    <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>﷼ / {next.period}</span>
                  </div>

                  <ul className="space-y-1.5 mb-4">
                    {next.features.map((f, i) => (
                      <li key={i} className={`flex items-center gap-2 text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                        <CheckCircle size={13} weight="fill" className="text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/pricing?plan=${next.id}&from=${currentTier}`}
                    onClick={onClose}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-black hover:bg-[#0a3328] transition-colors shadow-lg"
                  >
                    <Lightning size={14} weight="fill" />
                    ارقَ إلى {next.label}
                    <ArrowFatUp size={12} weight="fill" />
                  </Link>
                </div>
              ) : (
                // Already on top plan — offer pay-per-action
                <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.07]" : "border-slate-100"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Star size={14} weight="fill" className="text-[#C8A762]" />
                    <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>أنت على أعلى باقة متاحة</p>
                  </div>
                  <p className={`text-[11px] mb-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    لو نفد رصيد AI يمكنك الدفع بالعمل القانوني للخدمة المحددة فقط دون ترقية.
                  </p>
                  <Link
                    href="/pricing?mode=single"
                    onClick={onClose}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold border transition-colors ${isDark ? "border-white/[0.10] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                  >
                    <CreditCard size={14} />
                    الدفع بالعمل القانوني
                  </Link>
                </div>
              )}

              {/* Trust */}
              <div className="flex items-center justify-center gap-4">
                {[
                  { icon: ShieldCheck, text: "إلغاء في أي وقت" },
                  { icon: CreditCard, text: "بدون رسوم خفية" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className={`flex items-center gap-1.5 text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    <Icon size={11} weight="duotone" />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
