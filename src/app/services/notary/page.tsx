"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stamp,
  FileText,
  Users,
  Buildings,
  HandCoins,
  CalendarCheck,
  ArrowRight,
  CheckCircle,
  Clock,
  CurrencyDollar,
  Laptop,
  MapPin,
  Plus,
  Minus,
  Seal,
  UploadSimple,
  MagnifyingGlass,
  Certificate,
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

const docTypes = [
  {
    icon: FileText,
    ar: "عقود العمل",
    en: "Employment Contracts",
    desc_ar: "توثيق عقود التوظيف والعمل بصورة رسمية معتمدة",
    desc_en: "Official notarization of employment and labor agreements",
  },
  {
    icon: HandCoins,
    ar: "عقود البيع",
    en: "Sales Contracts",
    desc_ar: "توثيق عقود بيع العقارات والمنقولات",
    desc_en: "Notarization of real estate and asset sale contracts",
  },
  {
    icon: Stamp,
    ar: "توكيلات رسمية",
    en: "Power of Attorney",
    desc_ar: "إصدار توكيلات رسمية خاصة وعامة",
    desc_en: "Issue special and general power of attorney documents",
  },
  {
    icon: Buildings,
    ar: "عقود الإيجار",
    en: "Lease Agreements",
    desc_ar: "توثيق عقود إيجار السكن والتجارة",
    desc_en: "Notarization of residential and commercial leases",
  },
  {
    icon: Users,
    ar: "محاضر الاجتماعات",
    en: "Meeting Minutes",
    desc_ar: "توثيق قرارات مجالس الإدارة والجمعيات",
    desc_en: "Notarize board resolutions and assembly decisions",
  },
  {
    icon: CalendarCheck,
    ar: "وثائق الشركات",
    en: "Corporate Documents",
    desc_ar: "توثيق النظم الأساسية وعقود التأسيس",
    desc_en: "Notarize articles of incorporation and founding contracts",
  },
];

const steps = [
  {
    icon: UploadSimple,
    ar: "رفع المستند",
    en: "Upload Document",
    desc_ar: "ارفع مستندك بصيغة PDF أو صورة واضحة",
    desc_en: "Upload your document as PDF or clear image",
    num: "01",
  },
  {
    icon: MagnifyingGlass,
    ar: "مراجعة الموثق",
    en: "Notary Review",
    desc_ar: "يراجع الموثق المعتمد المستند ويتحقق منه",
    desc_en: "A certified notary reviews and verifies the document",
    num: "02",
  },
  {
    icon: Certificate,
    ar: "ختم الاعتماد",
    en: "Certification Seal",
    desc_ar: "يُختم المستند بالاعتماد الرسمي ويُسلّم إليك",
    desc_en: "Document receives the official seal and is delivered",
    num: "03",
  },
];

const comparisonRows = [
  {
    label_ar: "السرعة",
    label_en: "Speed",
    online_ar: "خلال ساعات",
    online_en: "Within hours",
    inperson_ar: "١–٣ أيام عمل",
    inperson_en: "1–3 business days",
  },
  {
    label_ar: "التكلفة",
    label_en: "Cost",
    online_ar: "أقل تكلفة",
    online_en: "Lower cost",
    inperson_ar: "رسوم إضافية",
    inperson_en: "Additional fees",
  },
  {
    label_ar: "التوفر",
    label_en: "Availability",
    online_ar: "٢٤/٧",
    online_en: "24/7",
    inperson_ar: "أوقات الدوام فقط",
    inperson_en: "Office hours only",
  },
  {
    label_ar: "المتطلبات",
    label_en: "Requirements",
    online_ar: "هوية رقمية فقط",
    online_en: "Digital ID only",
    inperson_ar: "حضور شخصي + وثائق",
    inperson_en: "In-person + documents",
  },
  {
    label_ar: "التسليم",
    label_en: "Delivery",
    online_ar: "وثيقة رقمية فورية",
    online_en: "Instant digital document",
    inperson_ar: "وثيقة ورقية / بريد",
    inperson_en: "Paper doc / courier",
  },
];

const faqs = [
  {
    q_ar: "هل التوثيق الإلكتروني معتمد قانونياً؟",
    q_en: "Is electronic notarization legally recognized?",
    a_ar:
      "نعم، يعتمد نظامي على منصات توثيق إلكتروني معتمدة لدى وزارة العدل السعودية وفق نظام التوثيق الإلكتروني.",
    a_en:
      "Yes, Nezamy uses electronic notarization platforms approved by the Saudi Ministry of Justice under the Electronic Notarization Regulation.",
  },
  {
    q_ar: "كم يستغرق التوثيق الإلكتروني؟",
    q_en: "How long does electronic notarization take?",
    a_ar:
      "في الغالب تتم المراجعة وإصدار الختم خلال ٢–٤ ساعات في أيام الدوام الرسمي.",
    a_en:
      "Review and certification typically complete within 2–4 hours on business days.",
  },
  {
    q_ar: "ما هي الوثائق المطلوبة للتوثيق الحضوري؟",
    q_en: "What documents are required for in-person notarization?",
    a_ar:
      "الهوية الوطنية أو الإقامة سارية المفعول، وأصل المستند المراد توثيقه، وأي مستندات داعمة حسب نوع العقد.",
    a_en:
      "Valid national ID or residence permit, original document for notarization, and supporting documents depending on contract type.",
  },
  {
    q_ar: "هل يمكن توثيق مستندات باللغة الإنجليزية؟",
    q_en: "Can English-language documents be notarized?",
    a_ar:
      "نعم، مع ضرورة إرفاق ترجمة معتمدة إلى العربية لبعض أنواع الوثائق. فريقنا يساعدك في ذلك.",
    a_en:
      "Yes, with a certified Arabic translation required for certain document types. Our team assists with this.",
  },
];

export default function NotaryPage() {
  const { isRTL, isDark, t } = useTheme();
  const [serviceType, setServiceType] = useState<"online" | "inperson">(
    "online"
  );
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div
      className={`min-h-screen bg-white dark:bg-dark-bg ${isRTL ? "font-arabic" : ""}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />
      <FloatingButtons />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0B3D2E] via-[#0d4a38] to-[#071f17] pt-32 pb-24">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_70%_50%,#C8A762_0%,transparent_60%)]" />
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-white/5"
              style={{
                width: `${120 + i * 80}px`,
                height: `${120 + i * 80}px`,
                top: `${10 + i * 8}%`,
                right: `${5 + i * 4}%`,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 20 + i * 5, repeat: Infinity, ease: "linear" }}
            />
          ))}
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="max-w-3xl mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 mb-6">
              <Seal size={16} className="text-gold" weight="fill" />
              <span className="text-white/80 text-sm">
                {isRTL ? "خدمات التوثيق الرسمي" : "Official Notarization Services"}
              </span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              {isRTL ? "التوثيق الرسمي" : "Official Notarization"}
            </h1>
            <p className="text-xl text-white/70 mb-10 leading-relaxed">
              {isRTL
                ? "وثّق مستنداتك القانونية بسهولة وأمان من خلال موثقين معتمدين لدى وزارة العدل السعودية"
                : "Notarize your legal documents easily and securely through notaries certified by the Saudi Ministry of Justice"}
            </p>

            {/* Toggle */}
            <div className="inline-flex bg-white/10 border border-white/20 rounded-2xl p-1.5">
              {(["online", "inperson"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setServiceType(type)}
                  className={`relative flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    serviceType === type
                      ? "bg-white text-[#0B3D2E] shadow-lg"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {type === "online" ? (
                    <Laptop size={16} />
                  ) : (
                    <MapPin size={16} />
                  )}
                  {isRTL
                    ? type === "online"
                      ? "إلكتروني"
                      : "حضوري"
                    : type === "online"
                    ? "Online"
                    : "In-Person"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.p
                key={serviceType}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="mt-6 text-white/60 text-sm"
              >
                {serviceType === "online"
                  ? isRTL
                    ? "توثيق رقمي سريع، متاح ٢٤/٧، ختم إلكتروني معتمد"
                    : "Fast digital notarization, available 24/7, certified electronic seal"
                  : isRTL
                  ? "توثيق حضوري في مكاتبنا أو لدى الكاتب العدل المعتمد"
                  : "In-person notarization at our offices or with a certified notary"}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* ── Document Types ── */}
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
              {isRTL ? "أنواع المستندات التي نوثقها" : "Document Types We Notarize"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {isRTL
                ? "نغطي طيفاً واسعاً من الوثائق القانونية والتجارية"
                : "We cover a wide range of legal and commercial documents"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {docTypes.map((doc, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.05}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group bg-white dark:bg-dark-card border border-gray-100 dark:border-white/10 rounded-2xl p-7 shadow-sm hover:shadow-xl hover:border-[#0B3D2E]/30 dark:hover:border-[#C8A762]/30 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#0B3D2E]/10 dark:bg-[#0B3D2E]/30 flex items-center justify-center mb-5 group-hover:bg-[#0B3D2E] transition-colors duration-300">
                  <doc.icon
                    size={26}
                    className="text-[#0B3D2E] dark:text-[#C8A762] group-hover:text-white transition-colors duration-300"
                    weight="duotone"
                  />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                  {isRTL ? doc.ar : doc.en}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {isRTL ? doc.desc_ar : doc.desc_en}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Process ── */}
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
              {isRTL ? "كيف تسير العملية؟" : "How Does the Process Work?"}
            </h2>
          </motion.div>

          <div className="relative max-w-4xl mx-auto">
            <div className="absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#C8A762]/40 to-transparent hidden md:block" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {steps.map((step, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  custom={i * 0.15}
                  className="relative flex flex-col items-center text-center"
                >
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#0B3D2E] to-[#0d4a38] flex items-center justify-center shadow-lg shadow-[#0B3D2E]/30 mb-6">
                      <step.icon size={36} className="text-[#C8A762]" weight="duotone" />
                    </div>
                    <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#C8A762] text-[#0B3D2E] text-xs font-black flex items-center justify-center">
                      {step.num}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {isRTL ? step.ar : step.en}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {isRTL ? step.desc_ar : step.desc_en}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Comparison Table ── */}
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
              {isRTL ? "إلكتروني أم حضوري؟" : "Online or In-Person?"}
            </h2>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="max-w-3xl mx-auto"
          >
            <div className="rounded-3xl overflow-hidden border border-gray-200 dark:border-white/10 shadow-xl">
              {/* Header */}
              <div className="grid grid-cols-3 bg-[#0B3D2E]">
                <div className="p-5" />
                <div className="p-5 text-center border-x border-white/10">
                  <Laptop size={22} className="text-[#C8A762] mx-auto mb-1" />
                  <span className="text-white font-bold text-sm">
                    {isRTL ? "إلكتروني" : "Online"}
                  </span>
                </div>
                <div className="p-5 text-center">
                  <MapPin size={22} className="text-white/60 mx-auto mb-1" />
                  <span className="text-white/70 font-semibold text-sm">
                    {isRTL ? "حضوري" : "In-Person"}
                  </span>
                </div>
              </div>

              {comparisonRows.map((row, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-3 ${
                    i % 2 === 0
                      ? "bg-white dark:bg-dark-card"
                      : "bg-gray-50 dark:bg-[#111620]"
                  }`}
                >
                  <div className="p-4 flex items-center">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {isRTL ? row.label_ar : row.label_en}
                    </span>
                  </div>
                  <div className="p-4 text-center border-x border-gray-100 dark:border-white/5 flex items-center justify-center gap-1.5">
                    <CheckCircle size={15} className="text-[#0B3D2E] dark:text-[#C8A762]" weight="fill" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {isRTL ? row.online_ar : row.online_en}
                    </span>
                  </div>
                  <div className="p-4 text-center flex items-center justify-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {isRTL ? row.inperson_ar : row.inperson_en}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
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
                      transition={{ duration: 0.3, ease: "easeInOut" }}
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
            <Seal size={52} className="text-[#C8A762] mx-auto mb-6" weight="fill" />
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {isRTL ? "جاهز لتوثيق مستنداتك؟" : "Ready to Notarize Your Documents?"}
            </h2>
            <p className="text-white/60 mb-10 max-w-lg mx-auto">
              {isRTL
                ? "انطلق الآن واحصل على ختم اعتماد رسمي في غضون ساعات"
                : "Get started now and receive an official certification seal within hours"}
            </p>
            <motion.a
              href="/contact"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-3 bg-[#C8A762] hover:bg-[#d4b472] text-[#0B3D2E] font-bold px-10 py-4 rounded-2xl text-lg shadow-lg shadow-[#C8A762]/20 transition-colors"
            >
              {isRTL ? "وثّق الآن" : "Notarize Now"}
              <ArrowRight size={20} className={isRTL ? "rotate-180" : ""} />
            </motion.a>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
