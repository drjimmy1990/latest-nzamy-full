"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scales,
  Gavel,
  Clock,
  CurrencyDollar,
  Lock,
  CheckCircle,
  XCircle,
  ArrowRight,
  ShieldCheck,
  Globe,
  Handshake,
  Buildings,
  Factory,
  HouseLine,
  ChartLine,
  Plus,
  Minus,
  FileText,
  UserCircle,
  ChatText,
  VideoCamera,
  Stamp,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeUp: any = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: "easeOut" },
  }),
};

const comparisonPoints = [
  {
    label_ar: "الوقت",
    label_en: "Time",
    court_ar: "سنوات من التقاضي",
    court_en: "Years of litigation",
    arb_ar: "أسابيع إلى أشهر",
    arb_en: "Weeks to months",
    icon: Clock,
  },
  {
    label_ar: "التكلفة",
    label_en: "Cost",
    court_ar: "رسوم قضائية مرتفعة",
    court_en: "High court fees",
    arb_ar: "تكلفة أقل وأكثر وضوحاً",
    arb_en: "Lower and clearer cost",
    icon: CurrencyDollar,
  },
  {
    label_ar: "السرية",
    label_en: "Confidentiality",
    court_ar: "إجراءات علنية",
    court_en: "Public proceedings",
    arb_ar: "إجراءات سرية تامة",
    arb_en: "Fully private proceedings",
    icon: Lock,
  },
  {
    label_ar: "الحكم النهائي",
    label_en: "Final Award",
    court_ar: "قابل للطعن والاستئناف",
    court_en: "Subject to appeal",
    arb_ar: "ملزم ونهائي في أغلب الأحيان",
    arb_en: "Binding and mostly final",
    icon: Gavel,
  },
];

const arbitrationSteps = [
  {
    icon: FileText,
    ar: "تقديم الطلب",
    en: "Submit Request",
    desc_ar: "يقدم الطرف طلب التحكيم مع ملخص النزاع والمطالبات",
    desc_en: "Party submits arbitration request with dispute summary and claims",
    num: "01",
  },
  {
    icon: UserCircle,
    ar: "تعيين المحكّم",
    en: "Appoint Arbitrator",
    desc_ar: "يتفق الطرفان على محكّم محايد من قائمة المحكّمين المعتمدين",
    desc_en: "Parties agree on a neutral arbitrator from the certified list",
    num: "02",
  },
  {
    icon: ChatText,
    ar: "تبادل المذكرات",
    en: "Exchange Briefs",
    desc_ar: "يقدم كل طرف مذكراته وأدلته وردوده خلال مهلة محددة",
    desc_en: "Each party submits briefs, evidence, and responses within a set timeline",
    num: "03",
  },
  {
    icon: VideoCamera,
    ar: "جلسة التحكيم",
    en: "Arbitration Hearing",
    desc_ar: "تُعقد الجلسة حضورياً أو عن بُعد، ويُستمع لحجج الطرفين",
    desc_en: "Session held in-person or remotely; both parties present arguments",
    num: "04",
  },
  {
    icon: Stamp,
    ar: "إصدار الحكم",
    en: "Award Issued",
    desc_ar: "يُصدر المحكّم حكمه الملزم ويُسجَّل رسمياً",
    desc_en: "Arbitrator issues binding award, officially registered",
    num: "05",
  },
];

const arbitratorTypes = [
  {
    icon: Handshake,
    ar: "تجاري",
    en: "Commercial",
    desc_ar: "نزاعات العقود التجارية والشراكات",
    desc_en: "Commercial contracts and partnership disputes",
    color: "from-blue-500/20 to-blue-600/10",
    border: "border-blue-500/30",
    iconColor: "text-blue-400",
  },
  {
    icon: Buildings,
    ar: "عمالي",
    en: "Labor",
    desc_ar: "نزاعات العمل وعقود التوظيف",
    desc_en: "Labor disputes and employment contracts",
    color: "from-amber-500/20 to-amber-600/10",
    border: "border-amber-500/30",
    iconColor: "text-amber-400",
  },
  {
    icon: HouseLine,
    ar: "عقاري",
    en: "Real Estate",
    desc_ar: "نزاعات الملكية العقارية والإيجارات",
    desc_en: "Property ownership and lease disputes",
    color: "from-emerald-500/20 to-emerald-600/10",
    border: "border-emerald-500/30",
    iconColor: "text-emerald-400",
  },
  {
    icon: ChartLine,
    ar: "مالي",
    en: "Financial",
    desc_ar: "نزاعات الاستثمار والخدمات المالية",
    desc_en: "Investment and financial services disputes",
    color: "from-purple-500/20 to-purple-600/10",
    border: "border-purple-500/30",
    iconColor: "text-purple-400",
  },
];

const trustSignals = [
  {
    icon: ShieldCheck,
    ar: "متوافق مع هيئة الاستثمار",
    en: "SAGIA Compliant",
    desc_ar: "معتمد ومتوافق مع متطلبات هيئة الاستثمار السعودية",
    desc_en: "Certified and compliant with Saudi Investment Authority requirements",
  },
  {
    icon: Globe,
    ar: "معترف به دولياً",
    en: "Internationally Enforced",
    desc_ar: "أحكامنا قابلة للتنفيذ في أكثر من ١٦٠ دولة وفق اتفاقية نيويورك",
    desc_en: "Awards enforceable in 160+ countries under the New York Convention",
  },
  {
    icon: Lock,
    ar: "سرية تامة",
    en: "Full Confidentiality",
    desc_ar: "جميع الإجراءات والوثائق محمية بسرية تعاقدية صارمة",
    desc_en: "All proceedings and documents protected by strict contractual confidentiality",
  },
];

const faqs = [
  {
    q_ar: "هل التحكيم ملزم قانونياً في المملكة العربية السعودية؟",
    q_en: "Is arbitration legally binding in Saudi Arabia?",
    a_ar:
      "نعم، يُنظّم التحكيم نظام التحكيم السعودي الصادر بالمرسوم الملكي م/34، وأحكامه ملزمة وقابلة للتنفيذ قضائياً.",
    a_en:
      "Yes, arbitration is governed by the Saudi Arbitration Law issued by Royal Decree M/34; awards are binding and judicially enforceable.",
  },
  {
    q_ar: "كم تستغرق إجراءات التحكيم عادةً؟",
    q_en: "How long do arbitration proceedings typically take?",
    a_ar:
      "تتراوح إجراءات التحكيم بين ٣ و١٢ شهراً حسب تعقيد النزاع، في مقابل سنوات متعددة في المحاكم.",
    a_en:
      "Proceedings typically range from 3 to 12 months depending on dispute complexity, versus several years in courts.",
  },
  {
    q_ar: "هل يمكن التحكيم في النزاعات العمالية؟",
    q_en: "Can labor disputes go to arbitration?",
    a_ar:
      "نعم، يمكن التحكيم في كثير من نزاعات العمل، وإن كانت بعض المسائل تستلزم إجراءات المحاكم العمالية.",
    a_en:
      "Yes, many labor disputes can be arbitrated, although some matters require labor court procedures.",
  },
  {
    q_ar: "ما الفرق بين التحكيم والوساطة؟",
    q_en: "What is the difference between arbitration and mediation?",
    a_ar:
      "الوساطة تسعى إلى التوفيق دون إلزام، أما التحكيم فيصدر فيه محكّم مستقل حكماً ملزماً للطرفين.",
    a_en:
      "Mediation seeks reconciliation without binding outcome, while arbitration produces a binding award from an independent arbitrator.",
  },
];

export default function ArbitrationPage() {
  const { isRTL, isDark, t } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div
      className={`min-h-screen bg-white dark:bg-dark-bg ${isRTL ? "font-arabic" : ""}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />
      <FloatingButtons />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0B3D2E] via-[#0d4a38] to-[#071f17] pt-32 pb-28">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(ellipse_at_30%_60%,#C8A762_0%,transparent_55%)]" />
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, #C8A762 0, #C8A762 1px, transparent 0, transparent 50%)", backgroundSize: "24px 24px" }} />

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 mb-7"
            >
              <Scales size={16} className="text-[#C8A762]" weight="fill" />
              <span className="text-white/80 text-sm">
                {isRTL ? "خدمات التحكيم التجاري" : "Commercial Arbitration Services"}
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.1}
              className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight"
            >
              {isRTL ? "التحكيم التجاري" : "Commercial Arbitration"}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.2}
              className="text-xl text-white/70 mb-12 max-w-2xl mx-auto leading-relaxed"
            >
              {isRTL
                ? "احسم نزاعاتك التجارية بشكل أسرع وأقل تكلفة من المحاكم، مع الحفاظ على السرية وضمان التنفيذ الدولي"
                : "Resolve your commercial disputes faster and cheaper than courts, while maintaining confidentiality and ensuring international enforceability"}
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.3}
              className="flex flex-wrap justify-center gap-6"
            >
              {[
                { ar: "أسرع بـ٣ مرات", en: "3× Faster", sub_ar: "من المحاكم", sub_en: "than courts" },
                { ar: "أقل تكلفة بـ٤٠٪", en: "40% Lower Cost", sub_ar: "في المتوسط", sub_en: "on average" },
                { ar: "+١٦٠ دولة", en: "160+ Countries", sub_ar: "قابل للتنفيذ", sub_en: "enforceable" },
              ].map((stat, i) => (
                <div key={i} className="bg-white/10 border border-white/15 rounded-2xl px-8 py-5 text-center">
                  <div className="text-2xl font-black text-[#C8A762]">{isRTL ? stat.ar : stat.en}</div>
                  <div className="text-white/50 text-sm mt-1">{isRTL ? stat.sub_ar : stat.sub_en}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Why Arbitration: Comparison Cards ── */}
      <section className="py-24 bg-gray-50 dark:bg-dark-bg">
        <div className="container mx-auto px-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {isRTL ? "لماذا التحكيم؟" : "Why Choose Arbitration?"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {isRTL
                ? "قارن بين التقاضي التقليدي والتحكيم التجاري لاختيار الأنسب لنزاعك"
                : "Compare traditional litigation and commercial arbitration to choose what fits your dispute"}
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* Litigation Card */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="rounded-3xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-dark-card overflow-hidden shadow-md"
            >
              <div className="bg-red-50 dark:bg-red-950/30 px-6 py-5 flex items-center gap-3 border-b border-red-100 dark:border-red-900/30">
                <Buildings size={24} className="text-red-500" weight="duotone" />
                <h3 className="text-lg font-bold text-red-700 dark:text-red-400">
                  {isRTL ? "التقاضي" : "Litigation"}
                </h3>
              </div>
              <div className="p-6 space-y-4">
                {comparisonPoints.map((point, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <XCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" weight="fill" />
                    <div>
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {isRTL ? point.label_ar : point.label_en}
                      </span>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {isRTL ? point.court_ar : point.court_en}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Arbitration Card */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={0.1}
              className="rounded-3xl border border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-dark-card overflow-hidden shadow-xl ring-2 ring-[#0B3D2E]/20 dark:ring-[#C8A762]/20"
            >
              <div className="bg-[#0B3D2E] px-6 py-5 flex items-center gap-3">
                <Scales size={24} className="text-[#C8A762]" weight="duotone" />
                <h3 className="text-lg font-bold text-white">
                  {isRTL ? "التحكيم" : "Arbitration"}
                </h3>
                <span className="ms-auto bg-[#C8A762]/20 border border-[#C8A762]/30 text-[#C8A762] text-xs font-bold px-3 py-1 rounded-full">
                  {isRTL ? "الأفضل" : "Best Choice"}
                </span>
              </div>
              <div className="p-6 space-y-4">
                {comparisonPoints.map((point, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle size={18} className="text-[#0B3D2E] dark:text-[#C8A762] mt-0.5 flex-shrink-0" weight="fill" />
                    <div>
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {isRTL ? point.label_ar : point.label_en}
                      </span>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {isRTL ? point.arb_ar : point.arb_en}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Arbitration Process ── */}
      <section className="py-24 bg-white dark:bg-[#0e1318]">
        <div className="container mx-auto px-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {isRTL ? "مراحل إجراءات التحكيم" : "Arbitration Process Stages"}
            </h2>
          </motion.div>

          <div className="relative max-w-5xl mx-auto">
            {/* Connecting line */}
            <div className="absolute top-14 start-[10%] end-[10%] h-0.5 bg-gradient-to-r from-[#C8A762]/10 via-[#C8A762]/50 to-[#C8A762]/10 hidden lg:block" />

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-8">
              {arbitrationSteps.map((step, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  custom={i * 0.1}
                  className="flex flex-col items-center text-center relative"
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#0B3D2E] to-[#0d5038] flex items-center justify-center shadow-lg shadow-[#0B3D2E]/30 mb-5 relative z-10">
                    <step.icon size={28} className="text-[#C8A762]" weight="duotone" />
                    <span className="absolute -top-1 -end-1 w-6 h-6 rounded-full bg-[#C8A762] text-[#0B3D2E] text-xs font-black flex items-center justify-center">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-white mb-2">
                    {isRTL ? step.ar : step.en}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {isRTL ? step.desc_ar : step.desc_en}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Arbitrator Types ── */}
      <section className="py-24 bg-gray-50 dark:bg-dark-bg">
        <div className="container mx-auto px-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {isRTL ? "تخصصات محكّمينا" : "Our Arbitrators' Specialties"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {isRTL
                ? "محكّمون معتمدون بخبرة عميقة في تخصصاتهم القانونية والتجارية"
                : "Certified arbitrators with deep expertise in their legal and commercial specialties"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {arbitratorTypes.map((type, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.08}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className={`bg-gradient-to-br ${type.color} border ${type.border} dark:bg-dark-card rounded-2xl p-6 text-center shadow-sm hover:shadow-xl transition-all duration-300`}
              >
                <div className={`w-14 h-14 rounded-2xl bg-white/10 dark:bg-white/5 flex items-center justify-center mx-auto mb-4`}>
                  <type.icon size={28} className={type.iconColor} weight="duotone" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                  {isRTL ? type.ar : type.en}
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  {isRTL ? type.desc_ar : type.desc_en}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust Signals ── */}
      <section className="py-20 bg-[#0B3D2E]">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {trustSignals.map((signal, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.1}
                className="text-center"
              >
                <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-4">
                  <signal.icon size={30} className="text-[#C8A762]" weight="duotone" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  {isRTL ? signal.ar : signal.en}
                </h3>
                <p className="text-white/55 text-sm leading-relaxed">
                  {isRTL ? signal.desc_ar : signal.desc_en}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 bg-white dark:bg-[#0e1318]">
        <div className="container mx-auto px-6 max-w-2xl">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {isRTL ? "أسئلة شائعة" : "Frequently Asked Questions"}
            </h2>
          </motion.div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.08}
                className="border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 bg-white dark:bg-dark-card hover:bg-gray-50 dark:hover:bg-[#1c2330] transition-colors text-left"
                >
                  <span className="font-semibold text-gray-900 dark:text-white text-sm md:text-base">
                    {isRTL ? faq.q_ar : faq.q_en}
                  </span>
                  <span className="flex-shrink-0 ms-4">
                    {openFaq === i ? (
                      <Minus size={18} className="text-[#0B3D2E] dark:text-[#C8A762]" />
                    ) : (
                      <Plus size={18} className="text-gray-400" />
                    )}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" as const }}
                    >
                      <div className="px-5 pb-5 bg-gray-50 dark:bg-[#111620] text-sm text-gray-600 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-white/5 pt-4">
                        {isRTL ? faq.a_ar : faq.a_en}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 bg-gradient-to-br from-[#0B3D2E] to-[#071f17]">
        <div className="container mx-auto px-6 text-center">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <Gavel size={52} className="text-[#C8A762] mx-auto mb-6" weight="duotone" />
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {isRTL ? "هل لديك نزاع تجاري؟" : "Do You Have a Commercial Dispute?"}
            </h2>
            <p className="text-white/60 mb-10 max-w-lg mx-auto">
              {isRTL
                ? "تواصل مع فريقنا للحصول على استشارة أولية مجانية وتقييم فرص التحكيم في قضيتك"
                : "Contact our team for a free initial consultation and assessment of arbitration options for your case"}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <motion.a
                href="/contact"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-3 bg-[#C8A762] hover:bg-[#d4b472] text-[#0B3D2E] font-bold px-10 py-4 rounded-2xl text-lg shadow-lg shadow-[#C8A762]/20 transition-colors"
              >
                {isRTL ? "ابدأ التحكيم الآن" : "Start Arbitration Now"}
                <ArrowRight size={20} className={isRTL ? "rotate-180" : ""} />
              </motion.a>
              <motion.a
                href="/services"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold px-8 py-4 rounded-2xl text-lg transition-colors"
              >
                {isRTL ? "تعرف على خدماتنا" : "Explore Our Services"}
              </motion.a>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
