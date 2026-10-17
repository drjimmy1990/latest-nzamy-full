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
  Headset,
  WhatsappLogo,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Data ────────────────────────────────────────────────────────────────────

const modules = {
  ar: [
    { icon: FileText, title: "إدارة القضايا", desc: "متابعة شاملة لجميع القضايا من الإيداع حتى الإغلاق مع تتبع المواعيد والجلسات والمستندات.", color: "bg-royal/10 text-royal" },
    { icon: Users, title: "إدارة الموارد البشرية", desc: "إدارة المحامين والمساعدين والإداريين مع تتبع الأداء وتوزيع العمل وإدارة الإجازات.", color: "bg-blue-500/10 text-blue-600" },
    { icon: ChartBar, title: "المالية والفوترة", desc: "نظام محاسبي متكامل لإدارة الأتعاب، الفواتير، المصروفات، والتقارير المالية.", color: "bg-emerald-500/10 text-emerald-600" },
    { icon: Brain, title: "ذكاء اصطناعي مؤسسي", desc: "محرك AI مخصص لمؤسستك مدرَّب على قضاياكم وعقودكم وسوابقكم القانونية.", color: "bg-violet-500/10 text-violet-600" },
    { icon: Database, title: "إدارة المستندات", desc: "مستودع ذكي للمستندات مع بحث AI وتصنيف تلقائي وإدارة الإصدارات.", color: "bg-orange-500/10 text-orange-600" },
    { icon: ChartLineUp, title: "التقارير والتحليلات", desc: "لوحات بيانات تفاعلية وتقارير تفصيلية عن أداء المكتب والإيرادات والقضايا.", color: "bg-pink-500/10 text-pink-600" },
    { icon: Globe, title: "البوابة الرقمية للموكلين", desc: "منصة مخصصة لموكليك لتتابع قضاياهم ومستنداتهم والتواصل مع فريقكم.", color: "bg-cyan-500/10 text-cyan-600" },
    { icon: Gear, title: "التكاملات والـ API", desc: "قيد التطوير: تكاملات مخطط لها مع منظومة وزارة العدل (ناجز) وهيئة المحامين وأنظمتكم الداخلية، ولم يُفعَّل أيٌّ منها بعد.", color: "bg-amber-500/10 text-amber-600" },
  ],
  en: [
    { icon: FileText, title: "Case Management", desc: "Full case tracking from filing to closure with deadlines, hearings, and document management.", color: "bg-royal/10 text-royal" },
    { icon: Users, title: "HR Management", desc: "Manage lawyers, paralegals, and admins with performance tracking, workload distribution, and leave management.", color: "bg-blue-500/10 text-blue-600" },
    { icon: ChartBar, title: "Finance & Billing", desc: "Integrated accounting for fees, invoicing, expenses, and financial reports.", color: "bg-emerald-500/10 text-emerald-600" },
    { icon: Brain, title: "Enterprise AI", desc: "Custom AI engine trained on your firm's cases, contracts, and legal precedents.", color: "bg-violet-500/10 text-violet-600" },
    { icon: Database, title: "Document Management", desc: "Smart document repository with AI search, auto-classification, and version control.", color: "bg-orange-500/10 text-orange-600" },
    { icon: ChartLineUp, title: "Reports & Analytics", desc: "Interactive dashboards and detailed reports on firm performance, revenue, and cases.", color: "bg-pink-500/10 text-pink-600" },
    { icon: Globe, title: "Client Portal", desc: "Dedicated platform for your clients to track cases, documents, and communicate with your team.", color: "bg-cyan-500/10 text-cyan-600" },
    { icon: Gear, title: "Integrations & API", desc: "In development: planned integrations with the Ministry of Justice (Najiz), the Bar Association and your internal systems. None is live yet.", color: "bg-amber-500/10 text-amber-600" },
  ],
};

const faqs = [
  // Owner answer ١٩٦ (2026-10-16): no estimated duration and no on-premise /
  // hybrid option — Nezamy is a cloud platform (Enterprise SaaS).
  { q: { ar: "كم من الوقت يستغرق التطبيق؟", en: "How long does implementation take?" }, a: { ar: "يعتمد على حجم المؤسسة واحتياجاتها؛ نتفق معكم على خطة الإعداد وجدولها بعد التعرّف على متطلباتكم.", en: "It depends on the firm's size and needs; we agree the setup plan and its schedule with you once we know your requirements." } },
  { q: { ar: "هل يمكن الاستضافة داخل المؤسسة (On-Premise)؟", en: "Is on-premise hosting available?" }, a: { ar: "لا. نظامي منصة سحابية، ولا يُثبَّت داخل بنية المنشأة ولا بنموذج هجين.", en: "No. Nezamy is a cloud platform; it is not installed in your infrastructure or in a hybrid model." } },
  { q: { ar: "هل يلتزم نظامي ERP بأنظمة هيئة الزكاة والضريبة؟", en: "Is Nezamy ERP compliant with ZATCA regulations?" }, a: { ar: "ليس بعد. الفوترة الإلكترونية وفق متطلبات هيئة الزكاة والضريبة والجمارك (المرحلة الثانية) قيد التطوير، ولا يُصدر النظام حالياً فواتير إلكترونية بصيغتها.", en: "Not yet. E-invoicing to ZATCA Phase 2 requirements is in development; the system does not issue ZATCA e-invoices today." } },
  // Same 24/7 claim as the removed hero badge — and a «SLA مضمون» on top of it.
  // Support hours are أحد–خميس ٨ص–١٠م / الجمعة–السبت ٩ص–٥م (contact page), and
  // no service-level agreement is published anywhere to be guaranteed.
  { q: { ar: "هل يوجد دعم فني مخصص؟", en: "Is there dedicated technical support?" }, a: { ar: "نعم، يحصل كل عميل ERP على مدير حساب مخصص. أوقات الدعم: أحد – خميس ٨ص – ١٠م، والجمعة والسبت ٩ص – ٥م.", en: "Yes, every ERP client gets a dedicated account manager. Support hours are Sun – Thu 8am – 10pm, and Fri – Sat 9am – 5pm." } },
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
            {/* Removed: «ISO 27001 معتمد / ISO 27001 Certified» — the company
                holds no such certification, and asserting an accreditation body
                has certified you is not an exaggeration but a fabricated
                credential. Also removed: «دعم ٢٤/٧ / 24/7 Support» — contact
                page (src/app/contact/page.tsx:152) states the real hours as
                أحد–خميس ٨ص–١٠م and الجمعة–السبت ٩ص–٥م, which is not 24/7. The
                support badge now states those hours instead.
                Also removed: «متكامل مع ناجز / Najiz Integrated» — nothing in the
                codebase talks to Najiz, the Bar Association, ZATCA or the Ministry
                of Commerce; the integration section below now says «قيد التطوير». */}
            {[
              { icon: ShieldCheck, label: isRTL ? "نلتزم بنظام حماية البيانات الشخصية" : "We abide by the PDPL" },
              { icon: Headset, label: isRTL ? "دعم أحد–خميس ٨ص–١٠م" : "Support Sun–Thu 8am–10pm" },
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
                {isRTL ? "تكاملات مخطط لها مع المنظومة القضائية السعودية" : "Planned Integrations with the Saudi Judicial Ecosystem"}
              </h2>
              <p className={`mt-4 text-lg ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                {isRTL
                  ? "هذه التكاملات قيد التطوير ولم يُفعَّل أيٌّ منها بعد. الهدف أن يتصل نظامي ERP بالمنصات الحكومية مباشرةً فيقلّ العمل اليدوي على فريقكم."
                  : "These integrations are in development and none is live yet. The goal is for Nezamy ERP to connect to government platforms directly, cutting manual work for your team."}
              </p>
              <ul className="mt-6 space-y-4">
                {[
                  isRTL ? "بوابة ناجز — استيراد الجلسات والأحكام (مخطَّط)" : "Najiz Portal — importing hearings and rulings (planned)",
                  isRTL ? "هيئة المحامين — التحقق من الترخيص (مخطَّط)" : "Bar Association — license verification (planned)",
                  isRTL ? "ZATCA — الفوترة الإلكترونية (مخطَّط)" : "ZATCA — e-invoicing (planned)",
                  isRTL ? "وزارة التجارة — التحقق من السجلات التجارية (مخطَّط)" : "Ministry of Commerce — commercial registration verification (planned)",
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
                        {isRTL ? "قيد التطوير" : "In development"}
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
            {isRTL ? "الاستضافة" : "Hosting"}
          </h2>
          {/* Owner answer ١٩٦: cloud only — the «خاص (On-Premise)» and «هجين»
              cards promised installations Nezamy does not offer. */}
          <div className="mx-auto grid max-w-md gap-6">
            {[
              { title: isRTL ? "السحابة" : "Cloud", icon: Globe, desc: isRTL ? "استضافة آمنة على بنيتنا السحابية في المنطقة السعودية" : "Secure hosting on our Saudi-region cloud", tag: isRTL ? "منصة سحابية" : "Cloud platform" },
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
            <a href="https://wa.me/966560655552" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-semibold text-white backdrop-blur transition hover:bg-white/20">
              <WhatsappLogo size={18} weight="fill" />
              {isRTL ? "تواصل مع فريق المبيعات عبر واتساب" : "Message Sales on WhatsApp"}
            </a>
          </div>
        </div>
      </section>

      <Footer />
          </div>
  );
}
