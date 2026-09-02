"use client";

import { motion } from "framer-motion";
import {
  FileText, Check, ArrowLeft, Warning,
  ShieldCheck, Scales, Buildings, Brain, Lock,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";

/**
 * ⚠️ THE ONE RULE FOR THIS FILE — الخزنة القانونية IS NOT BUILT.
 *
 * The sidebar has carried a «قريباً» badge on this route in two places
 * (navigation.sidebars.legal.ts:145 and :370) since the owner deferred the
 * product. This page went on contradicting that badge:
 *
 *   • `MOCK_RESULTS` — five invented contracts rendered in a live-looking
 *     analysis table, with invented counterparties and values («عقد توريد IT ·
 *     شركة الأفق · 2M ﷼»), under a header naming an invented client project
 *     («مشروع: Due Diligence — شركة المستقبل التقني») and an invented volume
 *     («٣٤٧ عقداً»). A visitor could not tell that from a screenshot of a real
 *     account, because it was built to be indistinguishable from one.
 *   • «٨٠٪+ توفير في الوقت» — a measured-sounding performance figure for a
 *     system that has never processed a document. Nothing was measured.
 *   • «٥,٠٠٠ مستند / مشروع» and «١٢+ نقطة بيانات / عقد» — capacity specs for
 *     an engine that does not exist.
 *   • Two «ابدأ مشروع Vault» / «أنشئ مشروع Vault» CTAs → `/register`, selling
 *     a deferred product.
 *   • Present tense throughout: «AI يحلل كل واحد», «ما كان يستغرق أسابيع —
 *     الآن في ساعات». No model is wired to any AI surface in this product.
 *
 * What remains below is scope, stated as scope: the kinds of project the vault
 * is INTENDED to serve, the data points it is INTENDED to extract, and example
 * questions it is INTENDED to answer. Nothing here reports a result, a
 * measurement or a capacity.
 *
 * If you are adding to this page: do not put a number on it unless you can
 * name the query that produced it, and do not add a CTA until the product
 * exists to be started.
 */

const PROJECT_TYPES = [
  { icon: Buildings, label: "Due Diligence — اندماج واستحواذ", desc: "فحص شامل لعقود الشركة المُستحوذ عليها", tag: "M&A" },
  { icon: FileText, label: "فحص عقود شامل", desc: "مراجعة جماعية لعقود عميل — كشف المخاطر والفرص", tag: "عقود" },
  { icon: ShieldCheck, label: "تدقيق امتثال", desc: "مطابقة المستندات مع الأنظمة واللوائح المعمول بها", tag: "امتثال" },
  { icon: Scales, label: "ملف قضية معقدة", desc: "تحليل مئات الوثائق لملف قضية متشعب", tag: "قضائي" },
];

const DATA_POINTS = [
  "أطراف العقد", "نوع العقد والقيمة", "تاريخ البدء والانتهاء",
  "بنود التجديد التلقائي", "بنود الإنهاء المبكر والغرامات",
  "بنود عدم المنافسة والسرية", "الاختصاص القضائي",
  "بنود Change-of-Control", "الالتزامات المالية المستقبلية",
  "التأمينات والكفالات", "حقوق الملكية الفكرية", "المخاطر المكتشفة",
];

export default function LegalVaultPage() {
  const { isDark } = useTheme();
  const tp = isDark ? "text-white" : "text-slate-900";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200/70";
  const cardBg = isDark ? "bg-zinc-900" : "bg-white";

  return (
    <>
      <Navbar />
      <div className={`min-h-screen ${isDark ? "bg-[#080808]" : "bg-white"}`}>

        {/* Hero */}
        <section className="relative overflow-hidden pt-32 pb-16">
          <div className="pointer-events-none absolute inset-0">
            <motion.div animate={{ scale: [1, 1.06, 1], opacity: [0.1, 0.18, 0.1] }}
              transition={{ duration: 12, repeat: Infinity }}
              className="absolute -top-32 -right-40 w-[700px] h-[700px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(200,167,98,0.12) 0%, transparent 70%)" }} />
          </div>
          <div className="relative max-w-[1200px] mx-auto px-6 text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="inline-flex flex-wrap justify-center items-center gap-2 mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-amber-400/40 bg-amber-400/10">
                <Warning size={14} className="text-[#C8A762]" weight="fill" />
                <span className="text-[12px] font-bold text-[#C8A762]">قريباً — غير متاحة حالياً</span>
              </span>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-royal/30 bg-royal/5">
                <Lock size={14} className="text-royal" weight="duotone" />
                <span className="text-[12px] font-semibold text-royal">مُخطَّطة للمحامين وشركات المحاماة</span>
              </span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className={`text-4xl md:text-5xl font-extrabold tracking-tight mb-5 ${tp}`}>
              الخزنة القانونية
              <span className="block text-[#C8A762] mt-2">Legal Vault</span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className={`text-lg leading-relaxed max-w-2xl mx-auto mb-8 ${ts}`}>
              خدمة مُخطَّطة لرفع دفعات كبيرة من العقود والمستندات، واستخراج نقاط البيانات
              الرئيسية من كل مستند، وتصنيفها حسب درجة الخطورة — حتى يذهب انتباه المحامي
              إلى ما يستحقه فقط.
            </motion.p>

            {/* الإفصاح — يسبق كل وصف على هذه الصفحة */}
            <div className={`max-w-2xl mx-auto rounded-2xl border p-5 text-start ${isDark ? "border-amber-500/25 bg-amber-500/[0.06]" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-start gap-3">
                <Warning size={18} weight="fill" className="text-[#C8A762] flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className={`text-[14px] font-bold ${tp}`}>هذه الصفحة تعريف بخدمة لم تُطلَق بعد</p>
                  <p className={`text-[13px] leading-relaxed ${ts}`}>
                    لا توجد خزنة قابلة للاستخدام اليوم: لا يمكن إنشاء مشروع، ولا رفع مستندات،
                    ولا تشغيل أي تحليل. ما يلي وصف <strong className={tp}>للنطاق المخطَّط</strong> —
                    وليس نتائج، ولا أرقام أداء، ولا سعة مقيسة. وسيبقى هذا الإفصاح قائماً
                    إلى أن تُبنى الخدمة فعلياً.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Project Types */}
        <section className="py-16">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-[#C8A762]">النطاق المخطَّط</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>أنواع المشاريع التي تستهدفها الخدمة</h2>
              <p className={`text-[13px] mt-2 ${ts}`}>وصف للاتجاه المقصود — لا يوجد ما يُنشَأ اليوم</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {PROJECT_TYPES.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                    className={`rounded-[1.5rem] border p-6 ${border} ${cardBg}`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isDark ? "bg-royal/15" : "bg-royal/8"}`}>
                        <Icon size={22} weight="duotone" className="text-royal" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-bold text-[14px] ${tp}`}>{p.label}</h3>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-[#C8A762]/10 text-[#C8A762] border border-[#C8A762]/20" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>{p.tag}</span>
                        </div>
                        <p className={`text-[12px] ${ts}`}>{p.desc}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Data Points */}
        <section className="py-16 md:py-24">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="text-center mb-10">
              <span className="text-sm font-medium text-[#C8A762]">قائمة الاستخراج المخطَّطة</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>نقاط البيانات المستهدفة من كل عقد</h2>
              <p className={`text-[14px] mt-2 ${ts}`}>هذه قائمة نيّة، لا قدرة قائمة — لم يُنفَّذ الاستخراج بعد</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {DATA_POINTS.map((dp, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.04 }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${border} ${cardBg}`}>
                  <Check size={12} weight="bold" className="text-royal shrink-0" />
                  <span className={`text-[12px] ${tp}`}>{dp}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/*
          The «هكذا تبدو نتائج التحليل» table stood here and is deleted, not
          replaced. There is no analysis, so there is no shape for its results
          to take; a placeholder table with zeroes or dashes would be the same
          claim in a quieter voice. When the engine exists it can render its
          own output.
        */}

        {/* Natural language query — stated as intent */}
        <section className="py-16">
          <div className="max-w-[800px] mx-auto px-6 text-center">
            <span className="text-sm font-medium text-[#C8A762]">من النطاق المخطَّط</span>
            <h2 className={`text-2xl font-bold mt-2 mb-3 ${tp}`}>السؤال بالعربية عن مجموعة العقود</h2>
            <p className={`text-[14px] mb-8 ${ts}`}>
              أمثلة على نوع الأسئلة التي تهدف الخدمة للإجابة عنها — وهي أمثلة توضيحية، لا واجهة عاملة
            </p>
            <div className="space-y-3 text-right max-w-xl mx-auto">
              {[
                "\"اعرض كل العقود التي ليس فيها بند تحكيم\"",
                "\"ما العقود التي تنتهي خلال ٩٠ يوم ولا تتجدد تلقائياً؟\"",
                "\"ابحث عن بنود change-of-control في كل عقود التوريد\"",
                "\"كم إجمالي الالتزامات المالية للسنة القادمة؟\"",
              ].map((q, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${border} ${cardBg}`}>
                  <Brain size={16} className="text-[#C8A762] shrink-0" weight="duotone" />
                  <span className={`text-[13px] ${tp}`}>{q}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/*
          Closing block. The two «ابدأ مشروع Vault» → /register CTAs are gone
          and nothing sells in their place — not even a waitlist button, which
          would collect an intent this product has nowhere to store. The only
          link is plain navigation back to a page that exists.
        */}
        <section className="py-16 pb-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className={`rounded-[2.5rem] border p-10 md:p-14 text-center ${border} ${cardBg}`}>
              <h2 className={`text-2xl md:text-3xl font-bold mb-4 ${tp}`}>الخدمة مؤجَّلة، ولا موعد إطلاق مُعلَن</h2>
              <p className={`text-[14px] leading-relaxed max-w-lg mx-auto mb-8 ${ts}`}>
                لا يوجد اليوم ما يُشترَك فيه أو يُبدَأ. أُبقيت هذه الصفحة لأنها تصف الاتجاه بصدق،
                وستتغيّر عندما يصبح هناك منتج فعلي يُوصَف.
              </p>
              <a href="/services/lawyers"
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-2xl border text-sm font-semibold ${isDark ? "border-white/[0.1] text-zinc-300" : "border-slate-200 text-slate-600"}`}>
                خدمات المحامين المتاحة الآن <ArrowLeft size={16} weight="bold" />
              </a>
            </motion.div>
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
}
