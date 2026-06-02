"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  MagnifyingGlass, FileText, ShieldCheck, ChartBar,
  ArrowLeft, Check, CloudArrowUp, GoogleDriveLogo,
  Bell, Warning, CheckCircle, Clock, Buildings,
  Scales, Sparkle, ArrowsClockwise, TrendUp,
  Clipboard, Phone, Star, Lock,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";

const AUDIT_CATEGORIES = [
  { icon: FileText, label: "العقود التجارية", example: "توريد، خدمات، شراكة", count: "38" },
  { icon: Scales,   label: "العقود العمالية", example: "عقود عمل، مخالصات", count: "12" },
  { icon: Buildings,label: "التراخيص والرخص", example: "سجل تجاري، بلدي، دفاع مدني", count: "8" },
  { icon: TrendUp,  label: "المستندات المالية", example: "ميزانية، إقرارات زكوية", count: "15" },
  { icon: ShieldCheck, label: "المستندات الحكومية", example: "خطابات، قرارات، إشعارات", count: "6" },
  { icon: Lock,     label: "الملكية الفكرية", example: "علامات تجارية، سجلات صناعية", count: "3" },
];

const STEPS = [
  { num: "①", title: "ارفع وثائقك", desc: "اسحب الملفات مباشرة أو شارك رابط Google Drive — لا ترتيب مطلوب", icon: CloudArrowUp },
  { num: "②", title: "التصنيف الذكي", desc: "AI يقرأ كل وثيقة ويصنّفها: عقود، تراخيص، مالية، موظفين...", icon: MagnifyingGlass },
  { num: "③", title: "التحليل العميق", desc: "فحص كل عقد: ساري؟ منتهي؟ بنود خطرة؟ ينقصك شيء؟", icon: ChartBar },
  { num: "④", title: "الداشبورد الحي", desc: "لوحة تحكم تفاعلية ترى فيها وضعك القانوني الكامل مرة واحدة", icon: Clipboard },
  { num: "⑤", title: "المراقبة المستمرة", desc: "تنبيهات واتساب عند اقتراب انتهاء عقد أو رخصة أو تغير نظام", icon: Bell },
  { num: "⑥", title: "فحص التعارض", desc: "قبل أي عقد جديد — فحص تلقائي ضد قاعدة بيانات شركتك", icon: ArrowsClockwise },
];

// Tiered pricing: standalone vs subscriber
const TIERS = [
  { docs: "حتى ٥٠ وثيقة", standalone: "٤,٩٩٩", subscriber: "٢,٩٩٩", tag: "شركات صغيرة" },
  { docs: "٥١ — ٢٠٠ وثيقة", standalone: "٩,٩٩٩", subscriber: "٥,٩٩٩", tag: "شركات متوسطة" },
  { docs: "٢٠١ — ١,٠٠٠ وثيقة", standalone: "١٩,٩٩٩", subscriber: "١١,٩٩٩", tag: "شركات كبرى" },
  { docs: "١,٠٠١+ وثيقة", standalone: "تواصل معنا", subscriber: "تواصل معنا", tag: "مؤسسات" },
];

const ANNUAL_PLANS = [
  { name: "مراقبة سنوية", price: "٦,٩٩٩", sub: "ر.س / سنة", subPrice: "٣,٩٩٩", desc: "تجديد سنوي — مراقبة مستمرة بعد الفحص الأولي", features: ["تنبيهات واتساب قبل انتهاء العقود/الرخص", "تحديثات ربع سنوية تلقائية", "فحص تعارض العقود الجديدة", "داشبورد حي مُحدّث", "تقرير ربعي PDF"], highlight: true },
  { name: "إضافة وثائق", price: "١,٠٠٠", sub: "ر.س / ٥٠ وثيقة", subPrice: "٥٠٠", desc: "إضافة دفعة وثائق جديدة بعد الفحص الأولي", features: ["تصنيف وتحليل الوثائق المضافة", "دمجها في الداشبورد القائم", "تحديث النتيجة العامة", "تنبيهات تلقائية للجديد"], highlight: false },
  { name: "مؤسسي", price: "تواصل", sub: "معنا", subPrice: "—", desc: "وثائق غير محدودة + SLA + محامي مخصص", features: ["كل المميزات", "تكامل ERP داخلي", "محامي مخصص للمتابعة", "SLA واتفاقية أداء", "API مباشر"], highlight: false },
];

export default function HealthCheckPage() {
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
            <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.12, 0.22, 0.12] }}
              transition={{ duration: 10, repeat: Infinity }}
              className="absolute -top-40 -left-40 w-[800px] h-[800px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(11,61,46,0.18) 0%, transparent 70%)" }} />
          </div>
          <div className="relative max-w-[1200px] mx-auto px-6 text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#C8A762]/30 bg-[#C8A762]/5 mb-6">
              <MagnifyingGlass size={14} className="text-[#C8A762]" weight="duotone" />
              <span className="text-[12px] font-semibold text-[#C8A762]">خدمة حصرية — لا يوجد مثيل لها في السوق السعودي</span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className={`text-4xl md:text-5xl font-extrabold tracking-tight mb-5 ${tp}`}>
              الفحص القانوني الشامل
              <span className="block text-royal mt-2">٣٦٠°</span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className={`text-lg leading-relaxed max-w-2xl mx-auto mb-8 ${ts}`}>
              ارفع كل وثائق شركتك بدون ترتيب — ونظامي يصنّفها، يحللها، ويعطيك
              لوحة تحكم كاملة: عقودك، تراخيصك، ماليتك، وكل ما ينقصك.
            </motion.p>

            <div className="flex flex-wrap justify-center gap-4">
              <motion.a href="/dashboard/business/health-check" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-[#0B3D2E] text-white font-bold shadow-[0_8px_24px_-8px_rgba(11,61,46,0.5)]">
                ابدأ الفحص الآن <ArrowLeft size={16} weight="bold" />
              </motion.a>
              <a href="#how" className={`inline-flex items-center gap-2 px-6 py-4 rounded-2xl border font-medium text-sm ${border} ${ts}`}>
                كيف يعمل؟
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-14 max-w-3xl mx-auto">
              {[
                { v: "٥ دقائق", l: "وقت الرفع" },
                { v: "٨٢ نقطة", l: "يتم فحصها تلقائياً" },
                { v: "٩٣٪", l: "دقة التصنيف الذكي" },
                { v: "٢٤ ساعة", l: "لتسليم التقرير الكامل" },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
                  className={`rounded-2xl border p-5 text-center ${border} ${cardBg}`}>
                  <p className="text-2xl font-extrabold text-royal">{s.v}</p>
                  <p className={`text-[11px] mt-1 ${ts}`}>{s.l}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* What gets analyzed */}
        <section className="py-16">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-[#C8A762]">ماذا يُفحص؟</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>كل وثيقة في شركتك — مصنّفة ومحللة</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {AUDIT_CATEGORIES.map((c, i) => {
                const Icon = c.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ delay: i * 0.07 }}
                    className={`rounded-[1.5rem] border p-6 ${border} ${cardBg}`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-royal/15" : "bg-royal/8"}`}>
                        <Icon size={22} weight="duotone" className="text-royal" />
                      </div>
                      <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                        ~{c.count} وثيقة
                      </span>
                    </div>
                    <h3 className={`font-bold text-[15px] mb-1 ${tp}`}>{c.label}</h3>
                    <p className={`text-[12px] ${ts}`}>{c.example}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="py-16 md:py-24">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="text-center mb-14">
              <span className="text-sm font-medium text-[#C8A762]">كيف يعمل؟</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>٦ خطوات — من الفوضى إلى النظام</h2>
            </div>
            <div className="grid gap-6">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                    className={`flex items-start gap-5 p-6 rounded-[1.5rem] border ${border} ${cardBg}`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                      i === 0 ? "bg-royal text-white" : isDark ? "bg-white/[0.06]" : "bg-slate-100"
                    }`}>
                      <Icon size={24} weight="duotone" className={i === 0 ? "text-white" : "text-royal"} />
                    </div>
                    <div>
                      <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>{step.num} الخطوة {i + 1}</p>
                      <h3 className={`text-[16px] font-bold mb-1 ${tp}`}>{step.title}</h3>
                      <p className={`text-[13px] leading-relaxed ${ts}`}>{step.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Sample Dashboard Preview */}
        <section className="py-16">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className={`text-2xl font-bold ${tp}`}>هكذا يبدو وضعك القانوني</h2>
              <p className={`text-[14px] mt-2 ${ts}`}>لقطة من داشبورد الفحص الشامل ٣٦٠°</p>
            </div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className={`rounded-[2rem] border-2 p-8 ${isDark ? "border-royal/30 bg-zinc-900" : "border-royal/20 bg-white shadow-2xl"}`}>
              {/* Score */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className={`text-[12px] font-bold uppercase ${isDark ? "text-zinc-500" : "text-slate-400"}`}>النتيجة العامة</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-5xl font-extrabold text-royal font-mono">72</span>
                    <span className={`text-lg ${ts}`}>/ 100</span>
                  </div>
                </div>
                <div className={`rounded-2xl border p-4 text-center ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
                  <Warning size={20} className="text-amber-500 mx-auto mb-1" weight="fill" />
                  <p className="text-[11px] font-bold text-amber-500">يحتاج تحسين</p>
                </div>
              </div>
              {/* Bars */}
              <div className="space-y-3">
                {[
                  { label: "العقود", pct: 85, color: "bg-emerald-500", count: "٣٢/٣٨ سارية" },
                  { label: "التراخيص", pct: 62, color: "bg-amber-500", count: "٥/٨ سارية" },
                  { label: "الامتثال المالي", pct: 78, color: "bg-blue-500", count: "ناقص إقرار ٢٠٢٥" },
                  { label: "الموظفين والعمالة", pct: 93, color: "bg-emerald-500", count: "١٤/١٥ مُسجّل" },
                  { label: "الملكية الفكرية", pct: 45, color: "bg-red-500", count: "علامة غير مسجّلة" },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`w-32 text-[12px] shrink-0 ${tp}`}>{b.label}</span>
                    <div className={`flex-1 h-6 rounded-xl overflow-hidden ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
                      <motion.div initial={{ width: 0 }} whileInView={{ width: `${b.pct}%` }} viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.3 + i * 0.12 }}
                        className={`h-full rounded-xl ${b.color} flex items-center justify-end pe-2`}>
                        <span className="text-[10px] font-bold text-white">{b.pct}٪</span>
                      </motion.div>
                    </div>
                    <span className={`w-32 text-[11px] shrink-0 text-end ${ts}`}>{b.count}</span>
                  </div>
                ))}
              </div>
              {/* Alerts */}
              <div className="grid grid-cols-3 gap-3 mt-6">
                {[
                  { label: "🔴 عاجل", val: "٥", sub: "بنود" },
                  { label: "⚠️ متابعة", val: "٨", sub: "بنود" },
                  { label: "✅ ممتاز", val: "٦٦", sub: "بند" },
                ].map((a, i) => (
                  <div key={i} className={`rounded-xl p-3 text-center border ${border} ${cardBg}`}>
                    <p className="text-[11px] mb-1">{a.label}</p>
                    <p className={`text-2xl font-bold font-mono ${tp}`}>{a.val}</p>
                    <p className={`text-[10px] ${ts}`}>{a.sub}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Pricing — Tiered */}
        <section className="py-16 md:py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-[#C8A762]">التسعير</span>
              <h2 className={`text-3xl font-bold mt-2 ${tp}`}>الفحص الأولي — حسب حجم وثائقك</h2>
              <p className={`text-[14px] mt-2 ${ts}`}>المشتركون في باقات نظامي للشركات يحصلون على خصم يصل إلى ٤٠٪</p>
            </div>

            {/* Tiers Table */}
            <div className="max-w-3xl mx-auto mb-16">
              <div className={`rounded-[1.5rem] border overflow-hidden ${border} ${cardBg}`}>
                <div className={`grid grid-cols-4 gap-0 text-[12px] font-bold p-4 border-b ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-100 text-slate-400"}`}>
                  <span>عدد الوثائق</span>
                  <span className="text-center">بدون باقة</span>
                  <span className="text-center text-[#C8A762]">مشترك في باقة ⭐</span>
                  <span className="text-center">الفئة</span>
                </div>
                {TIERS.map((t, i) => (
                  <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className={`grid grid-cols-4 gap-0 items-center p-4 border-b last:border-0 ${isDark ? "border-white/[0.04]" : "border-slate-50"}`}>
                    <span className={`text-[13px] font-medium ${tp}`}>{t.docs}</span>
                    <span className={`text-center text-[14px] font-bold font-mono ${tp}`}>{t.standalone} <span className={`text-[10px] font-normal ${ts}`}>﷼</span></span>
                    <span className="text-center text-[14px] font-bold font-mono text-[#C8A762]">{t.subscriber} <span className="text-[10px] font-normal text-[#C8A762]/60">﷼</span></span>
                    <span className={`text-center text-[10px] px-2 py-0.5 rounded-full mx-auto ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>{t.tag}</span>
                  </motion.div>
                ))}
              </div>
              <p className={`text-[11px] mt-3 text-center ${ts}`}>
                * الفحص الأولي لمرة واحدة — يشمل: تصنيف ذكي + تقرير مخاطر + جرد تراخيص + ملخص مالي + تقرير PDF
              </p>
            </div>

            {/* Annual / Add-ons */}
            <div className="text-center mb-10">
              <h3 className={`text-2xl font-bold ${tp}`}>المراقبة والتجديد السنوي</h3>
              <p className={`text-[14px] mt-2 ${ts}`}>بعد الفحص الأولي — ابقَ على اطلاع دائم</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
              {ANNUAL_PLANS.map((plan, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.1, type: "spring", stiffness: 80 }}
                  whileHover={{ y: -4 }}
                  className={`relative rounded-[1.75rem] border p-6 transition-all ${
                    plan.highlight
                      ? "bg-[#0B3D2E] border-[#0B3D2E] shadow-[0_20px_40px_-10px_rgba(11,61,46,0.4)]"
                      : `${cardBg} ${border}`
                  }`}>
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 bg-[#C8A762] text-[#0B3D2E] rounded-full text-[10px] font-bold">
                      <Sparkle size={10} weight="fill" /> الأكثر طلباً
                    </div>
                  )}
                  <h3 className={`text-[15px] font-bold mb-1 ${plan.highlight ? "text-white" : tp}`}>{plan.name}</h3>
                  <p className={`text-[12px] mb-4 ${plan.highlight ? "text-white/60" : ts}`}>{plan.desc}</p>
                  
                  {/* Dual pricing */}
                  <div className="mb-2">
                    <p className={`text-[10px] mb-1 ${plan.highlight ? "text-white/40" : ts}`}>بدون باقة:</p>
                    <span className={`text-2xl font-extrabold ${plan.highlight ? "text-white" : tp}`}>{plan.price}</span>
                    <span className={`text-[11px] ms-1 ${plan.highlight ? "text-white/50" : ts}`}>{plan.sub}</span>
                  </div>
                  <div className={`mb-5 px-3 py-2 rounded-xl ${plan.highlight ? "bg-[#C8A762]/10" : isDark ? "bg-royal/10" : "bg-royal/5"}`}>
                    <p className={`text-[10px] mb-0.5 ${plan.highlight ? "text-[#C8A762]/70" : "text-royal/60"}`}>مشتركو الباقات ⭐:</p>
                    <span className={`text-xl font-extrabold ${plan.highlight ? "text-[#C8A762]" : "text-royal"}`}>{plan.subPrice}</span>
                    <span className={`text-[10px] ms-1 ${plan.highlight ? "text-[#C8A762]/50" : "text-royal/50"}`}>{plan.sub}</span>
                  </div>
                  
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2">
                        <Check size={13} weight="bold" className={plan.highlight ? "text-[#C8A762] mt-0.5" : "text-royal mt-0.5"} />
                        <span className={`text-[12px] ${plan.highlight ? "text-white/80" : ts}`}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <motion.a href="/dashboard/business/health-check" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className={`w-full py-3 rounded-2xl text-[13px] font-bold flex items-center justify-center gap-2 ${
                      plan.highlight ? "bg-[#C8A762] text-[#0B3D2E]" : "bg-[#0B3D2E] text-white"
                    }`}>
                    ابدأ الآن <ArrowLeft size={14} weight="bold" />
                  </motion.a>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 pb-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="rounded-[2.5rem] bg-[#0B3D2E] p-10 md:p-16 text-center shadow-[0_20px_60px_-15px_rgba(11,61,46,0.5)]">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">لا تعرف وضعك القانوني الحقيقي؟</h2>
              <p className="text-white/60 text-sm max-w-md mx-auto mb-8">
                ٧٢٪ من الشركات السعودية تكتشف مخالفات أو عقود منتهية فقط عند التفتيش. لا تكن منهم.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <motion.a href="/dashboard/business/health-check" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#C8A762] text-[#0B3D2E] font-bold text-sm">
                  ابدأ الفحص مجاناً <ArrowLeft size={16} weight="bold" />
                </motion.a>
                <a href="/contact" className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl border border-white/30 text-white/80 font-medium text-sm">
                  <Phone size={15} /> تواصل مع مستشار
                </a>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
