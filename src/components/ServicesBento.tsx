"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo, memo } from "react";
import { useTheme } from "./ThemeProvider";
import {
  ChatCircleDots,
  Scales,
  FileText,
  Stamp,
  Gavel,
  Brain,
  ArrowLeft,
  ArrowRight,
  MagnifyingGlass,
  Shield,
  Buildings,
  User,
  WarningCircle,
  Money,
} from "@phosphor-icons/react";
import Link from "next/link";

/* ──────────────────────────────────────────────
   Perpetual Micro-Animations (Isolated Components)
   ────────────────────────────────────────────── */

const TypewriterEffect = memo(function TypewriterEffect({ isAr }: { isAr: boolean }) {
  const prompts = useMemo(
    () =>
      isAr
        ? [
            "فحص عقد إيجار تجاري...",
            "صياغة مذكرة دفاع عمالية...",
            "بحث في الأنظمة واللوائح...",
            "محاكاة دفاع الخصم...",
          ]
        : [
            "Reviewing a commercial lease...",
            "Drafting labor defense memo...",
            "Researching regulations...",
            "Simulating opponent defense...",
          ],
    [isAr]
  );
  const [current, setCurrent] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    const text = prompts[current];
    if (typing) {
      if (displayed.length < text.length) {
        const t = setTimeout(() => setDisplayed(text.slice(0, displayed.length + 1)), 60);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setTyping(false), 1500);
        return () => clearTimeout(t);
      }
    } else {
      if (displayed.length > 0) {
        const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30);
        return () => clearTimeout(t);
      } else {
        setCurrent((c) => (c + 1) % prompts.length);
        setTyping(true);
      }
    }
  }, [displayed, typing, current, prompts]);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-surface px-4 py-3 dark:border-white/10 dark:bg-dark-bg">
      <MagnifyingGlass size={16} className="text-ink-faint" />
      <span className="text-sm text-ink-muted">
        {displayed}
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block h-4 w-0.5 bg-gold"
        />
      </span>
    </div>
  );
});

const PulsingDots = memo(function PulsingDots({ isAr }: { isAr: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, delay: i * 0.2, repeat: Infinity }}
          className="h-2 w-2 rounded-full bg-emerald-400"
        />
      ))}
      <span className="mr-2 text-xs text-emerald-600">{isAr ? "نظام يعمل بكفاءة" : "System running efficiently"}</span>
    </div>
  );
});

const InfiniteCarousel = memo(function InfiniteCarousel({ isAr }: { isAr: boolean }) {
  const itemsTop = isAr
    ? ["عمالي", "تجاري", "أحوال شخصية", "جنائي", "إداري", "عقاري", "ملكية فكرية"]
    : ["Labor", "Commercial", "Family", "Criminal", "Administrative", "Real Estate", "IP"];
    
  const itemsBottom = isAr
    ? ["تحكيم", "تأسيس شركات", "تركات", "جرائم إلكترونية", "تنفيذ", "تأمين", "ضريبة"]
    : ["Arbitration", "Company Form.", "Estates", "Cybercrime", "Execution", "Insurance", "Tax"];

  return (
    <div className="overflow-hidden space-y-4">
      {/* Row 1 */}
      <motion.div
        animate={{ x: isAr ? ["0%", "50%"] : ["0%", "-50%"] }}
        transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
        className="flex gap-4 whitespace-nowrap"
      >
        {[...itemsTop, ...itemsTop, ...itemsTop].map((item, i) => (
          <span
            key={`top-${i}`}
            className="rounded-full border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-semibold text-ink-muted dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
          >
            {item}
          </span>
        ))}
      </motion.div>
      
      {/* Row 2 */}
      <motion.div
        animate={{ x: isAr ? ["50%", "0%"] : ["-50%", "0%"] }}
        transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
        className="flex gap-4 whitespace-nowrap"
      >
        {[...itemsBottom, ...itemsBottom, ...itemsBottom].map((item, i) => (
          <span
            key={`btm-${i}`}
            className="rounded-full border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-semibold text-ink-muted dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
          >
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
});

/* ──────────────────────────────────────────────
   Main Bento Grid
   ────────────────────────────────────────────── */

export default function ServicesBento() {
  const { lang, theme } = useTheme();
  const isAr = lang === "ar";
  const isDark = theme === "dark";
  const [activeTab, setActiveTab] = useState<"individual" | "business">("individual");

  const services = {
    individual: [
      { icon: ChatCircleDots, label: isAr ? "استشارات قانونية" : "Consultations", desc: isAr ? "صوتية، مرئية، حضورية، أو بالذكاء الاصطناعي" : "Voice, video, in-person, or AI-powered", href: "/services/consultations", color: "text-royal bg-royal/10" },
      { icon: Scales, label: isAr ? "تمثيل قضائي" : "Litigation", desc: isAr ? "ترافع أمام المحاكم بكل درجاتها" : "Court representation at all levels", href: "/services/cases", color: "text-emerald-600 bg-emerald-500/10" },
      { icon: FileText, label: isAr ? "مراجعة عقود" : "Contracts", desc: isAr ? "تحليل وصياغة عقودك الخاصة" : "Analyze and draft personal contracts", href: "/services/contracts", color: "text-amber-500 bg-amber-500/10" },
      { icon: Stamp, label: isAr ? "توثيق رسمي" : "Notarization", desc: isAr ? "توثيق الوكالات والمحررات الرسمية" : "Official document notarization", href: "/services/notary", color: "text-slate-600 bg-slate-500/10" },
    ],
    business: [
      { icon: Buildings, label: isAr ? "تأسيس شركات" : "Company Form.", desc: isAr ? "تأسيس الشركـات وهيكلتها قانونياً" : "Company formation and legal structuring", href: "/services/corporate", color: "text-royal bg-royal/10" },
      { icon: FileText, label: isAr ? "عقود تجارية" : "Commercial Contracts", desc: isAr ? "صياغة عقود الموردين والمقاولات" : "Drafting supplier and construction contracts", href: "/services/contracts", color: "text-emerald-600 bg-emerald-500/10" },
      { icon: WarningCircle, label: isAr ? "قضايا عمالية" : "Labor Disputes", desc: isAr ? "تمثيل في نزاعات مكتب العمل" : "Representation in labor office disputes", href: "/services/labor", color: "text-amber-500 bg-amber-500/10" },
      { icon: Money, label: isAr ? "تحصيل ديون" : "Debt Collection", desc: isAr ? "تحصيل الديون التجارية المتأخرة" : "Collection of commercial debts", href: "/services/collection", color: "text-rose-500 bg-rose-500/10" },
    ]
  };

  const activeServices = services[activeTab];

  return (
    <section id="services" className="relative py-24 md:py-32 overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-b from-surface/50 via-royal/[0.02] to-surface/50 dark:from-dark-bg dark:via-dark-card/50 dark:to-dark-bg" />

      <div className="relative mx-auto max-w-[1400px] px-4">
        {/* Section Header & Tabs */}
        <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          >
            <span className="text-sm font-bold text-gold-dark">{isAr ? "أبرز الخدمات" : "Featured Services"}</span>
            <h2 className={`font-brand mt-2 text-3xl font-extrabold tracking-tight md:text-5xl ${isDark ? "text-white" : "text-royal"}`}>
              {isAr ? "خدمات قانونية متكاملة" : "Comprehensive Legal Services"}
            </h2>
            <p className={`mt-4 max-w-[55ch] text-base ${isDark ? "text-gray-400" : "text-ink-muted"}`}>
              {isAr ? "مرتبة حسب الأكثر طلباً — اختر الفئة المناسبة لعرض الخدمات" : "Ranked by popularity — pick your category to find what you need"}
            </p>
          </motion.div>

          {/* User Type Tabs */}
          <motion.div
            initial={{ opacity: 0, x: isAr ? -20 : 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex items-center gap-2 rounded-2xl bg-slate-100/80 p-1.5 dark:bg-white/5 backdrop-blur-sm self-start md:self-end"
            role="tablist"
            aria-label={isAr ? "اختر نوع المستخدم" : "Select user type"}
          >
            <button
              role="tab"
              aria-selected={activeTab === "individual"}
              aria-controls="services-individual-panel"
              onClick={() => setActiveTab("individual")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                activeTab === "individual"
                  ? "bg-white text-royal shadow-sm dark:bg-royal dark:text-emerald-400"
                  : "text-ink-muted hover:text-ink dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <User size={18} weight={activeTab === "individual" ? "fill" : "regular"} />
              {isAr ? "أفراد" : "Individuals"}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "business"}
              aria-controls="services-business-panel"
              onClick={() => setActiveTab("business")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                activeTab === "business"
                  ? "bg-white text-royal shadow-sm dark:bg-royal dark:text-emerald-400"
                  : "text-ink-muted hover:text-ink dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <Buildings size={18} weight={activeTab === "business" ? "fill" : "regular"} />
              {isAr ? "أعمال وشركات" : "Businesses"}
            </button>
          </motion.div>
        </div>

        {/* Bento Grid: Row 1 = 3 cols, Row 2 = 2 cols (70/30) per taste-skill */}
        <div className="grid gap-4 md:grid-cols-3 lg:gap-6">
          {/* Large card: AI Showcase — clickable → /ai */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="row-span-2 group/ai overflow-hidden rounded-[2.5rem] border border-slate-200/50 bg-white p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-dark-card md:p-10"
          >
            <Link href="/ai" className="block h-full flex flex-col justify-between">
              <div>
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10 text-gold-dark transition group-hover/ai:bg-gold/20">
                  <Brain size={32} weight="duotone" />
                </span>
                <h3 className={`font-brand mt-5 text-2xl font-bold transition ${isDark ? "text-white group-hover/ai:text-gold" : "text-ink group-hover/ai:text-royal"}`}>
                  {isAr ? "نظامي AI MAX" : "Nezamy AI MAX"}
                </h3>
                <p className={`mt-3 text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-ink-muted"}`}>
                  {isAr ? "مساعدك القانوني الذكي — يجيب على أسئلتك، يفحص عقودك، ويصيغ مذكراتك بسرعة البرق عبر خوارزميات مدرّبة على الأنظمة السعودية." : "Your smart legal assistant — answers questions, reviews contracts, and drafts memos lightning fast using algorithms trained on Saudi laws."}
                </p>

                <div className="mt-8 space-y-4">
                  <TypewriterEffect isAr={isAr} />
                  <div className="rounded-2xl border border-gold/10 bg-gold/[0.03] p-5">
                    <div className="mb-3 text-xs font-bold text-gold-dark">{isAr ? "نتائج التحليل الفوري" : "Instant Analysis Results"}</div>
                    <div className="space-y-3">
                      {(isAr ? ["بند تعسفي محتمل في المادة ٧", "مدة الإشعار غير مطابقة للنظام", "الشرط الجزائي مبالغ فيه"] : ["Potential unfair clause in Art. 7", "Notice period non-compliant", "Excessive penalty clause"]).map((item, i) => (
                        <motion.div
                          key={item}
                          initial={{ opacity: 0, x: 10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.3 + i * 0.1 }}
                          className={`flex items-start gap-3 text-xs font-medium ${isDark ? "text-gray-300" : "text-ink-muted"}`}
                        >
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400 dark:bg-rose-500" />
                          <span>{item}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                  <PulsingDots isAr={isAr} />
                </div>
              </div>
              <div className="mt-8 flex items-center gap-2 text-sm font-bold text-royal dark:text-emerald-400 opacity-80 transition-all group-hover/ai:opacity-100 group-hover/ai:gap-3">
                {isAr ? "ابدأ تجربتك المجانية" : "Start Free Trial"}
                {isAr ? <ArrowLeft size={16} weight="bold" /> : <ArrowRight size={16} weight="bold" />}
              </div>
            </Link>
          </motion.div>

          {/* Service cards */}
          <AnimatePresence mode="popLayout">
            {activeServices.map((service, i) => (
              <motion.a
                key={service.label}
                href={service.href}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  type: "spring",
                  stiffness: 150,
                  damping: 20,
                  delay: i * 0.05,
                }}
                className={`group flex flex-col justify-between rounded-[2rem] border transition-all hover:-translate-y-1 hover:shadow-xl dark:shadow-none p-6 md:p-8 ${
                  isDark
                    ? "border-white/10 bg-dark-card hover:border-white/20"
                    : "border-slate-200/50 bg-white hover:border-royal/20"
                }`}
              >
                <div>
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${service.color}`}>
                    <service.icon size={24} weight="duotone" />
                  </span>
                  <h3 className={`font-brand mt-5 text-lg font-bold ${isDark ? "text-white group-hover:text-emerald-400" : "text-ink group-hover:text-royal"} transition-colors`}>
                    {service.label}
                  </h3>
                  <p className={`mt-2 text-xs leading-relaxed ${isDark ? "text-gray-400" : "text-ink-muted"} md:text-sm`}>{service.desc}</p>
                </div>
                <div className={`mt-6 flex items-center gap-1.5 text-xs font-semibold ${isDark ? "text-emerald-400/50 group-hover:text-emerald-400" : "text-royal/50 group-hover:text-royal"} transition-all group-hover:gap-2.5`}>
                  {isAr ? "اطلب الخدمة" : "Request Service"}
                  {isAr ? <ArrowLeft size={14} weight="bold" /> : <ArrowRight size={14} weight="bold" />}
                </div>
              </motion.a>
            ))}
          </AnimatePresence>
        </div>

        {/* Dual Marquee Specializations */}
        <div className="mt-8 rounded-[2.5rem] border border-slate-200/50 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-dark-card">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gold" />
            <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-ink"}`}>
              {isAr ? "نغطي كافة التخصصات القانونية" : "We cover all legal specializations"}
            </span>
          </div>
          <InfiniteCarousel isAr={isAr} />
        </div>
      </div>
    </section>
  );
}
