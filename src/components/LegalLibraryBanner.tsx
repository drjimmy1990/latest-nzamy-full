"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { BookOpen, X, ArrowLeft, ArrowRight, Star, MagnifyingGlass } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Bilingual text ───────────────────────────────────────────────────────────
const txt = {
  ar: {
    badge: "اشتراك منفصل",
    title: "المكتبة القانونية",
    subtitle: "٥,٠٠٠+ نظام ولائحة سعودية — بحث ذكي بالذكاء الاصطناعي",
    features: [
      "بحث بالنص الكامل في جميع الأنظمة واللوائح",
      "السوابق والمبادئ القضائية",
      "تحديثات فورية عند صدور أنظمة جديدة",
      "تصفية حسب الجهة والتاريخ والموضوع",
    ],
    price: "٤٩ ﷼/شهر",
    pricePeriod: "أو ٤٩٠ ﷼/سنة",
    cta: "اشترك الآن",
    explore: "تصفح المكتبة",
    stat1: "٥,٠٠٠+",
    stat1Label: "نظام ولائحة",
    stat2: "٢٧",
    stat2Label: "قسم قانوني",
    stat3: "يومي",
    stat3Label: "تحديث",
  },
  en: {
    badge: "Separate Subscription",
    title: "Legal Library",
    subtitle: "5,000+ Saudi laws & regulations — AI-powered smart search",
    features: [
      "Full-text search across all laws & regulations",
      "Judicial principles & precedents",
      "Real-time updates on new legislation",
      "Filter by authority, date, and subject",
    ],
    price: "SAR 49/mo",
    pricePeriod: "or SAR 490/year",
    cta: "Subscribe Now",
    explore: "Browse Library",
    stat1: "5,000+",
    stat1Label: "Laws & Regulations",
    stat2: "27",
    stat2Label: "Legal Sections",
    stat3: "Daily",
    stat3Label: "Updates",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function LegalLibraryBanner({
  variant = "full",
  onDismiss,
}: {
  /** "full" = large card with details, "compact" = slim banner */
  variant?: "full" | "compact";
  onDismiss?: () => void;
}) {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const t = isAr ? txt.ar : txt.en;
  const dir = isAr ? "rtl" : "ltr";
  const [dismissed, setDismissed] = useState(false);
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  if (dismissed) return null;

  // ── Compact variant ──
  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        dir={dir}
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
          isDark ? "bg-indigo-950/30 border-indigo-500/15" : "bg-indigo-50/70 border-indigo-200/60"
        }`}
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isDark ? "bg-indigo-500/15" : "bg-indigo-100"}`}>
          <BookOpen size={17} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-bold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
            📚 {t.title} — {t.subtitle}
          </p>
        </div>
        <Link
          href="/laws"
          className={`shrink-0 text-[11px] font-bold flex items-center gap-1 ${isDark ? "text-indigo-400 hover:text-indigo-300" : "text-indigo-600 hover:text-indigo-800"} transition-colors`}
        >
          {t.explore} <Arrow size={11} />
        </Link>
        {onDismiss && (
          <button onClick={() => { setDismissed(true); onDismiss(); }} className={`shrink-0 p-1 rounded-lg ${isDark ? "text-zinc-600 hover:bg-white/5" : "text-slate-400 hover:bg-slate-100"}`}>
            <X size={14} />
          </button>
        )}
      </motion.div>
    );
  }

  // ── Full variant ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      dir={dir}
      className={`relative rounded-2xl border overflow-hidden ${
        isDark ? "bg-gradient-to-br from-indigo-950/40 to-zinc-900/60 border-indigo-500/15" : "bg-gradient-to-br from-indigo-50/80 to-white border-indigo-200/60 shadow-sm"
      }`}
    >
      {/* Dismiss */}
      {onDismiss && (
        <button
          onClick={() => { setDismissed(true); onDismiss(); }}
          className={`absolute top-3 ${isAr ? "left-3" : "right-3"} z-10 p-1 rounded-lg ${isDark ? "text-zinc-600 hover:bg-white/5" : "text-slate-400 hover:bg-slate-100"}`}
        >
          <X size={16} />
        </button>
      )}

      <div className="p-6">
        {/* Badge */}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold mb-4 ${
          isDark ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20" : "bg-indigo-100 text-indigo-700 border border-indigo-200"
        }`}>
          <BookOpen size={11} weight="fill" />
          {t.badge}
        </span>

        <div className="flex flex-col lg:flex-row gap-5">
          {/* Left: info */}
          <div className="flex-1">
            <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
              📚 {t.title}
            </h3>
            <p className={`text-sm mb-4 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              {t.subtitle}
            </p>

            {/* Features */}
            <div className="space-y-2 mb-5">
              {t.features.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <MagnifyingGlass size={12} weight="duotone" className={`mt-0.5 shrink-0 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
                  <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{f}</span>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/laws/subscribe"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-royal text-white text-sm font-bold shadow-md hover:bg-royal-light transition-colors"
              >
                {t.cta} <Arrow size={14} />
              </Link>
              <Link
                href="/laws"
                className={`flex items-center gap-1.5 text-sm font-medium ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"} transition-colors`}
              >
                {t.explore} <Arrow size={13} />
              </Link>
            </div>
          </div>

          {/* Right: stats + price */}
          <div className={`flex-shrink-0 w-full lg:w-[200px] rounded-2xl p-4 ${isDark ? "bg-white/[0.03] border border-white/[0.04]" : "bg-white border border-slate-100"}`}>
            {/* Price */}
            <div className="text-center mb-4">
              <p className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
                {t.price}
              </p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{t.pricePeriod}</p>
            </div>

            {/* Mini stats */}
            <div className="space-y-2.5">
              {[
                { val: t.stat1, label: t.stat1Label },
                { val: t.stat2, label: t.stat2Label },
                { val: t.stat3, label: t.stat3Label },
              ].map((s, i) => (
                <div key={i} className={`flex items-center justify-between py-1.5 border-b last:border-0 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                  <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{s.label}</span>
                  <span className={`text-[12px] font-bold ${isDark ? "text-indigo-400" : "text-indigo-700"}`}>{s.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
