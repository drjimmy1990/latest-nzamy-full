"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Stamp, ShieldCheck, ArrowLeft, ArrowRight, Check,
  Briefcase, FileText, MagnifyingGlass, Clock,
  CurrencyDollar, CaretDown, Lightning, Warning, Globe,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import FloatingButtons from "@/components/FloatingButtons";

const txt = {
  ar: {
    back: "خدمات الأعمال",
    badge: "الملكية الفكرية",
    title: "تسجيل العلامات التجارية في المملكة",
    subtitle: "نحمي علامتك التجارية قانونياً عبر التسجيل في الهيئة السعودية للملكية الفكرية (SAIP) — بحث مسبق، تقديم الطلب، ومتابعة حتى الحصول على الشهادة.",
    price: "يبدأ من 2,499 ﷼",
    duration: "30 — 90 يوم عمل",
    ctaMain: "احجز استشارة تسجيل",
    ctaWa: "تواصل عبر واتساب",
    servicesTitle: "خدماتنا في العلامات التجارية",
    services: [
      { name: "بحث مسبق عن العلامة", desc: "فحص شامل في قاعدة بيانات SAIP للتأكد من عدم وجود علامة مشابهة قبل التقديم.", icon: MagnifyingGlass, price: "499 ﷼" },
      { name: "تسجيل علامة تجارية جديدة", desc: "تقديم طلب التسجيل الكامل مع متابعة الإجراءات حتى صدور شهادة التسجيل.", icon: Stamp, price: "2,499 ﷼" },
      { name: "تجديد علامة تجارية", desc: "تجديد تسجيل العلامة قبل انتهاء مدة الحماية (10 سنوات).", icon: ShieldCheck, price: "1,499 ﷼" },
      { name: "حماية دولية (بروتوكول مدريد)", desc: "تسجيل علامتك في عدة دول عبر النظام الدولي لتسجيل العلامات.", icon: Globe, price: "يبدأ من 4,999 ﷼" },
      { name: "الاعتراض والدفاع", desc: "تقديم اعتراض على علامات مشابهة أو الدفاع عن علامتك ضد الاعتراضات.", icon: Warning, price: "3,999 ﷼" },
    ],
    stepsTitle: "خطوات التسجيل",
    steps: [
      { title: "البحث المسبق", desc: "فحص قاعدة بيانات SAIP للتأكد من توفر العلامة" },
      { title: "إعداد الطلب", desc: "تحديد التصنيفات (الفئات الدولية) وإعداد ملف الطلب" },
      { title: "التقديم الرسمي", desc: "تقديم الطلب إلكترونياً عبر منصة SAIP" },
      { title: "فترة الفحص", desc: "فحص الطلب من قِبل الهيئة (30-60 يوم)" },
      { title: "النشر والاعتراض", desc: "نشر العلامة في الجريدة الرسمية لمدة 60 يوماً" },
      { title: "إصدار الشهادة", desc: "صدور شهادة تسجيل العلامة التجارية (حماية 10 سنوات)" },
    ],
    tipsTitle: "نصائح مهمة قبل التسجيل",
    tips: [
      "تأكد أن علامتك مميزة وغير وصفية — العلامات الوصفية (مثل 'أفضل قهوة') تُرفض غالباً",
      "حدد التصنيفات الصحيحة — كل فئة دولية (Nice Classification) تتطلب رسوماً منفصلة",
      "سجّل العلامة بالعربية والإنجليزية معاً لحماية أشمل",
      "لا تستخدم العلامة تجارياً قبل التسجيل — قد تفقد حق الأولوية",
    ],
    faqTitle: "أسئلة شائعة",
    faqs: [
      { q: "كم تكلفة تسجيل العلامة التجارية في السعودية؟", a: "الرسوم الحكومية لدى SAIP تبدأ من 1,000 ﷼ لكل فئة دولية. أتعابنا تشمل البحث المسبق، إعداد الطلب، والمتابعة الكاملة." },
      { q: "كم تستغرق عملية التسجيل؟", a: "عادةً من 3-6 أشهر من تاريخ التقديم حتى صدور الشهادة، تشمل فترة الفحص وفترة النشر والاعتراض." },
      { q: "ما مدة حماية العلامة التجارية؟", a: "10 سنوات هجرية من تاريخ التسجيل، قابلة للتجديد لفترات مماثلة بدون حد أقصى." },
      { q: "هل يمكن تسجيل علامة باللغة العربية فقط؟", a: "نعم، لكن ننصح بتسجيلها بالعربية والإنجليزية معاً لتوفير حماية أوسع، خاصةً إذا كنت تخطط للتوسع دولياً." },
    ],
  },
  en: {
    back: "Business Services",
    badge: "Intellectual Property",
    title: "Trademark Registration in Saudi Arabia",
    subtitle: "We legally protect your brand through registration with the Saudi Authority for Intellectual Property (SAIP) — prior search, application filing, and follow-up until certification.",
    price: "Starting from SAR 2,499",
    duration: "30 — 90 business days",
    ctaMain: "Book Registration Consultation",
    ctaWa: "Contact via WhatsApp",
    servicesTitle: "Our Trademark Services",
    services: [
      { name: "Prior Trademark Search", desc: "Comprehensive search in SAIP database to ensure no similar marks exist.", icon: MagnifyingGlass, price: "SAR 499" },
      { name: "New Trademark Registration", desc: "Complete application filing with follow-up until certificate issuance.", icon: Stamp, price: "SAR 2,499" },
      { name: "Trademark Renewal", desc: "Renew your trademark registration before protection period expires (10 years).", icon: ShieldCheck, price: "SAR 1,499" },
      { name: "International Protection (Madrid)", desc: "Register your mark in multiple countries via Madrid Protocol.", icon: Globe, price: "From SAR 4,999" },
      { name: "Opposition & Defense", desc: "File opposition against similar marks or defend yours against objections.", icon: Warning, price: "SAR 3,999" },
    ],
    stepsTitle: "Registration Steps",
    steps: [
      { title: "Prior Search", desc: "Check SAIP database to confirm mark availability" },
      { title: "Application Prep", desc: "Determine classifications (Nice) and prepare the file" },
      { title: "Official Filing", desc: "Submit electronically through SAIP platform" },
      { title: "Examination Period", desc: "Authority examination of the application (30-60 days)" },
      { title: "Publication & Opposition", desc: "Mark published in Official Gazette for 60 days" },
      { title: "Certificate Issuance", desc: "Trademark registration certificate issued (10-year protection)" },
    ],
    tipsTitle: "Important Tips Before Registration",
    tips: [
      "Ensure your mark is distinctive and non-descriptive — descriptive marks are usually rejected",
      "Select correct classifications — each Nice class requires separate fees",
      "Register in both Arabic and English for broader protection",
      "Don't use the mark commercially before registration — you may lose priority rights",
    ],
    faqTitle: "FAQ",
    faqs: [
      { q: "How much does trademark registration cost in Saudi Arabia?", a: "Government fees at SAIP start from SAR 1,000 per international class. Our fees include prior search, application preparation, and full follow-up." },
      { q: "How long does the registration process take?", a: "Typically 3-6 months from filing to certificate issuance, including examination and publication/opposition periods." },
      { q: "How long does trademark protection last?", a: "10 Hijri years from registration date, renewable for equal periods with no maximum limit." },
      { q: "Can I register a trademark in Arabic only?", a: "Yes, but we recommend registering in both Arabic and English for broader protection, especially if you plan international expansion." },
    ],
  },
};

export default function TrademarkPage() {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const t = isAr ? txt.ar : txt.en;
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const card = isDark ? "bg-zinc-900/80 border border-white/[0.06]" : "bg-white border border-zinc-100 shadow-sm";

  const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.45, ease: "easeOut" as const } }),
  };

  return (
    <div dir={isAr ? "rtl" : "ltr"} className={`min-h-[100dvh] ${isDark ? "bg-[#0c0f12] text-zinc-100" : "bg-zinc-50 text-zinc-900"}`}>
      <div className="max-w-[1200px] mx-auto px-4 py-8 md:py-16 space-y-14">

        <Link href="/services/business" className={`inline-flex items-center gap-1.5 text-sm font-medium ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"} transition-colors`}>
          <Arrow size={14} className={isAr ? "" : "rotate-180"} /> {t.back}
        </Link>

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <motion.section variants={fadeUp} initial="hidden" animate="show" custom={0}>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold mb-4 ${isDark ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" : "bg-amber-100 text-amber-700"}`}>
            <Stamp size={12} weight="fill" /> {t.badge}
          </span>
          <h1 className={`text-3xl md:text-4xl font-bold tracking-tight mb-4 ${isDark ? "text-white" : "text-zinc-900"}`}>{t.title}</h1>
          <p className={`text-base leading-relaxed max-w-[65ch] mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{t.subtitle}</p>

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
                <Stamp size={16} /> {t.ctaMain} <Arrow size={14} />
              </motion.div>
            </Link>
          </div>
        </motion.section>

        {/* ── Services ─────────────────────────────────────────────── */}
        <section>
          <h2 className={`text-xl font-bold mb-6 ${isDark ? "text-white" : "text-zinc-900"}`}>{t.servicesTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.services.map((svc, i) => {
              const Icon = svc.icon;
              return (
                <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 2}
                  whileHover={{ y: -3, transition: { type: "spring", stiffness: 200, damping: 20 } }}
                  className={`rounded-2xl p-5 ${card}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-amber-400 flex items-center justify-center shadow">
                      <Icon size={18} weight="fill" className="text-white" />
                    </div>
                    <span className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{svc.price}</span>
                  </div>
                  <h3 className={`text-[14px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-800"}`}>{svc.name}</h3>
                  <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{svc.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── Steps ───────────────────────────────────────────────── */}
        <section>
          <h2 className={`text-xl font-bold mb-6 ${isDark ? "text-white" : "text-zinc-900"}`}>{t.stepsTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.steps.map((step, i) => (
              <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 8}
                className={`rounded-2xl p-5 ${card}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold mb-3 ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
                  {i + 1}
                </div>
                <p className={`text-[14px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-800"}`}>{step.title}</p>
                <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Tips ─────────────────────────────────────────────────── */}
        <section className={`rounded-2xl p-6 ${isDark ? "bg-amber-950/20 border border-amber-500/10" : "bg-amber-50/60 border border-amber-200/40"}`}>
          <h2 className={`text-lg font-bold mb-4 flex items-center gap-2 ${isDark ? "text-amber-400" : "text-amber-800"}`}>
            <Lightning size={18} weight="fill" /> {t.tipsTitle}
          </h2>
          <div className="space-y-3">
            {t.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Check size={13} weight="bold" className={`mt-0.5 shrink-0 ${isDark ? "text-amber-500" : "text-amber-600"}`} />
                <span className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{tip}</span>
              </div>
            ))}
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
                  <motion.span animate={{ rotate: openFaq === i ? 180 : 0 }} className="shrink-0"><CaretDown size={14} /></motion.span>
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

      </div>
      <FloatingButtons />
    </div>
  );
}
