"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  FileText,
  MagnifyingGlass,
  Briefcase,
  ArrowLeft,
  ArrowRight,
  Check,
  CaretDown,
  CloudArrowUp,
  UserCheck,
  Package,
  Lightning,
  Star,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { CLIENT_SERVICE_CATALOG } from "@/constants/clientServiceCatalog";
import { dualAudiencePriceLabel } from "@/lib/pricing/catalogPriceLabel";

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = "ar" | "en";

// ─── Data ─────────────────────────────────────────────────────────────────────

// أُزيلت هنا ثلاث "إحصاءات" مُختلَقة: «١٢٠٠+ عقد منجز»، «٩٨٪ رضا العملاء»
// (لا يوجد جدول تقييمات في قاعدة البيانات)، «٢٤ ساعة تسليم» (لا التزام تسليم
// متعاقَد عليه). استُبدلت بعروض قيمة بلا أرقام.
// لا تُعِد رقماً هنا ما لم يكن محسوباً من بيانات حقيقية.
const stats = {
  ar: [
    { label: "تعرف التكلفة قبل الطلب", value: "سعر معروف مسبقاً" },
    { label: "مراجعة محامٍ قبل التسليم", value: "توقيع بشري" },
    { label: "الملاحظات والنسخ داخل المنصة", value: "تعديل موثّق" },
  ],
  en: [
    { label: "Know the cost before you order", value: "Price up front" },
    { label: "A lawyer reviews before delivery", value: "Human sign-off" },
    { label: "Comments and versions kept in-platform", value: "Tracked revisions" },
  ],
};

const services = {
  ar: [
    { icon: FileText, title: "صياغة عقد جديد", desc: "صياغة عقد احترافي من الصفر مصمم خصيصاً لاحتياجك ومتوافق مع الأنظمة السعودية", color: "text-royal", bg: "bg-royal/10" },
    { icon: MagnifyingGlass, title: "مراجعة عقد", desc: "مراجعة عقدك الحالي وتحديد الثغرات والبنود المجحفة والمخاطر القانونية المحتملة", color: "text-gold", bg: "bg-gold/10" },
    // Fix round 1b: was «تحليل AI — تحليل فوري بالذكاء الاصطناعي…». The AI
    // contract reviewer is beta-gated; the risk report is the lawyer's.
    { icon: UserCheck, title: "تقرير مخاطر مكتوب", desc: "يحدد المحامي المراجع البنود غير المتوازنة والمخاطر القانونية في تقرير مكتوب", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { icon: Briefcase, title: "عقود تجارية", desc: "عقود الشراكة وتأسيس الشركات ومذكرات التفاهم والعقود التجارية المتخصصة", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
  ],
  en: [
    { icon: FileText, title: "Draft a New Contract", desc: "Professional contract drafted from scratch, tailored to your needs and compliant with Saudi law", color: "text-royal", bg: "bg-royal/10" },
    { icon: MagnifyingGlass, title: "Contract Review", desc: "Review your existing contract to identify gaps, unfair clauses, and potential legal risks", color: "text-gold", bg: "bg-gold/10" },
    { icon: UserCheck, title: "Written Risk Report", desc: "The reviewing lawyer flags unbalanced clauses and legal risks in a written report", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { icon: Briefcase, title: "Commercial Contracts", desc: "Partnership agreements, company formation, MoUs, and specialized commercial contracts", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
  ],
};

// Fix round 1b: the «تحليل AI للعقود» demo and its mock clauses are gone — a
// fake «اكتمل التحليل» result from a tool that is beta-gated.

const processSteps = {
  ar: [
    { icon: CloudArrowUp, label: "رفع العقد", desc: "ارفع ملف العقد بأي صيغة" },
    { icon: MagnifyingGlass, label: "إسناد المحامي", desc: "يُسند فريق نظامي العقد إلى محامٍ مختص" },
    { icon: UserCheck, label: "مراجعة المحامي", desc: "مراجعة محامٍ متخصص" },
    { icon: Package, label: "التسليم", desc: "تقرير كامل خلال ٢٤ ساعة" },
  ],
  en: [
    { icon: CloudArrowUp, label: "Upload Contract", desc: "Upload contract file in any format" },
    { icon: MagnifyingGlass, label: "Lawyer Assignment", desc: "Nezamy's team assigns the contract to a specialist lawyer" },
    { icon: UserCheck, label: "Lawyer Review", desc: "Specialist lawyer review" },
    { icon: Package, label: "Deliver", desc: "Full report within 24 hours" },
  ],
};

const contractTypes = {
  ar: ["عمالي", "تجاري", "إيجاري", "شراكة", "بيع", "توريد", "خدمات", "سرية", "استثمار", "توكيل"],
  en: ["Labor", "Commercial", "Lease", "Partnership", "Sale", "Supply", "Services", "NDA", "Investment", "Power of Attorney"],
};

// Wave 1 task 6, fix round 1 (I1): the tiers used to sell «أساسي ٢٤٩ ر.س»
// with «مراجعة بالذكاء الاصطناعي» and «متقدم ٤٩٩ ر.س» — nothing charges
// either, and the AI contract reviewer is beta-gated. The review tier shows
// the client catalogue's contract-review row (the card on /services/individuals
// reads the same row); lawyer drafting has no catalogue row, so no number.
// S6 (q327): a public page has no audience, so it states both prices —
// «يبدأ من ٦٠٠ ر.س للأفراد · يبدأ من ٨٠٠ ر.س للأعمال».
const AFTER_ASSESSMENT: { ar: string; en: string } = { ar: "يُحدَّد بعد التقييم", en: "Determined after assessment" };
const reviewPrice = (lang: "ar" | "en"): string =>
  dualAudiencePriceLabel("contract-review", CLIENT_SERVICE_CATALOG, lang) ?? AFTER_ASSESSMENT[lang];

const pricingTiers = {
  ar: [
    { name: "مراجعة عقد", price: reviewPrice("ar"), currency: "", desc: "مراجعة عقد واحد", features: ["مراجعة محامٍ متخصص", "تقرير PDF", "٢٤ ساعة تسليم"], highlight: false },
    { name: "صياغة أو مراجعة شاملة", price: AFTER_ASSESSMENT.ar, currency: "", desc: "صياغة أو مراجعة شاملة", features: ["مراجعة محامٍ متخصص", "تعديلات ضمن نطاق الطلب", "تقرير مفصل", "دعم أولوية"], highlight: true },
    { name: "مؤسسي", price: "يُحدد", currency: "", desc: "للشركات والمؤسسات", features: ["عقود غير محدودة", "فريق قانوني مخصص", "مدة التسليم تُؤكَّد مع الفريق قبل البدء", "اجتماعات شهرية"], highlight: false },
  ],
  en: [
    { name: "Contract review", price: reviewPrice("en"), currency: "", desc: "Single contract review", features: ["Specialist lawyer review", "PDF report", "24-hour delivery"], highlight: false },
    { name: "Full drafting or review", price: AFTER_ASSESSMENT.en, currency: "", desc: "Full drafting or review", features: ["Specialist lawyer review", "Revisions within request scope", "Detailed report", "Priority support"], highlight: true },
    { name: "Enterprise", price: "Custom", currency: "", desc: "For companies and organizations", features: ["Unlimited contracts", "Dedicated legal team", "Delivery timeline confirmed with team before start", "Monthly meetings"], highlight: false },
  ],
};

const faqs = {
  ar: [
    { q: "ما صيغ الملفات المدعومة؟", a: "تدعم المنصة جميع الصيغ الشائعة — PDF، Word (.docx)، وصور JPEG/PNG. يطّلع عليها المحامي المراجع كما رفعتها." },
    // أُزيلت «قاعدة بيانات من آلاف العقود السعودية»: لا وجود لهذه القاعدة.
    // Fix round 1b: was «كيف يعمل تحليل AI للعقود؟» — the AI reviewer is
    // beta-gated, so the answer describes the lawyer's review.
    { q: "كيف تتم مراجعة العقد؟", a: "يقرأ المحامي كل بند ويقيس توازنه، ثم يصنّف البنود حسب درجة الخطورة ويشرح السبب في تقرير مكتوب." },
    { q: "هل الصياغة متوافقة مع الأنظمة السعودية؟", a: "نعم، جميع العقود المصاغة تمر بمراجعة محامٍ معتمد ومتخصص في نظام الشركات ونظام العمل وأنظمة التجارة السعودية." },
    { q: "ما مدة إنجاز العقود؟", a: "مراجعة العقد تُنجز خلال ٢٤ ساعة. صياغة العقد من الصفر تستغرق ٤٨-٧٢ ساعة حسب التعقيد. خدمات الطوارئ متاحة بسعر إضافي." },
  ],
  en: [
    { q: "What file formats are supported?", a: "The platform supports all common formats — PDF, Word (.docx), and JPEG/PNG images. The reviewing lawyer reads them as uploaded." },
    { q: "How is a contract reviewed?", a: "The lawyer reads each clause and weighs its balance, then grades the clauses by risk and explains why in a written report." },
    { q: "Are drafted contracts compliant with Saudi law?", a: "Yes, all drafted contracts are reviewed by a certified lawyer specializing in Saudi company law, labor law, and commercial regulations." },
    { q: "How long does it take to complete contracts?", a: "Contract review is completed within 24 hours. Drafting from scratch takes 48-72 hours depending on complexity. Rush services are available at an additional fee." },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const { theme, lang } = useTheme();
  const isRTL = lang === "ar";
  const isDark = theme === "dark";
  const L = lang as Lang;
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div className={`min-h-screen ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-28 pb-20">
        <div className="absolute inset-0 bg-gradient-to-br from-royal/8 via-transparent to-gold/5 pointer-events-none" />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-royal/30 to-transparent" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center gap-2 bg-royal/10 text-royal text-sm font-medium px-4 py-1.5 rounded-full mb-5 border border-royal/20">
              <FileText weight="fill" size={16} />
              <span>{isRTL ? "خدمة العقود" : "Contract Services"}</span>
            </div>
            <h1 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "العقود والمستندات" : "Contracts & Documents"}
            </h1>
            <p className={`text-lg max-w-2xl mx-auto mb-10 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {isRTL
                ? "صياغة ومراجعة العقود على يد محامٍ متخصص"
                : "Contracts drafted and reviewed by a specialist lawyer"}
            </p>

            {/* Stats row */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12">
              {stats[L].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="text-center"
                >
                  <div className="text-base font-black text-royal">{stat.value}</div>
                  <div className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Services Grid 2x2 ─────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0e1217]" : "bg-white"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "خدماتنا" : "Our Services"}
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {services[L].map((svc, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -3 }}
                className={`rounded-2xl border p-7 flex gap-5 cursor-pointer transition-all duration-300 ${
                  isDark
                    ? "bg-[#161b22] border-white/10 hover:border-royal/30"
                    : "bg-white border-gray-100 hover:border-royal/20 hover:shadow-md"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${svc.bg}`}>
                  <svc.icon size={22} className={svc.color} weight="duotone" />
                </div>
                <div>
                  <h3 className={`font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>{svc.title}</h3>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-gray-600"}`}>{svc.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Process ───────────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0e1217]" : "bg-white"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "كيف يعمل النظام؟" : "How It Works"}
            </h2>
          </motion.div>

          <div className="relative">
            <div className={`hidden md:block absolute top-10 ${isRTL ? "right-[12.5%]" : "left-[12.5%]"} w-3/4 h-0.5 bg-gradient-to-r from-royal/20 via-gold/30 to-royal/20`} />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {processSteps[L].map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-royal to-royal/70 flex items-center justify-center shadow-lg mb-5 z-10">
                    <step.icon size={28} className="text-white" weight="duotone" />
                  </div>
                  <h3 className={`text-base font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>{step.label}</h3>
                  <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Contract Types Chips ──────────────────────────────────────────── */}
      <section className={`py-16 ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className={`text-2xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "أنواع العقود المدعومة" : "Supported Contract Types"}
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex flex-wrap gap-3 justify-center"
          >
            {contractTypes[L].map((type, i) => (
              <motion.span
                key={type}
                initial={{ opacity: 0, scale: 0.85 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.07 }}
                className={`px-5 py-2 rounded-full text-sm font-medium border cursor-default transition-colors ${
                  isDark
                    ? "bg-[#161b22] border-white/10 text-gray-300 hover:border-royal/40 hover:text-white"
                    : "bg-white border-gray-200 text-gray-700 hover:border-royal/30 hover:text-royal"
                }`}
              >
                {type}
              </motion.span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0e1217]" : "bg-white"}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "الأسعار" : "Pricing"}
            </h2>
            <p className={`text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "أسعار واضحة لكل حجم من الاحتياجات" : "Clear pricing for every level of need"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricingTiers[L].map((tier, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`rounded-2xl border p-7 relative ${
                  tier.highlight
                    ? "border-royal ring-2 ring-royal/20 bg-gradient-to-br from-royal/8 to-royal/3"
                    : isDark
                    ? "border-white/10 bg-[#161b22]"
                    : "border-gray-100 bg-white"
                }`}
              >
                {/* No «الأفضل قيمةً» pill (owner, Q164, 2026-10-03: no
                    superlative badges). `highlight` keeps the ring. */}
                <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>{tier.name}</h3>
                <p className={`text-sm mb-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{tier.desc}</p>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-2xl font-black text-royal">{tier.price}</span>
                  {tier.currency && <span className={`text-sm pb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{tier.currency}</span>}
                </div>
                <ul className="space-y-2.5 mb-7">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded-full bg-royal/10 flex items-center justify-center flex-shrink-0">
                        <Check size={10} className="text-royal" weight="bold" />
                      </div>
                      <span className={isDark ? "text-gray-300" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/register/client"
                  className={`block text-center py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    tier.highlight
                      ? "bg-royal text-white hover:bg-royal/90"
                      : isDark
                      ? "bg-white/10 text-white hover:bg-white/15"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {isRTL ? "ابدأ الآن" : "Get Started"}
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"}`}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
            </h2>
          </motion.div>

          <div className="space-y-3">
            {faqs[L].map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`rounded-xl border overflow-hidden ${
                  isDark ? "bg-[#161b22] border-white/10" : "bg-white border-gray-100"
                }`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-start"
                >
                  <span className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{faq.q}</span>
                  <motion.div animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <CaretDown size={16} className={isDark ? "text-gray-400" : "text-gray-500"} />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className={`px-5 pb-5 text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-gray-600"}`}>{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative rounded-3xl bg-gradient-to-br from-royal via-royal/90 to-[#0a3025] p-12 text-center overflow-hidden"
          >
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
            <FileText size={40} className="text-gold mx-auto mb-4" weight="duotone" />
            <h2 className="text-3xl font-bold text-white mb-3">
              {isRTL ? "احمِ مصالحك بعقود محكمة" : "Protect Your Interests with Solid Contracts"}
            </h2>
            <p className="text-white/70 mb-8 text-base max-w-xl mx-auto">
              {isRTL
                ? "ابدأ الآن واحصل على مراجعة أو صياغة عقدك خلال ٢٤ ساعة"
                : "Get started now and receive your contract review or draft within 24 hours"}
            </p>
            <motion.a
              href="/register/client"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2.5 bg-gold text-[#0B3D2E] font-bold px-8 py-3.5 rounded-xl text-base hover:bg-gold/90 transition-colors shadow-lg"
            >
              {isRTL ? "ابدأ الآن" : "Get Started"}
              <Arrow size={18} weight="bold" />
            </motion.a>
          </motion.div>
        </div>
      </section>

      <Footer />
          </div>
  );
}
