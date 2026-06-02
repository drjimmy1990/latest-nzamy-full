"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Buildings, ShieldCheck, ArrowLeft, ArrowRight, Check,
  Briefcase, FileText, Globe, Users, Scales,
  Clock, CurrencyDollar, MapPin, Lightning, CaretDown,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import FloatingButtons from "@/components/FloatingButtons";

// ─── Bilingual ──────────────────────────────────────────────────────────────

const txt = {
  ar: {
    back: "خدمات الأعمال",
    badge: "تأسيس وهيكلة قانونية",
    title: "تأسيس الشركات في المملكة العربية السعودية",
    subtitle: "نؤسس كيانك القانوني بشكل صحيح من اليوم الأول — شركات ذات مسؤولية محدودة، مساهمة، وفروع الشركات الأجنبية.",
    price: "يبدأ من 1,999 ﷼",
    duration: "3 — 10 أيام عمل",
    ctaMain: "احجز استشارة تأسيس",
    ctaWa: "تواصل عبر واتساب",
    typesTitle: "أنواع الكيانات القانونية",
    types: [
      { name: "شركة ذات مسؤولية محدودة (LLC)", desc: "الأكثر شيوعاً للمنشآت المتوسطة والصغيرة. مسؤولية الشركاء محدودة بحصصهم.", icon: ShieldCheck, price: "1,999 ﷼", duration: "3-5 أيام" },
      { name: "شركة مساهمة مقفلة", desc: "للشركات الكبيرة التي تحتاج هيكلاً مؤسسياً. رأس مال مقسم إلى أسهم.", icon: Buildings, price: "4,999 ﷼", duration: "7-10 أيام" },
      { name: "فرع شركة أجنبية", desc: "للشركات الدولية الراغبة في التواجد بالمملكة عبر فرع مسجّل.", icon: Globe, price: "7,999 ﷼", duration: "10-15 يوم" },
      { name: "مؤسسة فردية", desc: "لأصحاب الأعمال الفردية. إجراءات مبسطة وتكاليف أقل.", icon: Users, price: "999 ﷼", duration: "1-3 أيام" },
    ],
    stepsTitle: "خطوات التأسيس",
    steps: [
      { title: "الاستشارة المبدئية", desc: "نحلل نشاطك ونحدد الهيكل القانوني الأمثل" },
      { title: "إعداد المستندات", desc: "صياغة عقد التأسيس والنظام الأساسي" },
      { title: "التسجيل الرسمي", desc: "تسجيل الشركة في وزارة التجارة وإصدار السجل التجاري" },
      { title: "التراخيص والتصاريح", desc: "استخراج جميع التراخيص اللازمة لبدء النشاط" },
      { title: "التسليم النهائي", desc: "تسليم ملف التأسيس الكامل مع كل المستندات" },
    ],
    docsTitle: "المستندات المطلوبة",
    docs: [
      "صورة الهوية الوطنية أو الإقامة لجميع الشركاء",
      "عنوان وطني موثّق (عبر منصة العنوان الوطني)",
      "عقد إيجار أو ملكية لمقر الشركة",
      "موافقة الجهات المختصة (حسب النشاط)",
      "رأس المال المطلوب حسب نوع الكيان",
    ],
    faqTitle: "أسئلة شائعة",
    faqs: [
      { q: "ما الحد الأدنى لرأس المال لتأسيس شركة ذات مسؤولية محدودة؟", a: "لا يوجد حد أدنى إلزامي لرأس المال في نظام الشركات الجديد (1437هـ). يُحدد رأس المال حسب طبيعة النشاط ومتطلبات الجهات الرقابية." },
      { q: "هل يمكن للأجنبي تأسيس شركة بنسبة 100%؟", a: "نعم، بموجب نظام الاستثمار الأجنبي المحدّث، يمكن للمستثمر الأجنبي تملك 100% من الشركة في معظم الأنشطة بعد الحصول على ترخيص من وزارة الاستثمار." },
      { q: "كم تستغرق عملية التأسيس؟", a: "تتراوح بين 3-15 يوم عمل حسب نوع الكيان وتعقيد النشاط. الشركات ذات المسؤولية المحدودة عادةً 3-5 أيام." },
    ],
  },
  en: {
    back: "Business Services",
    badge: "Legal Entity Formation",
    title: "Company Formation in Saudi Arabia",
    subtitle: "We establish your legal entity correctly from day one — LLCs, joint stock companies, and foreign company branches.",
    price: "Starting from SAR 1,999",
    duration: "3 — 10 business days",
    ctaMain: "Book Formation Consultation",
    ctaWa: "Contact via WhatsApp",
    typesTitle: "Legal Entity Types",
    types: [
      { name: "Limited Liability Company (LLC)", desc: "Most common for SMEs. Partners' liability limited to their shares.", icon: ShieldCheck, price: "SAR 1,999", duration: "3-5 days" },
      { name: "Closed Joint Stock Company", desc: "For larger companies needing corporate structure. Capital divided into shares.", icon: Buildings, price: "SAR 4,999", duration: "7-10 days" },
      { name: "Foreign Company Branch", desc: "For international companies wanting presence in Saudi Arabia.", icon: Globe, price: "SAR 7,999", duration: "10-15 days" },
      { name: "Sole Proprietorship", desc: "For individual business owners. Simplified procedures and lower costs.", icon: Users, price: "SAR 999", duration: "1-3 days" },
    ],
    stepsTitle: "Formation Steps",
    steps: [
      { title: "Initial Consultation", desc: "We analyze your business and determine the optimal legal structure" },
      { title: "Document Preparation", desc: "Draft articles of association and bylaws" },
      { title: "Official Registration", desc: "Register with Ministry of Commerce and obtain commercial registration" },
      { title: "Licenses & Permits", desc: "Obtain all necessary licenses to begin operations" },
      { title: "Final Delivery", desc: "Deliver the complete formation file with all documents" },
    ],
    docsTitle: "Required Documents",
    docs: [
      "National ID or residency permit copy for all partners",
      "Verified national address (via National Address platform)",
      "Lease or ownership deed for company premises",
      "Relevant authority approvals (activity-dependent)",
      "Required capital based on entity type",
    ],
    faqTitle: "FAQ",
    faqs: [
      { q: "What's the minimum capital for an LLC?", a: "There is no mandatory minimum capital under the new Companies Law (1437H). Capital is determined by the nature of the business and regulatory requirements." },
      { q: "Can a foreigner own 100% of a company?", a: "Yes, under the updated Foreign Investment Law, foreign investors can own 100% of a company in most activities after obtaining a license from the Ministry of Investment." },
      { q: "How long does the formation process take?", a: "Between 3-15 business days depending on entity type and activity complexity. LLCs typically take 3-5 days." },
    ],
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function CompanyFormationPage() {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const t = isAr ? txt.ar : txt.en;
  const Arrow = isAr ? ArrowLeft : ArrowRight;
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
    <div dir={isAr ? "rtl" : "ltr"} className={`min-h-[100dvh] ${isDark ? "bg-[#0c0f12] text-zinc-100" : "bg-zinc-50 text-zinc-900"}`}>
      <div className="max-w-[1200px] mx-auto px-4 py-8 md:py-16 space-y-14">

        {/* Back */}
        <Link href="/services/business" className={`inline-flex items-center gap-1.5 text-sm font-medium ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"} transition-colors`}>
          <Arrow size={14} className={isAr ? "" : "rotate-180"} /> {t.back}
        </Link>

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <motion.section variants={fadeUp} initial="hidden" animate="show" custom={0}>
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold mb-4 ${isDark ? "bg-purple-500/15 text-purple-400 border border-purple-500/20" : "bg-purple-100 text-purple-700"}`}>
                <Buildings size={12} weight="fill" /> {t.badge}
              </span>
              <h1 className={`text-3xl md:text-4xl font-bold tracking-tight mb-4 ${isDark ? "text-white" : "text-zinc-900"}`}>{t.title}</h1>
              <p className={`text-base leading-relaxed max-w-[60ch] mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{t.subtitle}</p>

              <div className="flex flex-wrap items-center gap-4 mb-6">
                <span className={`flex items-center gap-1.5 text-sm font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                  <CurrencyDollar size={16} weight="fill" /> {t.price}
                </span>
                <span className={`flex items-center gap-1.5 text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  <Clock size={14} /> {t.duration}
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/services/consultations">
                  <motion.div whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 bg-[#0B3D2E] text-white font-bold px-6 py-3 rounded-xl text-sm shadow-lg cursor-pointer">
                    <Briefcase size={16} /> {t.ctaMain} <Arrow size={14} />
                  </motion.div>
                </Link>
                <a href="https://wa.me/966500000000?text=أرغب+في+تأسيس+شركة" target="_blank" rel="noopener noreferrer">
                  <motion.div whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.98 }}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold cursor-pointer border ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.03]" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>
                    {t.ctaWa}
                  </motion.div>
                </a>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ── Entity Types ────────────────────────────────────────── */}
        <section>
          <h2 className={`text-xl font-bold mb-6 ${isDark ? "text-white" : "text-zinc-900"}`}>{t.typesTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {t.types.map((type, i) => {
              const Icon = type.icon;
              return (
                <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 2}
                  whileHover={{ y: -3, transition: { type: "spring", stiffness: 200, damping: 20 } }}
                  className={`rounded-2xl p-5 ${card}`}>
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600 to-purple-400 flex items-center justify-center shadow shrink-0">
                      <Icon size={20} weight="fill" className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-[15px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-800"}`}>{type.name}</h3>
                      <p className={`text-[12px] leading-relaxed mb-3 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{type.desc}</p>
                      <div className="flex items-center gap-3">
                        <span className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{type.price}</span>
                        <span className={`text-[11px] flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                          <Clock size={10} /> {type.duration}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── Steps ───────────────────────────────────────────────── */}
        <section>
          <h2 className={`text-xl font-bold mb-6 ${isDark ? "text-white" : "text-zinc-900"}`}>{t.stepsTitle}</h2>
          <div className="space-y-3">
            {t.steps.map((step, i) => (
              <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 7}
                className={`flex items-start gap-4 p-4 rounded-xl ${card}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white"}`}>
                  {i + 1}
                </div>
                <div>
                  <p className={`text-[14px] font-bold mb-0.5 ${isDark ? "text-white" : "text-zinc-800"}`}>{step.title}</p>
                  <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Required Docs ───────────────────────────────────────── */}
        <section>
          <h2 className={`text-xl font-bold mb-4 ${isDark ? "text-white" : "text-zinc-900"}`}>{t.docsTitle}</h2>
          <div className={`rounded-2xl p-5 ${card}`}>
            <div className="space-y-2.5">
              {t.docs.map((doc, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <FileText size={14} weight="duotone" className={`mt-0.5 shrink-0 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
                  <span className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{doc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────── */}
        <section>
          <h2 className={`text-xl font-bold mb-6 text-center ${isDark ? "text-white" : "text-zinc-900"}`}>{t.faqTitle}</h2>
          <div className="max-w-2xl mx-auto space-y-3">
            {t.faqs.map((faq, i) => (
              <div key={i} className={`rounded-xl border overflow-hidden ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-zinc-100 bg-white shadow-sm"}`}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className={`w-full flex items-center justify-between px-5 py-4 text-start text-[14px] font-semibold ${isDark ? "text-zinc-200 hover:bg-white/[0.02]" : "text-zinc-800 hover:bg-zinc-50"}`}>
                  {faq.q}
                  <motion.span animate={{ rotate: openFaq === i ? 180 : 0 }} className="shrink-0">
                    <CaretDown size={14} />
                  </motion.span>
                </button>
                {openFaq === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    className={`px-5 pb-4 text-[13px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                    {faq.a}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Bottom CTA ──────────────────────────────────────────── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={15}
          className={`rounded-2xl p-8 text-center ${isDark ? "bg-gradient-to-br from-purple-950/30 to-zinc-900/50 border border-purple-500/15" : "bg-gradient-to-br from-purple-50 to-white border border-purple-200/40"}`}>
          <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-zinc-800"}`}>
            {isAr ? "جاهز لتأسيس شركتك؟" : "Ready to establish your company?"}
          </h3>
          <p className={`text-sm mb-5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            {isAr ? "فريقنا القانوني المتخصص جاهز لمساعدتك في كل خطوة." : "Our specialized legal team is ready to help at every step."}
          </p>
          <Link href="/services/consultations">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 bg-[#0B3D2E] text-[#C8A762] font-bold px-8 py-3.5 rounded-xl text-sm shadow-lg cursor-pointer">
              <Briefcase size={16} /> {t.ctaMain} <Arrow size={14} />
            </motion.div>
          </Link>
        </motion.div>

      </div>
      <FloatingButtons />
    </div>
  );
}
