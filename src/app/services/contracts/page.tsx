"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  FileText,
  MagnifyingGlass,
  Brain,
  Briefcase,
  ArrowLeft,
  ArrowRight,
  Check,
  CaretDown,
  WarningCircle,
  CheckCircle,
  Warning,
  CloudArrowUp,
  Scan,
  UserCheck,
  Package,
  Lightning,
  Star,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = "ar" | "en";

// ─── Data ─────────────────────────────────────────────────────────────────────

const stats = {
  ar: [
    { label: "عقد منجز", value: "١٢٠٠+" },
    { label: "رضا العملاء", value: "٩٨٪" },
    { label: "ساعة تسليم", value: "٢٤" },
  ],
  en: [
    { label: "Contracts Completed", value: "1,200+" },
    { label: "Client Satisfaction", value: "98%" },
    { label: "Hour Delivery", value: "24" },
  ],
};

const services = {
  ar: [
    { icon: FileText, title: "صياغة عقد جديد", desc: "صياغة عقد احترافي من الصفر مصمم خصيصاً لاحتياجك ومتوافق مع الأنظمة السعودية", color: "text-royal", bg: "bg-royal/10" },
    { icon: MagnifyingGlass, title: "مراجعة عقد", desc: "مراجعة عقدك الحالي وتحديد الثغرات والبنود المجحفة والمخاطر القانونية المحتملة", color: "text-gold", bg: "bg-gold/10" },
    { icon: Brain, title: "تحليل AI", desc: "تحليل فوري بالذكاء الاصطناعي يكشف البنود غير المتوازنة قبل مراجعة المحامي", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { icon: Briefcase, title: "عقود تجارية", desc: "عقود الشراكة وتأسيس الشركات ومذكرات التفاهم والعقود التجارية المتخصصة", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
  ],
  en: [
    { icon: FileText, title: "Draft a New Contract", desc: "Professional contract drafted from scratch, tailored to your needs and compliant with Saudi law", color: "text-royal", bg: "bg-royal/10" },
    { icon: MagnifyingGlass, title: "Contract Review", desc: "Review your existing contract to identify gaps, unfair clauses, and potential legal risks", color: "text-gold", bg: "bg-gold/10" },
    { icon: Brain, title: "AI Analysis", desc: "Instant AI analysis that detects unbalanced clauses before the lawyer review", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { icon: Briefcase, title: "Commercial Contracts", desc: "Partnership agreements, company formation, MoUs, and specialized commercial contracts", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
  ],
};

const mockClauses = {
  ar: [
    { clause: "المادة ٧ — إنهاء العقد", risk: "high", note: "تمنح الطرف الأول حق الإنهاء الفوري دون إشعار مسبق أو تعويض" },
    { clause: "المادة ١٢ — التحكيم", risk: "medium", note: "يُلزم باللجوء للتحكيم خارج المملكة مما قد يرفع التكاليف" },
    { clause: "المادة ٣ — التسليم والدفع", risk: "low", note: "بنود واضحة ومتوازنة، جدول الدفع محدد بدقة" },
  ],
  en: [
    { clause: "Clause 7 — Termination", risk: "high", note: "Grants Party A the right to immediate termination without prior notice or compensation" },
    { clause: "Clause 12 — Arbitration", risk: "medium", note: "Requires arbitration outside Saudi Arabia which may increase costs" },
    { clause: "Clause 3 — Delivery & Payment", risk: "low", note: "Clear and balanced terms, payment schedule well-defined" },
  ],
};

const processSteps = {
  ar: [
    { icon: CloudArrowUp, label: "رفع العقد", desc: "ارفع ملف العقد بأي صيغة" },
    { icon: Scan, label: "مسح AI", desc: "تحليل فوري للبنود والمخاطر" },
    { icon: UserCheck, label: "مراجعة المحامي", desc: "مراجعة محامٍ متخصص" },
    { icon: Package, label: "التسليم", desc: "تقرير كامل خلال ٢٤ ساعة" },
  ],
  en: [
    { icon: CloudArrowUp, label: "Upload Contract", desc: "Upload contract file in any format" },
    { icon: Scan, label: "AI Scan", desc: "Instant clause and risk analysis" },
    { icon: UserCheck, label: "Lawyer Review", desc: "Specialist lawyer review" },
    { icon: Package, label: "Deliver", desc: "Full report within 24 hours" },
  ],
};

const contractTypes = {
  ar: ["عمالي", "تجاري", "إيجاري", "شراكة", "بيع", "توريد", "خدمات", "سرية", "استثمار", "توكيل"],
  en: ["Labor", "Commercial", "Lease", "Partnership", "Sale", "Supply", "Services", "NDA", "Investment", "Power of Attorney"],
};

const pricingTiers = {
  ar: [
    { name: "أساسي", price: "٢٤٩", currency: "ر.س", desc: "مراجعة عقد واحد", features: ["مراجعة بالذكاء الاصطناعي", "تقرير PDF", "٢٤ ساعة تسليم"], highlight: false },
    { name: "متقدم", price: "٤٩٩", currency: "ر.س", desc: "صياغة أو مراجعة شاملة", features: ["مراجعة محامٍ متخصص", "تعديلات غير محدودة", "تقرير مفصل", "دعم أولوية"], highlight: true },
    { name: "مؤسسي", price: "يُحدد", currency: "", desc: "للشركات والمؤسسات", features: ["عقود غير محدودة", "فريق قانوني مخصص", "SLA مضمون", "اجتماعات شهرية"], highlight: false },
  ],
  en: [
    { name: "Basic", price: "249", currency: "SAR", desc: "Single contract review", features: ["AI-powered review", "PDF report", "24-hour delivery"], highlight: false },
    { name: "Advanced", price: "499", currency: "SAR", desc: "Full drafting or review", features: ["Specialist lawyer review", "Unlimited revisions", "Detailed report", "Priority support"], highlight: true },
    { name: "Enterprise", price: "Custom", currency: "", desc: "For companies and organizations", features: ["Unlimited contracts", "Dedicated legal team", "Guaranteed SLA", "Monthly meetings"], highlight: false },
  ],
};

const faqs = {
  ar: [
    { q: "ما صيغ الملفات المدعومة؟", a: "تدعم المنصة جميع الصيغ الشائعة — PDF، Word (.docx)، وصور JPEG/PNG. يتولى نظام AI تحويلها وتحليلها تلقائياً." },
    { q: "كيف يعمل تحليل AI للعقود؟", a: "يقرأ النموذج كل بند ويقيس توازنه وفق قاعدة بيانات من آلاف العقود السعودية، ثم يصنّف كل بند في ثلاثة مستويات خطورة ويشرح السبب." },
    { q: "هل الصياغة متوافقة مع الأنظمة السعودية؟", a: "نعم، جميع العقود المصاغة تمر بمراجعة محامٍ معتمد ومتخصص في نظام الشركات ونظام العمل وأنظمة التجارة السعودية." },
    { q: "ما مدة إنجاز العقود؟", a: "مراجعة العقد تُنجز خلال ٢٤ ساعة. صياغة العقد من الصفر تستغرق ٤٨-٧٢ ساعة حسب التعقيد. خدمات الطوارئ متاحة بسعر إضافي." },
  ],
  en: [
    { q: "What file formats are supported?", a: "The platform supports all common formats — PDF, Word (.docx), and JPEG/PNG images. The AI system converts and analyzes them automatically." },
    { q: "How does AI contract analysis work?", a: "The model reads each clause and evaluates its balance against a database of thousands of Saudi contracts, then classifies each clause at three risk levels with explanations." },
    { q: "Are drafted contracts compliant with Saudi law?", a: "Yes, all drafted contracts are reviewed by a certified lawyer specializing in Saudi company law, labor law, and commercial regulations." },
    { q: "How long does it take to complete contracts?", a: "Contract review is completed within 24 hours. Drafting from scratch takes 48-72 hours depending on complexity. Rush services are available at an additional fee." },
  ],
};

const riskColors = {
  high: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/20", icon: WarningCircle, label: { ar: "خطورة عالية", en: "High Risk" } },
  medium: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/20", icon: Warning, label: { ar: "خطورة متوسطة", en: "Medium Risk" } },
  low: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20", icon: CheckCircle, label: { ar: "آمن", en: "Safe" } },
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
                ? "صياغة ومراجعة العقود بمساعدة الذكاء الاصطناعي مع مراجعة محامٍ متخصص — سريع، دقيق، وموثوق"
                : "Draft and review contracts with AI assistance and human review by a specialist lawyer — fast, accurate, and reliable"}
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
                  <div className="text-3xl font-black text-royal">{stat.value}</div>
                  <div className={`text-sm mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{stat.label}</div>
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

      {/* ── AI Analysis Demo ──────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "تحليل AI للعقود" : "AI Contract Analysis"}
            </h2>
            <p className={`text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "مثال حي على نتائج تحليل عقد العمل" : "Live example of a labor contract analysis result"}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#161b22] border-white/10" : "bg-white border-gray-200"}`}
          >
            {/* Mock terminal header */}
            <div className={`flex items-center gap-2 px-5 py-3 border-b ${isDark ? "border-white/10 bg-[#0e1217]" : "border-gray-100 bg-gray-50"}`}>
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className={`text-xs ms-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                {isRTL ? "نظامي AI — تحليل عقد العمل" : "Nezamy AI — Labor Contract Analysis"}
              </span>
              <div className="ms-auto flex items-center gap-1.5">
                <Brain size={14} className="text-emerald-500" />
                <span className="text-xs text-emerald-500">{isRTL ? "اكتمل التحليل" : "Analysis complete"}</span>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {mockClauses[L].map((clause, i) => {
                const risk = riskColors[clause.risk as keyof typeof riskColors];
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 }}
                    className={`flex items-start gap-4 rounded-xl border p-4 ${risk.bg} ${risk.border}`}
                  >
                    <risk.icon size={20} className={`${risk.text} flex-shrink-0 mt-0.5`} weight="fill" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{clause.clause}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${risk.bg} ${risk.text} border ${risk.border}`}>
                          {risk.label[L]}
                        </span>
                      </div>
                      <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>{clause.note}</p>
                    </div>
                  </motion.div>
                );
              })}

              <div className={`flex items-center gap-3 pt-2 border-t ${isDark ? "border-white/10" : "border-gray-100"}`}>
                <div className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {isRTL ? "تم اكتشاف ٣ بنود • خطورة عالية ١ • متوسطة ١ • منخفضة ١" : "3 clauses detected • 1 High • 1 Medium • 1 Low"}
                </div>
              </div>
            </div>
          </motion.div>
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
                {tier.highlight && (
                  <div className="absolute -top-3 start-1/2 -translate-x-1/2 bg-royal text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    {isRTL ? "الأفضل قيمةً" : "Best Value"}
                  </div>
                )}
                <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>{tier.name}</h3>
                <p className={`text-sm mb-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{tier.desc}</p>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-black text-royal">{tier.price}</span>
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
      <FloatingButtons />
    </div>
  );
}
