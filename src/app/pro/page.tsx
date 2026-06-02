"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Scales,
  Brain,
  ChartBar,
  Users,
  FileText,
  Lightning,
  Check,
  ArrowLeft,
  ArrowRight,
  Star,
  Briefcase,
  ShieldCheck,
  CalendarBlank,
  Bell,
  ChatCircleDots,
  CurrencyDollar,
  Buildings,
  CaretDown,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Data ────────────────────────────────────────────────────────────────────

const features = {
  ar: [
    { icon: Brain, title: "مساعد AI متخصص", desc: "ذكاء اصطناعي مُدرَّب على الأنظمة والتشريعات السعودية يساعدك في الصياغة والبحث والتحليل.", color: "from-violet-500 to-purple-600" },
    { icon: ChartBar, title: "لوحة تحكم متكاملة", desc: "تابع قضاياك ومواعيدك وأتعابك ومستنداتك من مكان واحد مع إحصائيات لحظية.", color: "from-royal to-emerald-600" },
    { icon: Users, title: "إدارة الموكلين", desc: "قاعدة بيانات ذكية لجميع موكليك مع سجل كامل للتواصل والمستندات والاتفاقيات.", color: "from-blue-500 to-cyan-600" },
    { icon: FileText, title: "مكتبة قوالب ذكية", desc: "مئات القوالب القانونية الجاهزة يمكن تخصيصها بالذكاء الاصطناعي في ثوانٍ.", color: "from-amber-500 to-orange-600" },
    { icon: CalendarBlank, title: "إدارة المواعيد", desc: "تقويم ذكي مدمج مع محكمة.جوف وإشعارات تلقائية للجلسات والمواعيد النهائية.", color: "from-pink-500 to-rose-600" },
    { icon: CurrencyDollar, title: "نظام الأتعاب والفواتير", desc: "إصدار فواتير احترافية، تتبع المدفوعات، ونظام Escrow لضمان حصولك على أتعابك.", color: "from-teal-500 to-green-600" },
  ],
  en: [
    { icon: Brain, title: "Specialized AI Assistant", desc: "AI trained on Saudi laws and regulations to help you draft, research, and analyze.", color: "from-violet-500 to-purple-600" },
    { icon: ChartBar, title: "Integrated Dashboard", desc: "Track your cases, appointments, fees, and documents in one place with real-time stats.", color: "from-royal to-emerald-600" },
    { icon: Users, title: "Client Management", desc: "Smart database for all your clients with full communication history, docs, and agreements.", color: "from-blue-500 to-cyan-600" },
    { icon: FileText, title: "Smart Template Library", desc: "Hundreds of ready-made legal templates customizable with AI in seconds.", color: "from-amber-500 to-orange-600" },
    { icon: CalendarBlank, title: "Appointment Management", desc: "Smart calendar integrated with court portals with auto-notifications.", color: "from-pink-500 to-rose-600" },
    { icon: CurrencyDollar, title: "Fees & Invoicing", desc: "Issue professional invoices, track payments, and secure your fees with Escrow.", color: "from-teal-500 to-green-600" },
  ],
};

const plans = [
  {
    name: { ar: "Pro شخصي", en: "Pro Personal" },
    price: { ar: "٢٩٩", en: "299" },
    unit: { ar: "ر.س/شهر", en: "SAR/mo" },
    desc: { ar: "للمحامي المستقل", en: "For solo lawyers" },
    features: {
      ar: ["جميع ميزات Pro", "حتى ٥٠ موكل", "٥ مستخدمين", "دعم بالبريد"],
      en: ["All Pro features", "Up to 50 clients", "5 users", "Email support"],
    },
    highlight: false,
  },
  {
    name: { ar: "Pro مكتب", en: "Pro Office" },
    price: { ar: "٧٩٩", en: "799" },
    unit: { ar: "ر.س/شهر", en: "SAR/mo" },
    desc: { ar: "للمكاتب الصغيرة ٢–١٠ محامين", en: "For small firms 2–10 lawyers" },
    features: {
      ar: ["جميع ميزات Personal", "موكلون غير محدودون", "٢٠ مستخدم", "دعم فوري", "تقارير متقدمة"],
      en: ["All Personal features", "Unlimited clients", "20 users", "Priority support", "Advanced reports"],
    },
    highlight: true,
  },
  {
    name: { ar: "Pro Enterprise", en: "Pro Enterprise" },
    price: { ar: "حسب الطلب", en: "Custom" },
    unit: { ar: "", en: "" },
    desc: { ar: "للشركات القانونية الكبرى", en: "For large law firms" },
    features: {
      ar: ["كل شيء في Office", "API مخصص", "SSO", "مدير حساب مخصص", "SLA مضمون"],
      en: ["Everything in Office", "Custom API", "SSO", "Dedicated account manager", "Guaranteed SLA"],
    },
    highlight: false,
  },
];

const faqs = [
  { q: { ar: "ما الفرق بين نظامي Pro ونظامي العادي؟", en: "What's the difference between Nezamy Pro and regular Nezamy?" }, a: { ar: "نظامي Pro مخصص للمحامين ومقدمي الخدمات القانونية، ويوفر أدوات متقدمة لإدارة الأعمال القانونية بالكامل، بينما نظامي العادي موجه لطالبي الخدمة.", en: "Nezamy Pro is designed for lawyers and legal service providers, offering advanced tools for full legal practice management, while regular Nezamy is for service seekers." } },
  { q: { ar: "هل يمكنني الاستمرار في استقبال العملاء من منصة نظامي؟", en: "Can I continue receiving clients from the Nezamy platform?" }, a: { ar: "نعم، عند الاشتراك في Pro يمكنك الاستمرار في الظهور في قائمة المقدمين واستقبال طلبات العملاء.", en: "Yes, subscribing to Pro allows you to remain listed as a provider and receive client requests." } },
  { q: { ar: "هل يعمل نظامي Pro مع منظومة وزارة العدل؟", en: "Does Nezamy Pro integrate with the Ministry of Justice?" }, a: { ar: "نعم، يتكامل مع بوابة ناجز والنظام القضائي السعودي لسحب بيانات القضايا تلقائياً.", en: "Yes, it integrates with Najiz portal and the Saudi judicial system to auto-fetch case data." } },
  { q: { ar: "هل يوجد نسخة تجريبية؟", en: "Is there a free trial?" }, a: { ar: "نعم، ٣٠ يوماً مجاناً بدون بطاقة ائتمان.", en: "Yes, 30 days free with no credit card required." } },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProPage() {
  const { isRTL, isDark } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-slate-900"}`}>
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-32 pb-24">
        <div className="absolute inset-0 bg-gradient-to-br from-royal via-[#0d4a35] to-[#061f17]" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 50% 50%, #C8A762 0%, transparent 60%)" }} />
        <div className="relative mx-auto max-w-6xl px-4">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-sm font-medium text-gold">
              <Lightning size={14} weight="fill" />
              {isRTL ? "للمحامين ومزودي الخدمة" : "For Lawyers & Service Providers"}
            </span>
            <h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl md:text-6xl">
              {isRTL ? "نظامي Pro" : "Nezamy Pro"}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
              {isRTL
                ? "منصة إدارة الأعمال القانونية المتكاملة — ذكاء اصطناعي متخصص، إدارة موكلين، تتبع قضايا، وفوترة ذكية في مكان واحد."
                : "The complete legal practice management platform — specialized AI, client management, case tracking, and smart billing in one place."}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link href="/register/provider" className="inline-flex items-center gap-2 rounded-xl bg-gold px-8 py-4 font-semibold text-royal transition hover:bg-gold/90">
                {isRTL ? "ابدأ مجاناً ٣٠ يوماً" : "Start Free for 30 Days"}
                <Arrow size={18} />
              </Link>
              <Link href="#features" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-semibold text-white backdrop-blur transition hover:bg-white/20">
                {isRTL ? "استكشف الميزات" : "Explore Features"}
              </Link>
            </div>
          </motion.div>

          {/* Mock dashboard preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-16 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1a14] shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-white/10 bg-[#0a1510] px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-red-500/70" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
              <div className="h-3 w-3 rounded-full bg-green-500/70" />
              <span className="mx-auto text-xs text-white/40">نظامي Pro — لوحة التحكم</span>
            </div>
            <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
              {[
                { label: isRTL ? "القضايا الفعالة" : "Active Cases", value: "٢٣", trend: "+٣" },
                { label: isRTL ? "موعد هذا الأسبوع" : "This Week's Hearings", value: "٥", trend: "غداً" },
                { label: isRTL ? "الأتعاب المعلقة" : "Pending Fees", value: "١٢,٥٠٠", trend: "ر.س" },
                { label: isRTL ? "رضا الموكلين" : "Client Satisfaction", value: "٩٨٪", trend: "↑٢٪" },
              ].map((stat, i) => (
                <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-4">
                  <p className="text-xs text-white/40">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-white">{stat.value}</p>
                  <p className="mt-0.5 text-xs text-green-400">{stat.trend}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className={`py-24 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className={`text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "كل ما تحتاجه في مكان واحد" : "Everything You Need in One Place"}
            </h2>
            <p className={`mx-auto mt-4 max-w-xl text-lg ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? "أدوات مصممة خصيصاً للمحامي السعودي المحترف" : "Tools designed specifically for the Saudi legal professional"}
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(isRTL ? features.ar : features.en).map((feat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`group rounded-2xl border p-6 transition hover:shadow-lg ${isDark ? "border-white/10 bg-dark-card hover:border-white/20" : "border-slate-200 bg-white hover:border-slate-300"}`}
              >
                <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${feat.color} p-3 text-white`}>
                  <feat.icon size={24} weight="bold" />
                </div>
                <h3 className={`text-lg font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{feat.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className={`py-24 ${isDark ? "bg-[#0e1218]" : "bg-white"}`}>
        <div className="mx-auto max-w-5xl px-4">
          <div className="text-center">
            <h2 className={`text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "خطط مرنة تناسب كل مكتب" : "Flexible Plans for Every Firm"}
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {plans.map((plan, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -6 }}
                className={`relative rounded-2xl border p-8 ${plan.highlight
                  ? "border-gold bg-gradient-to-br from-royal to-[#0d4a35] text-white shadow-xl"
                  : isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-white"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-gold px-4 py-1 text-xs font-bold text-royal">
                    {isRTL ? "الأكثر شعبية" : "Most Popular"}
                  </span>
                )}
                <h3 className={`text-xl font-bold ${plan.highlight ? "text-white" : isDark ? "text-white" : "text-slate-900"}`}>
                  {isRTL ? plan.name.ar : plan.name.en}
                </h3>
                <p className={`mt-1 text-sm ${plan.highlight ? "text-white/70" : isDark ? "text-gray-400" : "text-slate-500"}`}>
                  {isRTL ? plan.desc.ar : plan.desc.en}
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className={`text-4xl font-black ${plan.highlight ? "text-gold" : isDark ? "text-white" : "text-slate-900"}`}>
                    {isRTL ? plan.price.ar : plan.price.en}
                  </span>
                  <span className={`text-sm ${plan.highlight ? "text-white/60" : isDark ? "text-gray-400" : "text-slate-500"}`}>
                    {isRTL ? plan.unit.ar : plan.unit.en}
                  </span>
                </div>
                <ul className="mt-6 space-y-3">
                  {(isRTL ? plan.features.ar : plan.features.en).map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm">
                      <Check size={16} weight="bold" className={plan.highlight ? "text-gold" : "text-royal"} />
                      <span className={plan.highlight ? "text-white/90" : isDark ? "text-gray-300" : "text-slate-700"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/register/provider" className={`mt-8 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold transition ${plan.highlight
                  ? "bg-gold text-royal hover:bg-gold/90"
                  : isDark ? "border border-white/20 text-white hover:bg-white/10" : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}>
                  {isRTL ? "ابدأ الآن" : "Get Started"}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className={`py-20 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-5xl px-4">
          <h2 className={`mb-10 text-center text-2xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {isRTL ? "ماذا يقول المحامون" : "What Lawyers Say"}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { name: isRTL ? "المحامي أحمد الغامدي" : "Lawyer Ahmed Al-Ghamdi", role: isRTL ? "محامٍ مدني — الرياض" : "Civil Lawyer — Riyadh", text: isRTL ? "وفّر عليّ نظامي Pro ساعات يومياً في إدارة الملفات والفواتير. الآن أركز على القضايا." : "Nezamy Pro saves me hours daily on file management and billing. Now I focus on cases." },
              { name: isRTL ? "المستشارة ليلى الزهراني" : "Counselor Layla Al-Zahrani", role: isRTL ? "مستشارة قانونية — جدة" : "Legal Counsel — Jeddah", text: isRTL ? "مكتبة القوالب وذكاء الصياغة غيّرا طريقة عملي تماماً." : "The template library and drafting AI completely changed how I work." },
              { name: isRTL ? "الأستاذ خالد المطيري" : "Prof. Khaled Al-Mutairi", role: isRTL ? "شريك — مكتب المطيري للمحاماة" : "Partner — Al-Mutairi Law Firm", text: isRTL ? "أفضل استثمار في إدارة المكتب. الفريق أصبح أكثر إنتاجية بنسبة ٤٠٪." : "Best investment in office management. The team is 40% more productive." },
            ].map((t, i) => (
              <div key={i} className={`rounded-2xl border p-6 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-white"}`}>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, s) => <Star key={s} size={14} weight="fill" className="text-gold" />)}
                </div>
                <p className={`mt-3 text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-slate-600"}`}>"{t.text}"</p>
                <div className="mt-4">
                  <p className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{t.name}</p>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={`py-20 ${isDark ? "bg-[#0e1218]" : "bg-white"}`}>
        <div className="mx-auto max-w-3xl px-4">
          <h2 className={`mb-8 text-center text-2xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {isRTL ? "أسئلة شائعة" : "FAQ"}
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className={`overflow-hidden rounded-xl border ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between px-6 py-4 text-start">
                  <span className={`font-medium ${isDark ? "text-white" : "text-slate-900"}`}>{isRTL ? faq.q.ar : faq.q.en}</span>
                  <CaretDown size={16} className={`shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""} ${isDark ? "text-gray-400" : "text-slate-400"}`} />
                </button>
                {openFaq === i && (
                  <div className={`border-t px-6 pb-4 pt-3 text-sm leading-relaxed ${isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-600"}`}>
                    {isRTL ? faq.a.ar : faq.a.en}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-gradient-to-br from-royal to-[#0d4a35] py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white">
            {isRTL ? "جاهز لتطوير مكتبك القانوني؟" : "Ready to Elevate Your Legal Practice?"}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70">
            {isRTL ? "ابدأ تجربتك المجانية لمدة ٣٠ يوماً. لا يلزم بطاقة ائتمان." : "Start your free 30-day trial. No credit card required."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/register/provider" className="inline-flex items-center gap-2 rounded-xl bg-gold px-8 py-4 font-semibold text-royal transition hover:bg-gold/90">
              {isRTL ? "ابدأ مجاناً" : "Start Free"}
              <Arrow size={18} />
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-semibold text-white backdrop-blur transition hover:bg-white/20">
              {isRTL ? "تواصل مع فريق المبيعات" : "Talk to Sales"}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
