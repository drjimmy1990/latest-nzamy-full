"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Scales,
  Briefcase,
  Buildings,
  ShieldCheck,
  Heart,
  Bank,
  Gavel,
  Check,
  ArrowLeft,
  ArrowRight,
  Star,
  CaretDown,
  Lock,
  ChartBar,
  UserCircle,
  Clock,
  CurrencyDollar,
  FileText,
  Handshake,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Data ────────────────────────────────────────────────────────────────────

const caseTypes = {
  ar: [
    { icon: Briefcase, label: "قضايا عمالية", desc: "فصل تعسفي، عقود عمل، مستحقات نهاية الخدمة، إصابات عمل.", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { icon: Scales, label: "قضايا مدنية", desc: "ديون، عقارات، تعويضات، نزاعات تجارية بين الأفراد.", color: "bg-royal/10 text-royal" },
    { icon: Buildings, label: "قضايا تجارية", desc: "شركات، عقود تجارية، إفلاس، نزاعات الملكية التجارية.", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { icon: ShieldCheck, label: "قضايا جنائية", desc: "دفاع جنائي في جميع درجات التقاضي بسرية تامة.", color: "bg-red-500/10 text-red-600 dark:text-red-400" },
    { icon: Heart, label: "قضايا الأسرة", desc: "طلاق، حضانة، نفقة، ميراث، وصايا.", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
    { icon: Bank, label: "قضايا إدارية", desc: "نزاعات مع جهات حكومية، تظلمات، لوائح إدارية.", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ],
  en: [
    { icon: Briefcase, label: "Labor Cases", desc: "Wrongful termination, employment contracts, end-of-service benefits, work injuries.", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { icon: Scales, label: "Civil Cases", desc: "Debts, real estate, compensation, individual commercial disputes.", color: "bg-royal/10 text-royal" },
    { icon: Buildings, label: "Commercial Cases", desc: "Companies, commercial contracts, bankruptcy, business ownership disputes.", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { icon: ShieldCheck, label: "Criminal Cases", desc: "Criminal defense at all court levels with full confidentiality.", color: "bg-red-500/10 text-red-600 dark:text-red-400" },
    { icon: Heart, label: "Family Cases", desc: "Divorce, custody, alimony, inheritance, wills.", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
    { icon: Bank, label: "Administrative Cases", desc: "Disputes with government entities, complaints, administrative regulations.", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ],
};

const steps = {
  ar: [
    { num: "١", icon: FileText, title: "تقييم القضية", desc: "تقديم تفاصيل قضيتك، يراجعها محامٍ متخصص ويُقدم تقييماً أولياً مجانياً خلال ٢٤ ساعة." },
    { num: "٢", icon: UserCircle, title: "اختيار المحامي", desc: "يُقترح عليك محامون متخصصون في نوع قضيتك مع تقييماتهم وسجل قضاياهم." },
    { num: "٣", icon: Handshake, title: "توقيع التوكيل", desc: "وكالة رسمية إلكترونية موثقة وتحديد الأتعاب بشفافية تامة." },
    { num: "٤", icon: Lock, title: "إيداع الأتعاب (Escrow)", desc: "تُودَع الأتعاب في حساب ضمان محمي — لا تصل للمحامي إلا عند إنجاز كل مرحلة." },
    { num: "٥", icon: Gavel, title: "الترافع والمتابعة", desc: "يترافع محاميك أمام المحكمة مع تحديثات دورية وتقارير مفصّلة بعد كل جلسة." },
  ],
  en: [
    { num: "1", icon: FileText, title: "Case Evaluation", desc: "Submit your case details, reviewed by a specialized lawyer who provides a free preliminary assessment within 24 hours." },
    { num: "2", icon: UserCircle, title: "Lawyer Selection", desc: "Specialized lawyers are suggested based on your case type with ratings and case history." },
    { num: "3", icon: Handshake, title: "Power of Attorney", desc: "Official electronic notarized POA and transparent fee determination." },
    { num: "4", icon: Lock, title: "Escrow Fee Deposit", desc: "Fees are deposited in a protected escrow — only released to the lawyer upon completing each milestone." },
    { num: "5", icon: Gavel, title: "Litigation & Follow-up", desc: "Your lawyer pleads in court with periodic updates and detailed reports after each hearing." },
  ],
};

const faqs = [
  { q: { ar: "كيف أختار المحامي المناسب لقضيتي؟", en: "How do I choose the right lawyer for my case?" }, a: { ar: "نظامي يقترح عليك محامين بناءً على تخصصهم وموقعهم وتقييمات موكليهم السابقين. يمكنك مراجعة ملفاتهم الكاملة قبل الاختيار.", en: "Nezamy suggests lawyers based on their specialty, location, and previous client ratings. You can review their full profiles before choosing." } },
  { q: { ar: "ما هو نظام Escrow وكيف يحمي حقوقي؟", en: "What is the Escrow system and how does it protect my rights?" }, a: { ar: "نظام Escrow يعني إيداع الأتعاب في حساب ضمان محمي لدى نظامي. يُطلق للمحامي عند إنجاز كل مرحلة متفق عليها، مما يضمن حقوقك كاملاً.", en: "Escrow means depositing fees in a protected trust account at Nezamy. Released to the lawyer upon completing each agreed milestone, fully protecting your rights." } },
  { q: { ar: "هل يمكنني تغيير المحامي أثناء سير القضية؟", en: "Can I change the lawyer during the case?" }, a: { ar: "نعم، إذا لم تكن راضياً يمكن تغيير المحامي. تُعاد الأتعاب غير المكتسبة لحساب Escrow تلقائياً.", en: "Yes, if unsatisfied you can change lawyers. Unearned fees are automatically returned to the Escrow account." } },
  { q: { ar: "ما درجات التقاضي التي يغطيها نظامي؟", en: "Which court levels does Nezamy cover?" }, a: { ar: "جميع الدرجات: المحاكم الابتدائية، محاكم الاستئناف، المحكمة العليا، المحاكم الإدارية، والمحاكم التجارية.", en: "All levels: Primary courts, Courts of Appeal, Supreme Court, Administrative Courts, and Commercial Courts." } },
  { q: { ar: "هل المحامون مرخصون من وزارة العدل؟", en: "Are the lawyers licensed by the Ministry of Justice?" }, a: { ar: "نعم، جميع المحامين المسجلين في نظامي يمرون بعملية تحقق صارمة من رخصة المحاماة الصادرة من وزارة العدل وهيئة المحامين.", en: "Yes, all lawyers registered on Nezamy go through strict verification of their license issued by the Ministry of Justice and Bar Association." } },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LegalRepresentationPage() {
  const { isRTL, isDark } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-slate-900"}`}>
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-32 pb-20">
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-b from-[#0c1810] to-dark-bg" : "bg-gradient-to-b from-royal/5 to-transparent"}`} />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, x: isRTL ? 24 : -24 }} animate={{ opacity: 1, x: 0 }}>
              <span className={`mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${isDark ? "bg-royal/20 text-green-300" : "bg-royal/10 text-royal"}`}>
                <Scales size={14} weight="fill" />
                {isRTL ? "التمثيل القضائي" : "Legal Representation"}
              </span>
              <h1 className={`text-4xl font-bold leading-tight sm:text-5xl ${isDark ? "text-white" : "text-slate-900"}`}>
                {isRTL ? "محامٍ متخصص يُدافع عنك في المحكمة" : "A Specialized Lawyer Defending You in Court"}
              </h1>
              <p className={`mt-6 text-lg leading-relaxed ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                {isRTL
                  ? "وكّل محامياً معتمداً يترافع نيابةً عنك في جميع درجات التقاضي — مع نظام Escrow لضمان أتعابك وتقارير دورية مفصّلة."
                  : "Appoint a certified lawyer to plead on your behalf at all court levels — with Escrow protection and detailed periodic reports."}
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/register/client" className="inline-flex items-center gap-2 rounded-xl bg-royal px-8 py-4 font-semibold text-white transition hover:bg-royal/90">
                  {isRTL ? "قيّم قضيتك الآن" : "Evaluate Your Case Now"}
                  <Arrow size={18} />
                </Link>
                <Link href="/services/consultations" className={`inline-flex items-center gap-2 rounded-xl border px-8 py-4 font-semibold transition ${isDark ? "border-white/10 text-white hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                  {isRTL ? "استشارة أولاً" : "Consult First"}
                </Link>
              </div>
            </motion.div>

            {/* Stats panel */}
            <motion.div initial={{ opacity: 0, x: isRTL ? -24 : 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
              <div className={`grid grid-cols-2 gap-4 rounded-3xl border p-6 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}>
                {[
                  { label: isRTL ? "قضية منجزة" : "Resolved Cases", value: "٨,٤٠٠+", sub: isRTL ? "منذ ٢٠٢١" : "Since 2021" },
                  { label: isRTL ? "نسبة الكسب" : "Win Rate", value: "٧٤٪", sub: isRTL ? "متوسط المنصة" : "Platform average" },
                  { label: isRTL ? "محامٍ متخصص" : "Specialized Lawyers", value: "٥٠٠+", sub: isRTL ? "في ١٢ مدينة" : "In 12 cities" },
                  { label: isRTL ? "رضا الموكلين" : "Client Satisfaction", value: "٩٧٪", sub: isRTL ? "بناءً على التقييمات" : "Based on ratings" },
                ].map((s, i) => (
                  <div key={i} className={`rounded-2xl p-5 ${isDark ? "bg-[#1c2128]" : "bg-white"} border ${isDark ? "border-white/5" : "border-slate-100"}`}>
                    <p className={`text-3xl font-black ${isDark ? "text-white" : "text-slate-900"}`}>{s.value}</p>
                    <p className={`mt-1 text-sm font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>{s.label}</p>
                    <p className={`text-xs ${isDark ? "text-gray-500" : "text-slate-400"}`}>{s.sub}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Case Types ── */}
      <section className={`py-20 ${isDark ? "bg-[#0e1218]" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-6xl px-4">
          <h2 className={`mb-3 text-center text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {isRTL ? "تخصصاتنا القضائية" : "Our Legal Specializations"}
          </h2>
          <p className={`mb-10 text-center ${isDark ? "text-gray-400" : "text-slate-500"}`}>
            {isRTL ? "محامون متخصصون في كل نوع من أنواع القضايا" : "Specialized lawyers for every case type"}
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(isRTL ? caseTypes.ar : caseTypes.en).map((ct, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className={`rounded-2xl border p-6 transition hover:shadow-md ${isDark ? "border-white/10 bg-dark-card hover:border-white/20" : "border-slate-200 bg-white hover:border-slate-300"}`}
              >
                <div className={`mb-4 inline-flex rounded-xl p-3 ${ct.color}`}>
                  <ct.icon size={22} weight="bold" />
                </div>
                <h3 className={`text-lg font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{ct.label}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>{ct.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Process ── */}
      <section className={`py-20 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
        <div className="mx-auto max-w-4xl px-4">
          <h2 className={`mb-3 text-center text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {isRTL ? "كيف نعمل معك" : "How We Work With You"}
          </h2>
          <p className={`mb-12 text-center ${isDark ? "text-gray-400" : "text-slate-500"}`}>
            {isRTL ? "٥ خطوات شفافة من أول استشارة حتى الحكم النهائي" : "5 transparent steps from first consultation to final verdict"}
          </p>
          <div className="relative space-y-4">
            {/* Connecting line */}
            <div className={`absolute start-[2.25rem] top-8 bottom-8 w-px ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
            {(isRTL ? steps.ar : steps.en).map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative flex gap-4 rounded-2xl border p-5 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}
              >
                <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-royal text-sm font-bold text-white">
                  {step.num}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <step.icon size={16} className={isDark ? "text-gray-400" : "text-slate-500"} />
                    <h3 className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{step.title}</h3>
                  </div>
                  <p className={`mt-1 text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust signals ── */}
      <section className={`py-16 ${isDark ? "bg-[#0e1218]" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid gap-5 sm:grid-cols-3">
            {[
              { icon: Lock, title: isRTL ? "نظام Escrow محمي" : "Protected Escrow System", desc: isRTL ? "أتعابك محمية في حساب ضمان — لا تصل للمحامي إلا عند إنجاز كل مرحلة." : "Your fees protected in escrow — only released to the lawyer upon completing each milestone." },
              { icon: ShieldCheck, title: isRTL ? "محامون معتمدون" : "Licensed Lawyers", desc: isRTL ? "جميع المحامين محققون من هيئة المحامين ووزارة العدل." : "All lawyers verified by the Bar Association and Ministry of Justice." },
              { icon: ChartBar, title: isRTL ? "تقارير مفصّلة" : "Detailed Reports", desc: isRTL ? "تقرير كامل بعد كل جلسة يشمل ما دار وما هو متوقع." : "Full report after each hearing covering what happened and what's next." },
            ].map((badge, i) => (
              <div key={i} className={`flex gap-4 rounded-2xl border p-6 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-white"}`}>
                <div className="shrink-0 rounded-xl bg-royal/10 p-3 text-royal">
                  <badge.icon size={22} weight="bold" />
                </div>
                <div>
                  <h3 className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{badge.title}</h3>
                  <p className={`mt-1 text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>{badge.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={`py-20 ${isDark ? "bg-dark-bg" : "bg-white"}`}>
        <div className="mx-auto max-w-3xl px-4">
          <h2 className={`mb-8 text-center text-2xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {isRTL ? "أسئلة شائعة" : "Frequently Asked Questions"}
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className={`overflow-hidden rounded-xl border ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between px-6 py-4 text-start">
                  <span className={`font-medium ${isDark ? "text-white" : "text-slate-900"}`}>{isRTL ? faq.q.ar : faq.q.en}</span>
                  <CaretDown size={16} className={`shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""} ${isDark ? "text-gray-400" : "text-slate-400"}`} />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className={`border-t px-6 pb-4 pt-3 text-sm leading-relaxed ${isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-600"}`}>
                        {isRTL ? faq.a.ar : faq.a.en}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-gradient-to-br from-royal to-[#0d4a35] py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <Gavel size={48} className="mx-auto mb-4 text-gold" weight="fill" />
          <h2 className="text-3xl font-bold text-white">
            {isRTL ? "لا تواجه المحكمة وحدك" : "Don't Face the Court Alone"}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70">
            {isRTL ? "قيّم قضيتك مجاناً واحصل على رأي قانوني متخصص خلال ٢٤ ساعة." : "Evaluate your case for free and get specialized legal advice within 24 hours."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/register/client" className="inline-flex items-center gap-2 rounded-xl bg-gold px-8 py-4 font-semibold text-royal transition hover:bg-gold/90">
              {isRTL ? "قيّم قضيتك مجاناً" : "Evaluate Your Case Free"}
              <Arrow size={18} />
            </Link>
            <Link href="/services/consultations" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-semibold text-white backdrop-blur transition hover:bg-white/20">
              {isRTL ? "استشارة أولاً" : "Consult First"}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
