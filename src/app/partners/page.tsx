"use client";

import { motion } from "framer-motion";
import {
  Handshake,
  Buildings,
  Globe,
  ChartLineUp,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Scales,
  CaretRight,
  Star,
  Users,
  CurrencyDollar,
  ShieldCheck,
  Megaphone,
  Code,
  Gavel,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const partnerTypes = [
  {
    icon: Gavel,
    titleAr: "شركات محاماة وكُتّاب عدل",
    titleEn: "Law Firms & Notaries",
    descAr: "احصل على تدفق مستمر من العملاء المؤهّلين وروّج لخدماتك لآلاف المستخدمين يومياً.",
    descEn: "Get a steady flow of qualified clients and promote your services to thousands daily.",
    badge: "🏢",
    color: "from-royal/10 to-royal/5",
    accent: "text-royal dark:text-gold",
    border: "border-royal/15 dark:border-gold/20",
  },
  {
    icon: Buildings,
    titleAr: "شركات التأمين والمستثمرون",
    titleEn: "Insurance Companies & Investors",
    descAr: "وفّر حلولاً قانونية متكاملة لعملائك من خلال شراكة استراتيجية مع نظامي.",
    descEn: "Provide integrated legal solutions to your clients through a strategic partnership with Nezamy.",
    badge: "🏦",
    color: "from-blue-50 to-blue-50/30",
    accent: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200/50 dark:border-blue-500/20",
  },
  {
    icon: Code,
    titleAr: "شركاء التقنية والتكامل",
    titleEn: "Technology & Integration Partners",
    descAr: "ادمج API نظامي في منتجاتك وابنِ تجارب قانونية رائدة لعملائك.",
    descEn: "Integrate Nezamy's API into your products and build leading legal experiences for your clients.",
    badge: "⚡",
    color: "from-violet-50 to-violet-50/30",
    accent: "text-violet-600 dark:text-violet-400",
    border: "border-violet-200/50 dark:border-violet-500/20",
  },
  {
    icon: Megaphone,
    titleAr: "سفراء ومؤثرون",
    titleEn: "Ambassadors & Influencers",
    descAr: "اكسب عمولات مستمرة بمجرد إحالة عملاء جُدد إلى المنصة برابط خاص بك.",
    descEn: "Earn ongoing commissions by referring new clients to the platform with your unique link.",
    badge: "🌟",
    color: "from-amber-50 to-amber-50/30",
    accent: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200/50 dark:border-amber-500/20",
  },
];

const benefits = [
  { icon: Users,         ar: "الوصول لأكثر من ١٢٠,٠٠٠ مستخدم نشط", en: "Access 120K+ active users" },
  { icon: CurrencyDollar, ar: "عمولات وعائدات مضمونة وشفافة", en: "Guaranteed & transparent revenue" },
  { icon: ChartLineUp,   ar: "لوحة تحكم شريك متخصصة وتقارير تفصيلية", en: "Dedicated partner dashboard & detailed reports" },
  { icon: ShieldCheck,   ar: "دعم مخصص من فريق نظامي طوال الوقت", en: "Dedicated support from Nezamy's team" },
  { icon: Globe,         ar: "حضور وتسويق مشترك في المملكة العربية السعودية", en: "Co-marketing presence across Saudi Arabia" },
  { icon: Star,          ar: "برنامج احتفاء وتقدير للشركاء المتميزين", en: "Recognition & rewards for top partners" },
];

const stats = [
  { valueAr: "+١٢٠ ألف", valueEn: "120K+", labelAr: "مستخدم نشط", labelEn: "Active Users" },
  { valueAr: "٥,٢٠٠+", valueEn: "5,200+", labelAr: "قضية مُنجزة", labelEn: "Cases Resolved" },
  { valueAr: "٩٧٪", valueEn: "97%", labelAr: "رضا العملاء", labelEn: "Client Satisfaction" },
  { valueAr: "+٣٤٠", valueEn: "340+", labelAr: "شريك وموفر", labelEn: "Partners & Providers" },
];

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.09 } },
};
const item = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
};

export default function PartnersPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";

  return (
    <div dir={dir} className="min-h-screen bg-surface font-body dark:bg-dark-bg">
      {/* Navbar placeholder spacer */}
      <div className="h-16" />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(11,61,46,0.06),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(200,167,98,0.05),transparent_50%)]" />
        </div>

        <div className="mx-auto max-w-7xl px-5 py-20 md:py-28 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:items-center">
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="relative z-10"
          >
            <motion.div variants={item} className="mb-5 inline-flex items-center gap-2 rounded-full border border-royal/15 dark:border-gold/20 bg-royal/5 dark:bg-royal/10 px-4 py-2">
              <Handshake size={16} weight="duotone" className="text-royal dark:text-gold" />
              <span className="text-xs font-semibold text-royal dark:text-gold">
                {isAr ? "برنامج شركاء نظامي" : "Nezamy Partner Program"}
              </span>
            </motion.div>

            <motion.h1 variants={item} className="font-brand text-4xl md:text-5xl lg:text-6xl font-bold text-ink dark:text-gray-100 leading-tight tracking-tight mb-5">
              {isAr
                ? (<>انمُ معنا.<br /><span className="text-royal dark:text-gold">شراكة تُبنى على النتائج</span></>)
                : (<>Grow With Us.<br /><span className="text-royal dark:text-gold">Partnership Built on Results</span></>)
              }
            </motion.h1>
            <motion.p variants={item} className="text-base text-ink-muted dark:text-gray-400 leading-relaxed max-w-[56ch] mb-8">
              {isAr
                ? "سواء كنت محامياً، شركة تقنية، أو مؤثراً رقمياً — نظامي يوفر لك شراكة مخصصة تضمن لك عملاء منتظمين وعائداً حقيقياً."
                : "Whether you're a law firm, tech company, or digital influencer — Nezamy offers a tailored partnership that guarantees steady clients and real revenue."}
            </motion.p>
            <motion.div variants={item} className="flex flex-wrap gap-3">
              <motion.a
                href="#apply"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2.5 rounded-2xl bg-royal px-7 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all"
              >
                {isAr ? "ابدأ الشراكة الآن" : "Start Partnership Now"}
                {isAr ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
              </motion.a>
              <a href="#types" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card px-6 py-3.5 text-sm font-medium text-ink-muted dark:text-gray-300 hover:border-royal/20 hover:text-royal dark:hover:text-gold transition-all">
                {isAr ? "أنواع الشراكات" : "Partnership Types"}
              </a>
            </motion.div>
          </motion.div>

          {/* Stats grid */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="mt-14 lg:mt-0 grid grid-cols-2 gap-4"
          >
            {stats.map((s, i) => (
              <motion.div
                key={i}
                variants={item}
                className="rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white dark:bg-dark-card p-6 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)]"
              >
                <div className="font-brand text-3xl font-bold text-royal dark:text-gold mb-1">
                  {isAr ? s.valueAr : s.valueEn}
                </div>
                <div className="text-sm text-ink-muted dark:text-gray-400">
                  {isAr ? s.labelAr : s.labelEn}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Partner Types ── */}
      <section id="types" className="py-20 bg-slate-50/60 dark:bg-dark-card/30">
        <div className="mx-auto max-w-7xl px-5">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="mb-12 text-center"
          >
            <h2 className="font-brand text-3xl md:text-4xl font-bold text-ink dark:text-gray-100 mb-3">
              {isAr ? "أنواع الشراكات المتاحة" : "Available Partnership Types"}
            </h2>
            <p className="text-ink-muted dark:text-gray-400 text-base max-w-[50ch] mx-auto">
              {isAr ? "نوفر برامج شراكة مخصصة لكل نوع من الشركاء" : "We offer tailored partnership programs for every type of partner"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {partnerTypes.map((type, i) => {
              const Icon = type.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07, type: "spring", stiffness: 240, damping: 22 }}
                  className={`group relative rounded-3xl border ${type.border} bg-gradient-to-br ${type.color} p-7 transition-all hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.1)]`}
                >
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-dark-card shadow-sm ${type.accent}`}>
                    <Icon size={24} weight="duotone" />
                  </div>
                  <h3 className={`font-brand text-lg font-bold mb-2 text-ink dark:text-gray-100`}>
                    {isAr ? type.titleAr : type.titleEn}
                  </h3>
                  <p className="text-sm text-ink-muted dark:text-gray-400 leading-relaxed">
                    {isAr ? type.descAr : type.descEn}
                  </p>
                  <div className={`mt-4 flex items-center gap-1.5 text-xs font-semibold ${type.accent} group-hover:gap-2.5 transition-all`}>
                    {isAr ? "تعرف على المزيد" : "Learn more"}
                    {isAr ? <ArrowLeft size={13} /> : <CaretRight size={13} />}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-5">
          <div className="lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:items-center">
            <motion.div
              initial={{ opacity: 0, x: isAr ? 30 : -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 200, damping: 22 }}
            >
              <h2 className="font-brand text-3xl md:text-4xl font-bold text-ink dark:text-gray-100 mb-4">
                {isAr ? "لماذا تختار الشراكة مع نظامي؟" : "Why Partner With Nezamy?"}
              </h2>
              <p className="text-ink-muted dark:text-gray-400 text-base mb-8 leading-relaxed max-w-[48ch]">
                {isAr
                  ? "نوفر لشركائنا بيئة متكاملة من الدعم والأدوات والفرص لتنمية أعمالهم بشكل مستدام."
                  : "We provide our partners with a complete ecosystem of support, tools, and opportunities to grow their business sustainably."}
              </p>
              <motion.a
                href="#apply"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2.5 rounded-2xl bg-royal px-7 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all"
              >
                {isAr ? "قدّم طلب شراكة" : "Apply for Partnership"}
                {isAr ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
              </motion.a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: isAr ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 200, damping: 22, delay: 0.1 }}
              className="mt-10 lg:mt-0 grid grid-cols-1 gap-3"
            >
              {benefits.map((b, i) => {
                const Icon = b.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06 }}
                    className="flex items-center gap-4 rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white dark:bg-dark-card px-5 py-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal/6 dark:bg-royal/15 text-royal dark:text-gold">
                      <Icon size={20} weight="duotone" />
                    </div>
                    <span className="text-sm font-medium text-ink dark:text-gray-200">
                      {isAr ? b.ar : b.en}
                    </span>
                    <CheckCircle size={18} className="ms-auto shrink-0 text-emerald-500" weight="fill" />
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Apply CTA ── */}
      <section id="apply" className="py-20">
        <div className="mx-auto max-w-3xl px-5">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="rounded-3xl bg-royal p-10 md:p-14 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(200,167,98,0.18),transparent_60%)] pointer-events-none" />
            <div className="relative z-10">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/20 text-gold">
                <Scales size={28} weight="duotone" />
              </div>
              <h2 className="font-brand text-3xl font-bold text-white mb-3">
                {isAr ? "هل أنت مستعد للشراكة؟" : "Ready to Partner?"}
              </h2>
              <p className="text-white/65 text-base mb-8 max-w-[44ch] mx-auto leading-relaxed">
                {isAr
                  ? "تواصل مع فريقنا المخصص للشراكات وسنرد عليك خلال 24 ساعة."
                  : "Connect with our dedicated partnerships team and we'll respond within 24 hours."}
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <motion.a
                  href="mailto:partners@nezamy.com"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2.5 rounded-2xl bg-gold px-8 py-4 text-sm font-bold text-royal shadow-[0_8px_24px_-6px_rgba(200,167,98,0.5)] hover:bg-gold-light transition-all"
                >
                  {isAr ? "تواصل معنا للشراكة" : "Contact for Partnership"}
                  {isAr ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                </motion.a>
                <a href="/contact" className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-4 text-sm font-medium text-white hover:bg-white/20 transition-all">
                  {isAr ? "معرفة المزيد" : "Learn More"}
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
