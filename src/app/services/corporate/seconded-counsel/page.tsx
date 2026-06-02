"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, Check, Star, CalendarBlank, Buildings,
  Scales, Shield, FileText, Users, Phone, ChatCircleDots,
  ArrowLeft, Sparkle, Clock, Money, Trophy, Brain,
  GraduationCap, CheckCircle,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";

// ─── Data ──────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "lite",
    name: "لايت",
    nameEn: "Lite",
    hours: "٤ ساعات / شهر",
    price: "٣,٩٩٩",
    priceSub: "ر.س / شهرياً",
    desc: "مثالي للشركات الصغيرة التي تحتاج استشارات دورية.",
    highlight: false,
    features: [
      "٤ ساعات استشارة قانونية شهرياً",
      "مراجعة عقدَين كحد أقصى",
      "رد على استفسارات الامتثال",
      "تقرير شهري موجز",
      "وصول عبر واتساب ونظامي",
    ],
  },
  {
    id: "standard",
    name: "ستاندرد",
    nameEn: "Standard",
    hours: "يوم عمل أسبوعياً",
    price: "٧,٩٩٩",
    priceSub: "ر.س / شهرياً",
    desc: "للمنشآت المتوسطة التي تحتاج حضوراً قانونياً أسبوعياً.",
    highlight: true,
    features: [
      "يوم عمل كامل أسبوعياً (٤ أيام/شهر)",
      "مراجعة عقود غير محدودة",
      "حضور اجتماعات مجلس الإدارة",
      "إعداد الأنظمة الداخلية",
      "تمثيل أمام الجهات الحكومية",
      "تقارير امتثال ربع سنوية",
    ],
  },
  {
    id: "premium",
    name: "بريميوم",
    nameEn: "Premium",
    hours: "٣ أيام / أسبوع",
    price: "١٤,٩٩٩",
    priceSub: "ر.س / شهرياً",
    desc: "للشركات الكبرى التي تحتاج فريقاً قانونياً شبه متفرغ.",
    highlight: false,
    features: [
      "٣ أيام عمل أسبوعياً (١٢ يوم/شهر)",
      "فريق استشاري (محامٍ أول + مساعد)",
      "إدارة جميع العقود والنزاعات",
      "تدريب الفريق الداخلي",
      "خدمة طوارئ قانونية ٢٤/٧",
      "تمثيل قضائي شامل",
      "تقارير حوكمة شهرية",
    ],
  },
  {
    id: "fulltime",
    name: "معار متفرغ",
    nameEn: "Seconded Full-Time",
    hours: "دوام كامل",
    price: "حسب الاتفاق",
    priceSub: "شهرياً",
    desc: "محامٍ متفرغ تمامًا من مكتب محاماة شريك يعمل كمستشار قانوني داخلي.",
    highlight: false,
    features: [
      "دوام كامل داخل مقر شركتك",
      "إدارة القسم القانوني بالكامل",
      "تعيين وتدريب الفريق القانوني",
      "إسناد رسمي من مكتب شريك",
      "خبرة متخصصة حسب قطاعك",
      "كل مميزات الباقة بريميوم",
    ],
  },
];

const FEATURES = [
  { icon: Shield, label: "امتثال تنظيمي", desc: "مراجعة الامتثال مع هيئة السوق المالية، وزارة التجارة، وهيئة الزكاة" },
  { icon: FileText, label: "إدارة العقود", desc: "صياغة ومراجعة واعتماد جميع عقودك مع موردين وعملاء وموظفين" },
  { icon: Users, label: "تدريب الفريق", desc: "رفع الوعي القانوني لدى موظفيك وتقليل المخاطر من الداخل" },
  { icon: Buildings, label: "حضور المجالس", desc: "تمثيلك القانوني في اجتماعات مجلس الإدارة والجمعية العمومية" },
  { icon: Scales, label: "تسوية النزاعات", desc: "التدخل المبكر قبل التقاضي — توفير التكلفة والوقت" },
  { icon: GraduationCap, label: "حوكمة الشركات", desc: "بناء نظام الحوكمة الداخلي وفق المعايير السعودية والدولية" },
];

const TESTIMONIALS = [
  { name: "م. خالد الدوسري", role: "الرئيس التنفيذي — شركة تقنية", text: "وفّر علينا المستشار المنتدب أكثر من ٣٠٠,٠٠٠ ريال مقارنة بتوظيف محامٍ штатный. والأهم أن المشكلات القانونية تُحسم قبل أن تتضخم.", plan: "ستاندرد" },
  { name: "أ. نورة السبيعي", role: "مديرة مالية — مجموعة استثمارية", text: "لأول مرة نشعر أن لدينا قسماً قانونياً حقيقياً دون الحاجة لتعيين فريق كامل. الباقة البريميوم غيّرت مستوى ثقتنا القانونية.", plan: "بريميوم" },
];

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function SecondedCounselPage() {
  const { isDark } = useTheme();
  const [selected, setSelected] = useState<string | null>("standard");

  const textPrimary = isDark ? "text-white" : "text-slate-900";
  const textSecondary = isDark ? "text-zinc-400" : "text-slate-500";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200/70";
  const cardBg = isDark ? "bg-zinc-900" : "bg-white";

  return (
    <>
      <Navbar />
      <main className={`min-h-screen ${isDark ? "bg-[#080808]" : "bg-white"}`}>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden pt-32 pb-20">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div animate={{ scale: [1, 1.05, 1], opacity: [0.12, 0.2, 0.12] }}
              transition={{ duration: 8, repeat: Infinity }}
              className="absolute -top-32 -right-40 w-[700px] h-[700px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(11,61,46,0.15) 0%, transparent 70%)" }} />
          </div>

          <div className="relative max-w-[1200px] mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-3xl mx-auto">
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#C8A762]/30 bg-[#C8A762]/5 mb-6">
                <Briefcase size={14} className="text-[#C8A762]" weight="duotone" />
                <span className="text-[12px] font-semibold text-[#C8A762]">خدمة حصرية للشركات والمؤسسات</span>
              </motion.div>

              <h1 className={`text-4xl md:text-5xl font-extrabold tracking-tight mb-5 ${textPrimary}`}>
                المستشار القانوني
                <span className="block text-royal mt-1">المنتدب / المعار</span>
              </h1>

              <p className={`text-lg leading-relaxed mb-8 max-w-2xl mx-auto ${textSecondary}`}>
                محامٍ معتمد يعمل لصالح شركتك بدوام جزئي أو كامل — بتكلفة أقل بكثير من موظف штатный،
                وبخبرة أعلى من أي مكتب محاماة تقليدي.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <motion.a href="#plans" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-[#0B3D2E] text-white font-bold shadow-[0_8px_24px_-8px_rgba(11,61,46,0.5)]">
                  اختر باقتك <ArrowLeft size={16} weight="bold" />
                </motion.a>
                <a href="/contact" className={`inline-flex items-center gap-2 px-6 py-4 rounded-2xl border font-medium text-sm ${border} ${textSecondary}`}>
                  <Phone size={15} /> تواصل معنا
                </a>
              </div>
            </motion.div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-14 max-w-3xl mx-auto">
              {[
                { value: "٤٠٪+", label: "وفر في التكاليف القانونية" },
                { value: "١٥+", label: "قطاع مدعوم" },
                { value: "٢٤/٧", label: "وصول للطوارئ (بريميوم)" },
                { value: "٩٨٪", label: "نسبة رضا العملاء" },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
                  className={`rounded-2xl border p-5 text-center ${border} ${cardBg}`}>
                  <p className="text-2xl font-extrabold text-royal">{s.value}</p>
                  <p className={`text-[11px] mt-1 ${textSecondary}`}>{s.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What's included ────────────────────────────────────────────── */}
        <section className="py-16 md:py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <span className={`text-sm font-medium text-[#C8A762]`}>ما تحصل عليه</span>
              <h2 className={`text-3xl font-bold mt-2 ${textPrimary}`}>خدمات شاملة تغطي كل احتياجاتك القانونية</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ delay: i * 0.07 }}
                    className={`rounded-[1.5rem] border p-6 ${border} ${cardBg}`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${isDark ? "bg-royal/15" : "bg-royal/8"}`}>
                      <Icon size={22} weight="duotone" className="text-royal" />
                    </div>
                    <h3 className={`font-bold text-[15px] mb-2 ${textPrimary}`}>{f.label}</h3>
                    <p className={`text-[13px] leading-relaxed ${textSecondary}`}>{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Plans ─────────────────────────────────────────────────────── */}
        <section id="plans" className="py-16 md:py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-[#C8A762]">الباقات</span>
              <h2 className={`text-3xl font-bold mt-2 ${textPrimary}`}>اختر الباقة المناسبة لحجم شركتك</h2>
              <p className={`text-[14px] mt-2 ${textSecondary}`}>جميع الباقات قابلة للترقية في أي وقت</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {PLANS.map((plan, i) => (
                <motion.div key={plan.id}
                  initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.1, type: "spring", stiffness: 80 }}
                  whileHover={{ y: -4 }}
                  onClick={() => setSelected(plan.id)}
                  className={`relative rounded-[1.75rem] border p-6 cursor-pointer transition-all ${
                    plan.highlight
                      ? "bg-[#0B3D2E] border-[#0B3D2E] shadow-[0_20px_40px_-10px_rgba(11,61,46,0.4)]"
                      : selected === plan.id
                        ? `${cardBg} border-royal/40 shadow-[0_0_0_2px_rgba(11,61,46,0.2)]`
                        : `${cardBg} ${border}`
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 bg-[#C8A762] text-[#0B3D2E] rounded-full text-[10px] font-bold">
                      <Sparkle size={10} weight="fill" /> الأكثر طلباً
                    </div>
                  )}

                  <div className="mb-4">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${plan.highlight ? "bg-white/10 text-white/80" : isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                      {plan.nameEn}
                    </span>
                    <h3 className={`text-xl font-bold mt-3 ${plan.highlight ? "text-white" : textPrimary}`}>{plan.name}</h3>
                    <p className={`text-[12px] mt-1 ${plan.highlight ? "text-white/60" : textSecondary}`}>{plan.hours}</p>
                  </div>

                  <div className="mb-5">
                    <span className={`text-3xl font-extrabold ${plan.highlight ? "text-white" : textPrimary}`}>{plan.price}</span>
                    <span className={`text-[11px] ms-1 ${plan.highlight ? "text-white/60" : textSecondary}`}>{plan.priceSub}</span>
                  </div>

                  <p className={`text-[12px] leading-relaxed mb-5 ${plan.highlight ? "text-white/70" : textSecondary}`}>{plan.desc}</p>

                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2">
                        <Check size={13} weight="bold" className={plan.highlight ? "text-[#C8A762] shrink-0 mt-0.5" : "text-royal shrink-0 mt-0.5"} />
                        <span className={`text-[12px] ${plan.highlight ? "text-white/80" : textSecondary}`}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <motion.a href="/register" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className={`w-full py-3 rounded-2xl text-[13px] font-bold flex items-center justify-center gap-2 ${
                      plan.highlight
                        ? "bg-[#C8A762] text-[#0B3D2E]"
                        : "bg-[#0B3D2E] text-white"
                    }`}
                    onClick={e => e.stopPropagation()}>
                    ابدأ الآن <ArrowLeft size={14} weight="bold" />
                  </motion.a>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonials ───────────────────────────────────────────────── */}
        <section className="py-16">
          <div className="max-w-[900px] mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className={`text-2xl font-bold ${textPrimary}`}>ماذا يقول عملاؤنا</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {TESTIMONIALS.map((t, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className={`rounded-[1.5rem] border p-6 ${border} ${cardBg}`}>
                  <div className="flex items-center gap-1 mb-3">
                    {[...Array(5)].map((_, si) => (
                      <Star key={si} size={13} weight="fill" className="text-[#C8A762]" />
                    ))}
                  </div>
                  <p className={`text-[13px] leading-relaxed mb-4 italic ${textSecondary}`}>&ldquo;{t.text}&rdquo;</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-[13px] font-bold ${textPrimary}`}>{t.name}</p>
                      <p className={`text-[11px] ${textSecondary}`}>{t.role}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
                      {t.plan}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <section className="py-16 pb-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="rounded-[2.5rem] bg-[#0B3D2E] p-10 md:p-16 text-center shadow-[0_20px_60px_-15px_rgba(11,61,46,0.5)]">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">جاهز لتأمين شركتك قانونياً؟</h2>
              <p className="text-white/60 text-sm max-w-md mx-auto mb-8">
                ابدأ بالباقة لايت مجاناً لمدة ٣٠ يوماً. لا يلزمك إدخال بطاقة ائتمان.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <motion.a href="/register" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#C8A762] text-[#0B3D2E] font-bold text-sm">
                  ابدأ مجاناً ٣٠ يوماً <ArrowLeft size={16} weight="bold" />
                </motion.a>
                <a href="/contact" className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl border border-white/30 text-white/80 font-medium text-sm hover:border-white/50">
                  <Phone size={15} /> تحدث مع مستشار
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
