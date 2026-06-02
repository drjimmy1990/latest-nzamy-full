"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  BookOpen, Check, ArrowLeft, ArrowRight, MagnifyingGlass,
  Bell, Lock, Scales, Gavel, Buildings, ShieldCheck,
  Lightning, Star, FileText, Crown, Users,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import FloatingButtons from "@/components/FloatingButtons";

// ─── Bilingual ──────────────────────────────────────────────────────────────

const txt = {
  ar: {
    heroTag: "المكتبة القانونية",
    heroTitle: "كل نظام ولائحة في المملكة — في مكان واحد",
    heroSub: "بحث ذكي بالذكاء الاصطناعي في 5,000+ نظام ولائحة سعودية، سوابق قضائية، ومبادئ قانونية — مع تحديثات فورية لحظة الصدور.",
    stats: [
      { val: "5,000+", label: "نظام ولائحة" },
      { val: "27", label: "قسم قانوني" },
      { val: "يومي", label: "تحديث الأنظمة" },
      { val: "AI", label: "بحث ذكي" },
    ],
    plansTitle: "اختر خطتك",
    plansSub: "جميع الخطط تتضمن تجربة مجانية لمدة ٧ أيام. بدون بطاقة ائتمان.",
    monthly: "شهري",
    yearly: "سنوي (وفّر ١٦٪)",
    popular: "الأكثر طلباً",
    subscribe: "اشترك الآن",
    exploreFree: "تصفح المجاني",
    perMonth: "/شهر",
    perYear: "/سنة",
    plans: [
      {
        name: "مجاني",
        price: "0 ﷼",
        priceYearly: "0 ﷼",
        desc: "تصفح محدود للأنظمة الأساسية",
        icon: BookOpen,
        color: "from-zinc-600 to-zinc-500",
        features: [
          "تصفح عناوين الأنظمة فقط",
          "بحث محدود — 5 عمليات/يوم",
          "بدون نصوص كاملة",
          "بدون سوابق قضائية",
        ],
        cta: "ابدأ مجاناً",
        popular: false,
      },
      {
        name: "أساسي",
        price: "49 ﷼",
        priceYearly: "490 ﷼",
        desc: "للأفراد والمنشآت الصغيرة",
        icon: MagnifyingGlass,
        color: "from-[#0B3D2E] to-emerald-600",
        features: [
          "نصوص الأنظمة واللوائح كاملة",
          "بحث ذكي غير محدود",
          "تنبيهات التعديلات الجديدة",
          "تصدير PDF — 10/شهر",
          "دعم البريد الإلكتروني",
        ],
        cta: "اشترك الآن",
        popular: false,
      },
      {
        name: "احترافي",
        price: "149 ﷼",
        priceYearly: "1,490 ﷼",
        desc: "للمحامين والمكاتب القانونية",
        icon: Scales,
        color: "from-[#C8A762] to-amber-600",
        features: [
          "كل مزايا الأساسي",
          "السوابق والمبادئ القضائية",
          "بحث بالمواد والبنود",
          "مقارنة التعديلات (diff)",
          "تصدير PDF — غير محدود",
          "API للتكامل",
          "دعم أولوية",
        ],
        cta: "اشترك الآن",
        popular: true,
      },
      {
        name: "مؤسسي",
        price: "499 ﷼",
        priceYearly: "4,990 ﷼",
        desc: "للشركات الكبرى والجهات الحكومية",
        icon: Buildings,
        color: "from-purple-700 to-purple-500",
        features: [
          "كل مزايا الاحترافي",
          "حسابات فريق — حتى 25 مستخدم",
          "لوحة إدارة الفريق",
          "تقارير استخدام متقدمة",
          "تدريب مخصص",
          "مدير حساب مخصص",
          "SLA 99.9%",
        ],
        cta: "تواصل معنا",
        popular: false,
      },
    ],
    faqTitle: "أسئلة شائعة",
    faqs: [
      { q: "هل يمكنني تجربة الخدمة قبل الاشتراك؟", a: "نعم! جميع الخطط المدفوعة تتضمن فترة تجربة مجانية لمدة 7 أيام كاملة بدون الحاجة لإدخال بطاقة ائتمان." },
      { q: "ما الفرق بين البحث المحدود والبحث الذكي؟", a: "البحث المحدود يسمح بـ 5 عمليات يومية في عناوين الأنظمة فقط. البحث الذكي يتيح بحثاً غير محدود في النصوص الكاملة باستخدام الذكاء الاصطناعي مع اقتراحات ذكية." },
      { q: "هل يمكنني ترقية أو تنزيل خطتي في أي وقت؟", a: "بالتأكيد. يمكنك الترقية فوراً وسيُحسب الفرق تناسبياً. التنزيل يبدأ من دورة الفوترة التالية." },
      { q: "هل المكتبة تشمل الأنظمة الملغاة؟", a: "نعم. نحتفظ بجميع الأنظمة بما فيها الملغاة والمعدلة مع إشارة واضحة لحالة كل نظام وتاريخ التعديل." },
    ],
    backToLibrary: "العودة للمكتبة",
  },
  en: {
    heroTag: "Legal Library",
    heroTitle: "Every Saudi Law & Regulation — In One Place",
    heroSub: "AI-powered search across 5,000+ Saudi laws, regulations, judicial precedents, and legal principles — updated in real-time.",
    stats: [
      { val: "5,000+", label: "Laws & Regulations" },
      { val: "27", label: "Legal Sections" },
      { val: "Daily", label: "Updates" },
      { val: "AI", label: "Smart Search" },
    ],
    plansTitle: "Choose Your Plan",
    plansSub: "All paid plans include a 7-day free trial. No credit card required.",
    monthly: "Monthly",
    yearly: "Yearly (Save 16%)",
    popular: "Most Popular",
    subscribe: "Subscribe Now",
    exploreFree: "Browse Free",
    perMonth: "/mo",
    perYear: "/yr",
    plans: [
      {
        name: "Free",
        price: "0 SAR",
        priceYearly: "0 SAR",
        desc: "Limited browsing of core laws",
        icon: BookOpen,
        color: "from-zinc-600 to-zinc-500",
        features: [
          "Browse law titles only",
          "Limited search — 5/day",
          "No full texts",
          "No judicial precedents",
        ],
        cta: "Start Free",
        popular: false,
      },
      {
        name: "Essential",
        price: "SAR 49",
        priceYearly: "SAR 490",
        desc: "For individuals & small businesses",
        icon: MagnifyingGlass,
        color: "from-[#0B3D2E] to-emerald-600",
        features: [
          "Full law & regulation texts",
          "Unlimited smart search",
          "Amendment alerts",
          "PDF export — 10/month",
          "Email support",
        ],
        cta: "Subscribe Now",
        popular: false,
      },
      {
        name: "Professional",
        price: "SAR 149",
        priceYearly: "SAR 1,490",
        desc: "For lawyers & law firms",
        icon: Scales,
        color: "from-[#C8A762] to-amber-600",
        features: [
          "All Essential features",
          "Judicial precedents & principles",
          "Article-level search",
          "Amendment diff comparison",
          "Unlimited PDF export",
          "API access",
          "Priority support",
        ],
        cta: "Subscribe Now",
        popular: true,
      },
      {
        name: "Enterprise",
        price: "SAR 499",
        priceYearly: "SAR 4,990",
        desc: "For corporations & government",
        icon: Buildings,
        color: "from-purple-700 to-purple-500",
        features: [
          "All Professional features",
          "Team accounts — up to 25 users",
          "Team management dashboard",
          "Advanced usage reports",
          "Custom training",
          "Dedicated account manager",
          "99.9% SLA",
        ],
        cta: "Contact Us",
        popular: false,
      },
    ],
    faqTitle: "Frequently Asked Questions",
    faqs: [
      { q: "Can I try before subscribing?", a: "Yes! All paid plans include a full 7-day free trial with no credit card required." },
      { q: "What's the difference between limited and smart search?", a: "Limited search allows 5 daily queries on titles only. Smart search provides unlimited AI-powered full-text search with intelligent suggestions." },
      { q: "Can I upgrade or downgrade anytime?", a: "Absolutely. Upgrades take effect immediately with prorated pricing. Downgrades begin on your next billing cycle." },
      { q: "Does the library include repealed laws?", a: "Yes. We maintain all laws including repealed and amended ones with clear status indicators and modification dates." },
    ],
    backToLibrary: "Back to Library",
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function LawsSubscribePage() {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const t = isAr ? txt.ar : txt.en;
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const [yearly, setYearly] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const card = isDark
    ? "bg-zinc-900/80 border border-white/[0.06]"
    : "bg-white border border-zinc-100 shadow-sm";

  const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { delay: i * 0.08, duration: 0.45, ease: "easeOut" as const },
    }),
  };

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className={`min-h-[100dvh] ${isDark ? "bg-[#0c0f12] text-zinc-100" : "bg-zinc-50 text-zinc-900"}`}
    >
      <div className="max-w-[1200px] mx-auto px-4 py-8 md:py-16 space-y-16">

        {/* ── Back Link ──────────────────────────────────────────────── */}
        <Link
          href="/laws"
          className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"}`}
        >
          <Arrow size={14} className={isAr ? "" : "rotate-180"} />
          {t.backToLibrary}
        </Link>

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <motion.section variants={fadeUp} initial="hidden" animate="show" custom={0}>
          <div className="flex flex-col lg:flex-row items-start gap-8">
            <div className="flex-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold mb-4 ${
                isDark ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20" : "bg-indigo-100 text-indigo-700"
              }`}>
                <BookOpen size={12} weight="fill" /> {t.heroTag}
              </span>
              <h1 className={`text-3xl md:text-4xl font-bold tracking-tight mb-4 ${isDark ? "text-white" : "text-zinc-900"}`}>
                {t.heroTitle}
              </h1>
              <p className={`text-base leading-relaxed max-w-[60ch] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {t.heroSub}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[280px]">
              {t.stats.map((s, i) => (
                <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}
                  className={`rounded-2xl p-4 text-center ${card}`}
                >
                  <p className={`text-xl font-bold font-mono mb-0.5 ${isDark ? "text-indigo-400" : "text-indigo-700"}`}>{s.val}</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ── Toggle ──────────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5} className="text-center space-y-3">
          <h2 className={`text-2xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{t.plansTitle}</h2>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{t.plansSub}</p>

          <div className={`inline-flex items-center gap-1 p-1 rounded-xl ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
            {[false, true].map(isY => (
              <button
                key={String(isY)}
                onClick={() => setYearly(isY)}
                className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${
                  yearly === isY
                    ? isDark ? "bg-[#0B3D2E] text-[#C8A762] shadow-sm" : "bg-white text-[#0B3D2E] shadow-sm"
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"
                }`}
              >
                {isY ? t.yearly : t.monthly}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Plans Grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {t.plans.map((plan, i) => {
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.name}
                variants={fadeUp} initial="hidden" animate="show" custom={i + 6}
                whileHover={{ y: -4, transition: { type: "spring", stiffness: 200, damping: 20 } }}
                className={`relative rounded-2xl border p-6 transition-all ${
                  plan.popular
                    ? isDark
                      ? "bg-gradient-to-b from-[#C8A762]/10 to-zinc-900/80 border-[#C8A762]/30 ring-1 ring-[#C8A762]/20"
                      : "bg-gradient-to-b from-amber-50/80 to-white border-[#C8A762]/40 ring-1 ring-[#C8A762]/20 shadow-lg"
                    : isDark
                      ? "bg-zinc-900/80 border-white/[0.06] hover:border-white/[0.12]"
                      : "bg-white border-zinc-100 hover:border-zinc-200 shadow-sm"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-[#C8A762] text-[#0B3D2E] text-[10px] font-bold px-3 py-1 rounded-full shadow-md">
                    <Crown size={10} weight="fill" /> {t.popular}
                  </span>
                )}

                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4 shadow`}>
                  <Icon size={20} weight="fill" className="text-white" />
                </div>

                <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>{plan.name}</h3>
                <p className={`text-[12px] mb-4 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{plan.desc}</p>

                <div className="flex items-baseline gap-1 mb-5">
                  <span className={`text-2xl font-bold font-mono ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {yearly ? plan.priceYearly : plan.price}
                  </span>
                  <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                    {yearly ? t.perYear : t.perMonth}
                  </span>
                </div>

                <div className="space-y-2.5 mb-6">
                  {plan.features.map((f, fi) => (
                    <div key={fi} className="flex items-start gap-2">
                      <Check size={13} weight="bold" className={`mt-0.5 shrink-0 ${plan.popular ? "text-[#C8A762]" : isDark ? "text-emerald-500" : "text-emerald-600"}`} />
                      <span className={`text-[12px] leading-snug ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{f}</span>
                    </div>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className={`w-full py-2.5 rounded-xl text-[13px] font-bold transition-all ${
                    plan.popular
                      ? "bg-[#0B3D2E] text-[#C8A762] shadow-md hover:bg-[#155e41]"
                      : isDark
                        ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] border border-white/[0.06]"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200"
                  }`}
                >
                  {plan.cta}
                </motion.button>
              </motion.div>
            );
          })}
        </div>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <motion.section variants={fadeUp} initial="hidden" animate="show" custom={10}>
          <h2 className={`text-xl font-bold mb-6 text-center ${isDark ? "text-white" : "text-zinc-900"}`}>
            {t.faqTitle}
          </h2>
          <div className="max-w-2xl mx-auto space-y-3">
            {t.faqs.map((faq, i) => (
              <div key={i} className={`rounded-xl border overflow-hidden transition-all ${
                isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-zinc-100 bg-white shadow-sm"
              }`}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className={`w-full flex items-center justify-between px-5 py-4 text-start text-[14px] font-semibold transition-colors ${
                    isDark ? "text-zinc-200 hover:bg-white/[0.02]" : "text-zinc-800 hover:bg-zinc-50"
                  }`}
                >
                  {faq.q}
                  <motion.span
                    animate={{ rotate: openFaq === i ? 180 : 0 }}
                    className="shrink-0"
                  >
                    <Arrow size={14} className="rotate-90" />
                  </motion.span>
                </button>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className={`px-5 pb-4 text-[13px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}
                  >
                    {faq.a}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </motion.section>

      </div>
      <FloatingButtons />
    </div>
  );
}
