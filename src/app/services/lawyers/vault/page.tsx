"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Vault, FileText, MagnifyingGlass, Check,
  ArrowLeft, Warning, ShieldCheck, Sparkle,
  CloudArrowUp, CaretDown, Scales, Buildings,
  ChartBar, Table, Phone, Star, Lock, Export,
  Brain, Briefcase,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";

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

const MOCK_RESULTS = [
  { name: "عقد توريد IT", party: "شركة الأفق", value: "2M ﷼", expiry: "٢٠٢٥", coc: "⚠️ لا يوجد بند", risk: "🟠" },
  { name: "إيجار مقر رئيسي", party: "صندوق العقارات", value: "850K ﷼", expiry: "٢٠٢٦", coc: "✅ موجود", risk: "🟢" },
  { name: "خدمات تنظيف", party: "مؤسسة النظافة", value: "120K ﷼", expiry: "٢٠٢٥", coc: "❌", risk: "🔴" },
  { name: "عقد صيانة أنظمة", party: "تقنيات المستقبل", value: "450K ﷼", expiry: "٢٠٢٦", coc: "✅ موجود", risk: "🟢" },
  { name: "عقد تأمين طبي", party: "بوبا العربية", value: "380K ﷼", expiry: "٢٠٢٥", coc: "⚠️ جزئي", risk: "🟠" },
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
      <main className={`min-h-screen ${isDark ? "bg-[#080808]" : "bg-white"}`}>

        {/* Hero */}
        <section className="relative overflow-hidden pt-32 pb-20">
          <div className="pointer-events-none absolute inset-0">
            <motion.div animate={{ scale: [1, 1.06, 1], opacity: [0.1, 0.18, 0.1] }}
              transition={{ duration: 12, repeat: Infinity }}
              className="absolute -top-32 -right-40 w-[700px] h-[700px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(200,167,98,0.12) 0%, transparent 70%)" }} />
          </div>
          <div className="relative max-w-[1200px] mx-auto px-6 text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-royal/30 bg-royal/5 mb-6">
              <Lock size={14} className="text-royal" weight="duotone" />
              <span className="text-[12px] font-semibold text-royal">حصرياً للمحامين وشركات المحاماة</span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className={`text-4xl md:text-5xl font-extrabold tracking-tight mb-5 ${tp}`}>
              الخزنة القانونية
              <span className="block text-[#C8A762] mt-2">Legal Vault</span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className={`text-lg leading-relaxed max-w-2xl mx-auto mb-8 ${ts}`}>
              ارفع آلاف العقود والمستندات — AI يحلل كل واحد، يستخرج نقاط البيانات الرئيسية،
              ويصنّفها بالألوان: أحمر (خطر) · برتقالي (انتبه) · أخضر (سليم).
              <br />
              <strong className={tp}>ركّز فقط على ما يستحق انتباهك.</strong>
            </motion.p>

            <div className="flex flex-wrap justify-center gap-4">
              <motion.a href="/register" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-[#0B3D2E] text-white font-bold shadow-[0_8px_24px_-8px_rgba(11,61,46,0.5)]">
                أنشئ مشروع Vault <ArrowLeft size={16} weight="bold" />
              </motion.a>
            </div>

            {/* Capacity badge */}
            <div className="flex justify-center mt-8">
              <div className={`flex items-center gap-6 px-6 py-3 rounded-2xl border ${border} ${cardBg}`}>
                {[
                  { v: "٥,٠٠٠", l: "مستند / مشروع" },
                  { v: "١٢+", l: "نقطة بيانات / عقد" },
                  { v: "٨٠٪+", l: "توفير في الوقت" },
                ].map((s, i) => (
                  <div key={i} className={`text-center ${i > 0 ? `border-r pr-6 ${isDark ? "border-white/[0.08]" : "border-slate-200"}` : ""}`}>
                    <p className="text-lg font-extrabold text-royal">{s.v}</p>
                    <p className={`text-[10px] ${ts}`}>{s.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Project Types */}
        <section className="py-16">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-[#C8A762]">أنواع المشاريع</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>اختر نوع المشروع وارفع الملفات</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {PROJECT_TYPES.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                    whileHover={{ y: -3 }}
                    className={`rounded-[1.5rem] border p-6 cursor-pointer transition-all hover:border-royal/40 ${border} ${cardBg}`}>
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
              <span className="text-sm font-medium text-[#C8A762]">ما يُستخرج تلقائياً</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>١٢ نقطة بيانات من كل عقد</h2>
              <p className={`text-[14px] mt-2 ${ts}`}>بنقرة واحدة — بدون قراءة يدوية</p>
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

        {/* Sample Results Table */}
        <section className="py-16">
          <div className="max-w-[1100px] mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className={`text-2xl font-bold ${tp}`}>هكذا تبدو نتائج التحليل</h2>
              <p className={`text-[14px] mt-2 ${ts}`}>جدول تفاعلي قابل للفرز والتصفية والتصدير</p>
            </div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className={`rounded-[1.5rem] border overflow-hidden ${border} ${cardBg}`}>
              <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <div className="flex items-center gap-2">
                  <Table size={16} className="text-royal" />
                  <span className={`text-[13px] font-bold ${tp}`}>مشروع: Due Diligence — شركة المستقبل التقني</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                    ٣٤٧ عقداً
                  </span>
                </div>
                <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                  <Export size={12} /> تصدير Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className={`border-b ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-400"}`}>
                      {["العقد", "الطرف الآخر", "القيمة", "الانتهاء", "Change-of-Control", "المخاطر"].map(h => (
                        <th key={h} className="text-right py-3 px-4 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_RESULTS.map((r, i) => (
                      <motion.tr key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                        transition={{ delay: i * 0.06 }}
                        className={`border-b last:border-0 ${isDark ? "border-white/[0.04] hover:bg-white/[0.02]" : "border-slate-50 hover:bg-slate-50/50"}`}>
                        <td className={`py-3 px-4 font-medium ${tp}`}>{r.name}</td>
                        <td className={`py-3 px-4 ${ts}`}>{r.party}</td>
                        <td className={`py-3 px-4 font-mono font-semibold ${tp}`}>{r.value}</td>
                        <td className={`py-3 px-4 ${ts}`}>{r.expiry}</td>
                        <td className="py-3 px-4">{r.coc}</td>
                        <td className="py-3 px-4 text-center text-lg">{r.risk}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Color legend */}
              <div className={`p-3 border-t flex items-center gap-4 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                {[
                  { color: "🟢", label: "سليم — لا إجراء مطلوب" },
                  { color: "🟠", label: "يحتاج انتباه — راجع البنود" },
                  { color: "🔴", label: "خطر — إجراء فوري مطلوب" },
                ].map((l, i) => (
                  <span key={i} className={`text-[10px] ${ts}`}>{l.color} {l.label}</span>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Natural language query */}
        <section className="py-16">
          <div className="max-w-[800px] mx-auto px-6 text-center">
            <h2 className={`text-2xl font-bold mb-4 ${tp}`}>اسأل بالعربي — عن كل عقودك</h2>
            <p className={`text-[14px] mb-8 ${ts}`}>بدلاً من قراءة ٣٤٧ عقداً — اسأل مباشرة</p>
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

        {/* CTA */}
        <section className="py-16 pb-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="rounded-[2.5rem] bg-gradient-to-br from-[#0B3D2E] to-[#0a3328] p-10 md:p-16 text-center shadow-[0_20px_60px_-15px_rgba(11,61,46,0.5)]">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Due Diligence بسرعة AI</h2>
              <p className="text-white/60 text-sm max-w-md mx-auto mb-8">
                ما كان يستغرق أسابيع — الآن في ساعات. حلّل آلاف العقود بنقرة واحدة.
              </p>
              <motion.a href="/register" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#C8A762] text-[#0B3D2E] font-bold text-sm">
                ابدأ مشروع Vault <ArrowLeft size={16} weight="bold" />
              </motion.a>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
