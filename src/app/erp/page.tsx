"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Buildings,
  ChartBar,
  Users,
  FileText,
  Lightning,
  Check,
  ArrowLeft,
  ArrowRight,
  Brain,
  ShieldCheck,
  Gear,
  Database,
  Globe,
  ChartLineUp,
  CaretDown,
  LinkSimple,
  Lock,
  Headset,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Data ────────────────────────────────────────────────────────────────────

const modules = {
  ar: [
    { icon: FileText, title: "إدارة القضايا", desc: "متابعة شاملة لجميع القضايا من الإيداع حتى الإغلاق مع تتبع المواعيد والجلسات والمستندات.", color: "bg-royal/10 text-royal" },
    { icon: Users, title: "إدارة الموارد البشرية", desc: "إدارة المحامين والمساعدين والإداريين مع تتبع الأداء وتوزيع العمل وإدارة الإجازات.", color: "bg-blue-500/10 text-blue-600" },
    { icon: ChartBar, title: "المالية والفوترة", desc: "نظام محاسبي متكامل مع إدارة Escrow، الفواتير، المصروفات، والتقارير المالية.", color: "bg-emerald-500/10 text-emerald-600" },
    { icon: Brain, title: "ذكاء اصطناعي مؤسسي", desc: "محرك AI مخصص لمؤسستك مدرَّب على قضاياكم وعقودكم وسوابقكم القانونية.", color: "bg-violet-500/10 text-violet-600" },
    { icon: Database, title: "إدارة المستندات", desc: "مستودع ذكي للمستندات مع بحث AI وتصنيف تلقائي وإدارة الإصدارات.", color: "bg-orange-500/10 text-orange-600" },
    { icon: ChartLineUp, title: "التقارير والتحليلات", desc: "لوحات بيانات تفاعلية وتقارير تفصيلية عن أداء المكتب والإيرادات والقضايا.", color: "bg-pink-500/10 text-pink-600" },
    { icon: Globe, title: "البوابة الرقمية للموكلين", desc: "منصة مخصصة لموكليك لتتابع قضاياهم ومستنداتهم والتواصل مع فريقكم.", color: "bg-cyan-500/10 text-cyan-600" },
    { icon: Gear, title: "التكاملات والـ API", desc: "تكامل مع منظومة وزارة العدل (ناجز)، هيئة المحامين، وأنظمتكم الداخلية.", color: "bg-amber-500/10 text-amber-600" },
  ],
  en: [
    { icon: FileText, title: "Case Management", desc: "Full case tracking from filing to closure with deadlines, hearings, and document management.", color: "bg-royal/10 text-royal" },
    { icon: Users, title: "HR Management", desc: "Manage lawyers, paralegals, and admins with performance tracking, workload distribution, and leave management.", color: "bg-blue-500/10 text-blue-600" },
    { icon: ChartBar, title: "Finance & Billing", desc: "Integrated accounting with Escrow management, invoicing, expenses, and financial reports.", color: "bg-emerald-500/10 text-emerald-600" },
    { icon: Brain, title: "Enterprise AI", desc: "Custom AI engine trained on your firm's cases, contracts, and legal precedents.", color: "bg-violet-500/10 text-violet-600" },
    { icon: Database, title: "Document Management", desc: "Smart document repository with AI search, auto-classification, and version control.", color: "bg-orange-500/10 text-orange-600" },
    { icon: ChartLineUp, title: "Reports & Analytics", desc: "Interactive dashboards and detailed reports on firm performance, revenue, and cases.", color: "bg-pink-500/10 text-pink-600" },
    { icon: Globe, title: "Client Portal", desc: "Dedicated platform for your clients to track cases, documents, and communicate with your team.", color: "bg-cyan-500/10 text-cyan-600" },
    { icon: Gear, title: "Integrations & API", desc: "Integration with Ministry of Justice (Najiz), Bar Association, and your internal systems.", color: "bg-amber-500/10 text-amber-600" },
  ],
};

const faqs = [
  { q: { ar: "كم من الوقت يستغرق التطبيق؟", en: "How long does implementation take?" }, a: { ar: "يعتمد على حجم المؤسسة، لكن نوفر فريق تطبيق متخصص يُنجز الإعداد الأساسي خلال ٢–٤ أسابيع.", en: "Depends on firm size, but we provide a dedicated implementation team completing the core setup in 2-4 weeks." } },
  { q: { ar: "هل يمكن الاستضافة داخل المؤسسة (On-Premise)؟", en: "Is on-premise hosting available?" }, a: { ar: "نعم، نوفر خيار الاستضافة الخاصة أو السحابة أو النموذج الهجين حسب متطلبات حوكمة بياناتكم.", en: "Yes, we offer private hosting, cloud, or hybrid model depending on your data governance requirements." } },
  { q: { ar: "هل يلتزم نظامي ERP بأنظمة هيئة الزكاة والضريبة؟", en: "Is Nezamy ERP compliant with ZATCA regulations?" }, a: { ar: "نعم، النظام المالي يلتزم كاملاً بمتطلبات الفاتورة الإلكترونية (ZATCA Phase 2).", en: "Yes, the financial module is fully compliant with e-invoicing requirements (ZATCA Phase 2)." } },
  { q: { ar: "هل يوجد دعم فني مخصص؟", en: "Is there dedicated technical support?" }, a: { ar: "نعم، يحصل كل عميل ERP على مدير حساب مخصص ودعم ٢٤/٧ بـ SLA مضمون.", en: "Yes, every ERP client gets a dedicated account manager and 24/7 support with guaranteed SLA." } },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ErpPage() {
  const { isRTL, isDark } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-slate-900"}`}>
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-32 pb-24">
        <div className="absolute inset-0 bg-gradient-to-br from-[#06101a] via-[#0a1a2e] to-[#0d1f3c]" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, #0B3D2E 0%, transparent 60%), radial-gradient(circle at 70% 50%, #C8A762 0%, transparent 60%)" }} />
        <div className="relative mx-auto max-w-6xl px-4">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1.5 text-sm font-medium text-blue-300">
              <Buildings size={14} weight="fill" />
              {isRTL ? "للمؤسسات والشركات القانونية الكبرى" : "For Large Law Firms & Legal Departments"}
            </span>
            <h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl md:text-6xl">
              {isRTL ? "نظامي ERP" : "Nezamy ERP"}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
              {isRTL
                ? "نظام إدارة المؤسسات القانونية المتكامل — يربط فرقكم، قضاياكم، مواردكم البشرية، وماليتكم في منظومة واحدة ذكية."
                : "The complete legal enterprise management system — connecting your teams, cases, HR, and finances in one intelligent platform."}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-gold px-8 py-4 font-semibold text-royal transition hover:bg-gold/90">
                {isRTL ? "طلب عرض تجريبي" : "Request a Demo"}
                <Arrow size={18} />
              </Link>
              <Link href="#modules" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-semibold text-white backdrop-blur transition hover:bg-white/20">
                {isRTL ? "استكشف الوحدات" : "Explore Modules"}
              </Link>
            </div>
          </motion.div>

          {/* Trust badges */}
          <div className="mt-14 flex flex-wrap justify-center gap-6">
            {[
              { icon: Lock, label: isRTL ? "ISO 27001 معتمد" : "ISO 27001 Certified" },
              { icon: ShieldCheck, label: isRTL ? "متوافق مع PDPL" : "PDPL Compliant" },
              { icon: Globe, label: isRTL ? "متكامل مع ناجز" : "Najiz Integrated" },
              { icon: Headset, label: isRTL ? "دعم ٢٤/٧" : "24/7 Support" },
            ].map((badge, i) => (
              <div key={i} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 backdrop-blur">
                <badge.icon size={16} className="text-gold" />
                {badge.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Modules ── */}
      <section id="modules" className={`py-24 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className={`text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "وحدات نظامي ERP" : "Nezamy ERP Modules"}
            </h2>
            <p className={`mx-auto mt-4 max-w-xl text-lg ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? "كل وحدة مصممة خصيصاً للبيئة القانونية السعودية" : "Every module designed specifically for the Saudi legal environment"}
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {(isRTL ? modules.ar : modules.en).map((mod, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className={`rounded-2xl border p-6 transition hover:shadow-lg ${isDark ? "border-white/10 bg-dark-card hover:border-white/20" : "border-slate-200 bg-white hover:border-slate-300"}`}
              >
                <div className={`mb-4 inline-flex rounded-xl p-3 ${mod.color}`}>
                  <mod.icon size={22} weight="bold" />
                </div>
                <h3 className={`text-base font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{mod.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>{mod.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integration diagram ── */}
      <section className={`py-20 ${isDark ? "bg-[#0e1218]" : "bg-white"}`}>
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <h2 className={`text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                {isRTL ? "تكامل كامل مع المنظومة القضائية السعودية" : "Full Integration with the Saudi Judicial Ecosystem"}
              </h2>
              <p className={`mt-4 text-lg ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                {isRTL
                  ? "نظامي ERP يتحدث مباشرةً مع المنصات الحكومية بدون عمل يدوي، مما يوفر ساعات عمل يومياً لفريقكم."
                  : "Nezamy ERP speaks directly with government platforms without manual work, saving your team hours daily."}
              </p>
              <ul className="mt-6 space-y-4">
                {[
                  isRTL ? "بوابة ناجز — استيراد تلقائي للجلسات والأحكام" : "Najiz Portal — automatic import of hearings and rulings",
                  isRTL ? "هيئة المحامين — التحقق من الترخيص الآني" : "Bar Association — real-time license verification",
                  isRTL ? "ZATCA — فاتورة إلكترونية Phase 2 تلقائية" : "ZATCA — automatic e-invoice Phase 2",
                  isRTL ? "وزارة التجارة — التحقق من السجلات التجارية" : "Ministry of Commerce — commercial registration verification",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-1 shrink-0 rounded-full bg-royal/10 p-1">
                      <Check size={12} weight="bold" className="text-royal" />
                    </div>
                    <span className={`text-sm ${isDark ? "text-gray-300" : "text-slate-700"}`}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={`rounded-2xl border p-8 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-col gap-3">
                {[
                  { name: "ناجز", color: "bg-royal/20 text-royal" },
                  { name: "هيئة المحامين", color: "bg-blue-500/20 text-blue-500" },
                  { name: "ZATCA", color: "bg-emerald-500/20 text-emerald-500" },
                  { name: "وزارة التجارة", color: "bg-amber-500/20 text-amber-600" },
                  { name: "نظامي ERP", color: "bg-gold/20 text-gold" },
                ].map((item, i) => (
                  <div key={i} className={`flex items-center gap-3 rounded-xl p-3 ${i === 4 ? "border-2 border-gold/40 " + (isDark ? "bg-gold/5" : "bg-gold/5") : ""}`}>
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${item.color}`}>
                      {item.name.slice(0, 2)}
                    </div>
                    <span className={`text-sm font-medium ${isDark ? "text-white" : "text-slate-900"}`}>{item.name}</span>
                    {i < 4 && (
                      <div className={`ms-auto text-xs ${isDark ? "text-gray-500" : "text-slate-400"}`}>
                        {isRTL ? "↔ متكامل" : "↔ Integrated"}
                      </div>
                    )}
                    {i === 4 && <LinkSimple size={16} className="ms-auto text-gold" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Deployment options ── */}
      <section className={`py-20 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-5xl px-4">
          <h2 className={`mb-10 text-center text-2xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {isRTL ? "خيارات النشر" : "Deployment Options"}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { title: isRTL ? "السحابة" : "Cloud", icon: Globe, desc: isRTL ? "استضافة آمنة على بنيتنا السحابية في المنطقة السعودية مع SLA 99.9٪" : "Secure hosting on our Saudi-region cloud with 99.9% SLA", tag: isRTL ? "الأسرع للتشغيل" : "Fastest to deploy" },
              { title: isRTL ? "خاص (On-Premise)" : "Private (On-Premise)", icon: Database, desc: isRTL ? "تثبيت كامل داخل بنيتكم التحتية لأقصى درجات التحكم والخصوصية" : "Full installation in your infrastructure for maximum control and privacy", tag: isRTL ? "أقصى خصوصية" : "Maximum privacy" },
              { title: isRTL ? "هجين" : "Hybrid", icon: LinkSimple, desc: isRTL ? "بيانات حساسة على خوادمكم وأعباء العمل العامة في السحابة" : "Sensitive data on your servers, general workloads in the cloud", tag: isRTL ? "مرونة مثلى" : "Optimal flexibility" },
            ].map((opt, i) => (
              <div key={i} className={`rounded-2xl border p-6 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-200 bg-white"}`}>
                <div className="mb-4 flex items-center justify-between">
                  <div className={`inline-flex rounded-xl p-3 ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                    <opt.icon size={22} weight="bold" className="text-royal" />
                  </div>
                  <span className="rounded-full bg-royal/10 px-3 py-1 text-xs font-medium text-royal">{opt.tag}</span>
                </div>
                <h3 className={`text-lg font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{opt.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>{opt.desc}</p>
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
      <section className="bg-gradient-to-br from-[#06101a] to-[#0d1f3c] py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <Buildings size={48} className="mx-auto mb-4 text-gold" />
          <h2 className="text-3xl font-bold text-white">
            {isRTL ? "هل مؤسستك جاهزة للتحول الرقمي القانوني؟" : "Is Your Firm Ready for Legal Digital Transformation?"}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70">
            {isRTL ? "فريق متخصص سيتولى التطبيق الكامل وتدريب فريقكم. تواصل معنا لعرض مخصص." : "Our specialized team will handle full implementation and train your team. Contact us for a custom proposal."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-gold px-8 py-4 font-semibold text-royal transition hover:bg-gold/90">
              {isRTL ? "طلب عرض تجريبي" : "Request a Demo"}
              <Arrow size={18} />
            </Link>
            <a href="tel:+966555979607" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-semibold text-white backdrop-blur transition hover:bg-white/20">
              {isRTL ? "اتصل بفريق المبيعات" : "Call Sales Team"}
            </a>
          </div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
