"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Buildings,
  Stamp,
  UserCheck,
  Scales,
  Users,
  Lock,
  Robot,
  ChartBar,
  Clock,
  Headset,
  Star,
  CaretDown,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CurrencyCircleDollar,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

const providerTypes = [
  {
    icon: Briefcase,
    ar: "محامٍ",
    en: "Lawyer",
    descAr: "تقديم استشارات قانونية وتمثيل قضائي",
    descEn: "Legal consultations and court representation",
    earningAr: "١٢,٠٠٠ – ٢٥,٠٠٠ ر.س / شهر",
    earningEn: "SAR 12,000 – 25,000 / month",
  },
  {
    icon: Buildings,
    ar: "شركة قانونية",
    en: "Law Firm",
    descAr: "تعاملات مؤسسية وخدمات متكاملة",
    descEn: "Corporate dealings and full-service legal",
    earningAr: "٤٠,٠٠٠ – ١٢٠,٠٠٠ ر.س / شهر",
    earningEn: "SAR 40,000 – 120,000 / month",
  },
  {
    icon: Stamp,
    ar: "موثّق",
    en: "Notary",
    descAr: "توثيق العقود والوثائق الرسمية",
    descEn: "Contracts and official document notarization",
    earningAr: "٨,٠٠٠ – ١٨,٠٠٠ ر.س / شهر",
    earningEn: "SAR 8,000 – 18,000 / month",
  },
  {
    icon: UserCheck,
    ar: "معقّب",
    en: "Legal Runner",
    descAr: "إنجاز المعاملات الحكومية والرسمية",
    descEn: "Government and official transactions",
    earningAr: "٦,٠٠٠ – ١٤,٠٠٠ ر.س / شهر",
    earningEn: "SAR 6,000 – 14,000 / month",
  },
  {
    icon: Scales,
    ar: "محكّم",
    en: "Arbitrator",
    descAr: "فض النزاعات والتحكيم التجاري",
    descEn: "Dispute resolution and commercial arbitration",
    earningAr: "١٥,٠٠٠ – ٣٥,٠٠٠ ر.س / شهر",
    earningEn: "SAR 15,000 – 35,000 / month",
  },
];

const benefits = [
  {
    icon: Users,
    ar: "عملاء مستمرون",
    en: "Steady Clients",
    descAr: "تدفق منتظم من الطلبات عبر منصتنا المتنامية",
    descEn: "Regular flow of requests through our growing platform",
  },
  {
    icon: Lock,
    ar: "دفع آمن (Escrow)",
    en: "Secure Escrow Payments",
    descAr: "أموالك محمية حتى اكتمال الخدمة",
    descEn: "Funds protected until service completion",
  },
  {
    icon: Robot,
    ar: "إدارة قضايا بالذكاء الاصطناعي",
    en: "AI Case Management",
    descAr: "أدوات ذكية لإدارة القضايا وتتبع المواعيد",
    descEn: "Smart tools to manage cases and track deadlines",
  },
  {
    icon: ChartBar,
    ar: "تقارير تفصيلية",
    en: "Detailed Reports",
    descAr: "لوحة تحكم شاملة لأداءك ودخلك",
    descEn: "Comprehensive dashboard for your performance and earnings",
  },
  {
    icon: Clock,
    ar: "مرونة في العمل",
    en: "Work Flexibility",
    descAr: "حدد أوقاتك وأسعارك بنفسك",
    descEn: "Set your own hours and rates",
  },
  {
    icon: Headset,
    ar: "دعم مستمر",
    en: "Continuous Support",
    descAr: "فريق دعم متخصص على مدار الساعة",
    descEn: "Specialized support team around the clock",
  },
];

const steps = [
  {
    num: "١",
    numEn: "1",
    ar: "سجّل حسابك",
    en: "Register your account",
    descAr: "أنشئ حسابك وأدخل بياناتك الأساسية",
    descEn: "Create your account and enter your basic information",
  },
  {
    num: "٢",
    numEn: "2",
    ar: "رفع المستندات",
    en: "Upload documents",
    descAr: "ارفع وثائق الترخيص والهوية المطلوبة",
    descEn: "Upload required license and identity documents",
  },
  {
    num: "٣",
    numEn: "3",
    ar: "مراجعة الفريق",
    en: "Team review",
    descAr: "يراجع فريقنا طلبك خلال ٢٤-٤٨ ساعة",
    descEn: "Our team reviews your application within 24-48 hours",
  },
  {
    num: "٤",
    numEn: "4",
    ar: "ابدأ العمل",
    en: "Start working",
    descAr: "ابدأ في استقبال الطلبات وتحقيق الدخل",
    descEn: "Start receiving requests and earning income",
  },
];

const testimonials = [
  {
    nameAr: "أ. خالد العمري",
    nameEn: "Khalid Al-Omari",
    roleAr: "محامٍ — الرياض",
    roleEn: "Lawyer — Riyadh",
    textAr:
      "منذ انضمامي لنظامي تضاعف دخلي. المنصة سهّلت عليّ إدارة القضايا والتواصل مع العملاء بشكل احترافي.",
    textEn:
      "Since joining Nezamy, my income has doubled. The platform made managing cases and communicating with clients much easier.",
    stars: 5,
  },
  {
    nameAr: "أ. نورة السبيعي",
    nameEn: "Noura Al-Subaie",
    roleAr: "موثّقة — جدة",
    roleEn: "Notary — Jeddah",
    textAr:
      "أقدّر كثيراً نظام الـ Escrow لأنه يضمن حقوقي المالية. الدعم الفني ممتاز والواجهة سهلة الاستخدام.",
    textEn:
      "I greatly appreciate the Escrow system as it guarantees my financial rights. Technical support is excellent and the interface is user-friendly.",
    stars: 5,
  },
  {
    nameAr: "م. سعد القحطاني",
    nameEn: "Saad Al-Qahtani",
    roleAr: "معقّب — الدمام",
    roleEn: "Legal Runner — Dammam",
    textAr:
      "استطعت توسيع نطاق عملي بشكل كبير. نظامي يربطني بعملاء من كل مناطق المملكة بكل سهولة.",
    textEn:
      "I was able to greatly expand my business. Nezamy connects me with clients from all regions of the Kingdom with ease.",
    stars: 4,
  },
];

const requirementsByType: Record<string, { ar: string; en: string }[]> = {
  "0": [
    { ar: "شهادة الترخيص من وزارة العدل", en: "License certificate from Ministry of Justice" },
    { ar: "الهوية الوطنية سارية المفعول", en: "Valid national ID" },
    { ar: "شهادة عضوية هيئة المحامين السعوديين", en: "Saudi Bar Association membership certificate" },
    { ar: "صورة شخصية حديثة", en: "Recent personal photo" },
    { ar: "السيرة الذاتية والخبرات المهنية", en: "CV and professional experience" },
  ],
  "1": [
    { ar: "السجل التجاري للشركة", en: "Company commercial registration" },
    { ar: "ترخيص مزاولة المهنة القانونية", en: "Legal practice license" },
    { ar: "هوية المفوّض بالتوقيع", en: "Authorized signatory ID" },
    { ar: "عقد تأسيس الشركة", en: "Company articles of association" },
    { ar: "قائمة المحامين المنتسبين", en: "List of affiliated lawyers" },
  ],
  "2": [
    { ar: "شهادة التوثيق الرسمي", en: "Official notarization certificate" },
    { ar: "الهوية الوطنية", en: "National ID" },
    { ar: "ترخيص وزارة العدل", en: "Ministry of Justice license" },
    { ar: "شهادة الخبرة", en: "Experience certificate" },
  ],
  "3": [
    { ar: "الهوية الوطنية سارية المفعول", en: "Valid national ID" },
    { ar: "شهادة التعقيب من الجهات المختصة", en: "Legal runner certificate from relevant authorities" },
    { ar: "صورة شخصية حديثة", en: "Recent personal photo" },
  ],
  "4": [
    { ar: "شهادة التحكيم المعتمدة", en: "Accredited arbitration certificate" },
    { ar: "الهوية الوطنية", en: "National ID" },
    { ar: "شهادات الخبرة في التحكيم التجاري", en: "Commercial arbitration experience certificates" },
    { ar: "عضوية مركز التحكيم التجاري السعودي (اختياري)", en: "Saudi Commercial Arbitration Center membership (optional)" },
  ],
};

export default function JoinPage() {
  const { isRTL, isDark, t } = useTheme();
  const [openReq, setOpenReq] = useState<number | null>(null);

  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-gray-900"}`}
    >
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-royal pt-32 pb-24 px-4">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_#C8A762_0%,_transparent_60%)]" />
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block bg-gold/20 text-gold text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              {isRTL ? "للمحامين ومزودي الخدمة" : "For Lawyers & Service Providers"}
            </span>
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              {isRTL
                ? "اجعل خبرتك القانونية\nمصدر دخل متميز"
                : "Turn Your Legal Expertise\nInto Premium Income"}
            </h1>
            <p className="text-white/70 text-lg mb-8 leading-relaxed">
              {isRTL
                ? "انضم إلى آلاف المحترفين القانونيين الذين يحققون دخلاً ثابتاً عبر منصة نظامي"
                : "Join thousands of legal professionals earning steady income through the Nezamy platform"}
            </p>
            <Link href="/register/provider">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-3 bg-gold text-[#0B3D2E] font-bold text-lg px-8 py-4 rounded-xl shadow-lg hover:bg-yellow-400 transition-colors"
              >
                {isRTL ? "سجّل الآن" : "Register Now"}
                <Arrow size={22} weight="bold" />
              </motion.button>
            </Link>
          </motion.div>

          {/* Earnings Card */}
          <motion.div
            initial={{ opacity: 0, x: isRTL ? -40 : 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="flex justify-center lg:justify-end"
          >
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
                  <CurrencyCircleDollar size={24} className="text-gold" />
                </div>
                <span className="text-white/70 text-sm">
                  {isRTL ? "متوسط الدخل الشهري" : "Average Monthly Income"}
                </span>
              </div>
              <div className="text-4xl font-bold text-gold mb-2">
                {isRTL ? "١٥,٠٠٠" : "15,000"}
                <span className="text-xl text-white/60 ms-2">
                  {isRTL ? "ر.س" : "SAR"}
                </span>
              </div>
              <p className="text-white/50 text-xs mt-3">
                {isRTL
                  ? "* بناءً على بيانات مزودي الخدمة النشطين خلال ٢٠٢٤"
                  : "* Based on active provider data during 2024"}
              </p>
              <div className="mt-6 space-y-3">
                {[
                  { label: isRTL ? "المحامون" : "Lawyers", pct: 78 },
                  { label: isRTL ? "الموثّقون" : "Notaries", pct: 62 },
                  { label: isRTL ? "المحكّمون" : "Arbitrators", pct: 85 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs text-white/60 mb-1">
                      <span>{item.label}</span>
                      <span>{item.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold rounded-full"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Provider Types */}
      <section className={`py-20 px-4 ${isDark ? "bg-dark-card" : "bg-gray-50"}`}>
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "أنواع مزودي الخدمة" : "Provider Types"}
            </h2>
            <p className={`${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "نرحب بجميع المحترفين القانونيين" : "We welcome all legal professionals"}
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {providerTypes.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                className={`rounded-2xl p-6 border text-center transition-shadow hover:shadow-lg ${
                  isDark
                    ? "bg-dark-bg border-white/10"
                    : "bg-white border-gray-100 shadow-sm"
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-royal/10 flex items-center justify-center mx-auto mb-4">
                  <p.icon size={28} className="text-royal" weight="duotone" />
                </div>
                <h3 className={`font-bold text-lg mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                  {isRTL ? p.ar : p.en}
                </h3>
                <p className={`text-sm mb-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {isRTL ? p.descAr : p.descEn}
                </p>
                <div className="bg-gold/10 text-gold text-xs font-semibold px-3 py-1.5 rounded-lg">
                  {isRTL ? p.earningAr : p.earningEn}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className={`py-20 px-4 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "لماذا نظامي؟" : "Why Nezamy?"}
            </h2>
            <p className={`${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "مزايا حصرية لمزودي الخدمة" : "Exclusive benefits for service providers"}
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`flex gap-4 p-6 rounded-2xl border ${
                  isDark
                    ? "bg-dark-card border-white/10"
                    : "bg-gray-50 border-gray-100"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-royal flex items-center justify-center shrink-0">
                  <b.icon size={24} className="text-white" weight="duotone" />
                </div>
                <div>
                  <h3 className={`font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {isRTL ? b.ar : b.en}
                  </h3>
                  <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {isRTL ? b.descAr : b.descEn}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How to Join */}
      <section className={`py-20 px-4 ${isDark ? "bg-dark-card" : "bg-[#f8faf9]"}`}>
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "كيف تنضم؟" : "How to Join?"}
            </h2>
            <p className={`${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "٤ خطوات بسيطة لبدء مسيرتك" : "4 simple steps to start your journey"}
            </p>
          </motion.div>
          <div className="relative">
            <div className="hidden lg:block absolute top-8 start-16 end-16 h-0.5 bg-gradient-to-r from-royal via-gold to-royal" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="text-center relative"
                >
                  <div className="w-16 h-16 rounded-full bg-royal text-white text-2xl font-bold flex items-center justify-center mx-auto mb-5 shadow-lg z-10 relative">
                    {isRTL ? s.num : s.numEn}
                  </div>
                  <h3 className={`font-bold text-lg mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {isRTL ? s.ar : s.en}
                  </h3>
                  <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {isRTL ? s.descAr : s.descEn}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className={`py-20 px-4 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "يقول عنا مزودو الخدمة" : "What Providers Say"}
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((tm, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`p-6 rounded-2xl border ${
                  isDark ? "bg-dark-card border-white/10" : "bg-gray-50 border-gray-100"
                }`}
              >
                <div className="flex mb-3">
                  {Array.from({ length: 5 }).map((_, si) => (
                    <Star
                      key={si}
                      size={16}
                      weight={si < tm.stars ? "fill" : "regular"}
                      className={si < tm.stars ? "text-gold" : "text-gray-300"}
                    />
                  ))}
                </div>
                <p className={`text-sm leading-relaxed mb-5 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  "{isRTL ? tm.textAr : tm.textEn}"
                </p>
                <div>
                  <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                    {isRTL ? tm.nameAr : tm.nameEn}
                  </p>
                  <p className="text-xs text-gray-400">{isRTL ? tm.roleAr : tm.roleEn}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className={`py-20 px-4 ${isDark ? "bg-dark-card" : "bg-gray-50"}`}>
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "المستندات المطلوبة" : "Required Documents"}
            </h2>
            <p className={`${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "اختر نوع مزود الخدمة لعرض المتطلبات" : "Select provider type to view requirements"}
            </p>
          </motion.div>
          <div className="space-y-3">
            {providerTypes.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className={`rounded-xl border overflow-hidden ${
                  isDark ? "bg-dark-bg border-white/10" : "bg-white border-gray-100"
                }`}
              >
                <button
                  onClick={() => setOpenReq(openReq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-start"
                >
                  <div className="flex items-center gap-3">
                    <p.icon size={20} className="text-royal" weight="duotone" />
                    <span className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                      {isRTL ? p.ar : p.en}
                    </span>
                  </div>
                  <motion.div animate={{ rotate: openReq === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <CaretDown size={18} className={isDark ? "text-gray-400" : "text-gray-500"} />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {openReq === i && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <ul className={`px-5 pb-4 space-y-2 border-t ${isDark ? "border-white/10" : "border-gray-100"}`}>
                        {requirementsByType[String(i)].map((req, ri) => (
                          <li key={ri} className="flex items-center gap-2 pt-2">
                            <CheckCircle size={16} className="text-royal shrink-0" weight="fill" />
                            <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                              {isRTL ? req.ar : req.en}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 bg-royal text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_#C8A762_0%,_transparent_70%)]" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative max-w-2xl mx-auto"
        >
          <h2 className="text-4xl font-bold text-white mb-4">
            {isRTL ? "ابدأ رحلتك معنا" : "Start Your Journey With Us"}
          </h2>
          <p className="text-white/70 text-lg mb-8">
            {isRTL
              ? "انضم الآن إلى منصة نظامي وحوّل خبرتك إلى دخل حقيقي"
              : "Join Nezamy now and turn your expertise into real income"}
          </p>
          <Link href="/register/provider">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-3 bg-gold text-[#0B3D2E] font-bold text-xl px-10 py-4 rounded-xl shadow-xl hover:bg-yellow-400 transition-colors"
            >
              {isRTL ? "ابدأ رحلتك معنا" : "Start Your Journey"}
              <Arrow size={24} weight="bold" />
            </motion.button>
          </Link>
        </motion.div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
