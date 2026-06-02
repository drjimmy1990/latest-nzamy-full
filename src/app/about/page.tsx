"use client";

import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  Medal,
  Lightbulb,
  Buildings,
  Rocket,
  UsersThree,
  MapPin,
  ArrowLeft,
  Scales,
  CalendarBlank,
  Star,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

// ─── Data ─────────────────────────────────────────────────────────────────────

const counterStats = [
  { valueAr: "٢٠٢٥", valueEn: "2025", labelAr: "الإطلاق الرسمي", labelEn: "Official Launch" },
  { valueAr: "٣٠٠+", valueEn: "300+", labelAr: "محامٍ ومستشار", labelEn: "Lawyers & Consultants" },
  { valueAr: "١٥ ألف+", valueEn: "15K+", labelAr: "طلب استشارة", labelEn: "Consultation Requests" },
  { valueAr: "١٣", valueEn: "13", labelAr: "منطقة مغطاة", labelEn: "Covered Regions" },
];

const values = [
  {
    icon: ShieldCheck,
    titleAr: "الشفافية",
    titleEn: "Transparency",
    descAr: "نؤمن بالوضوح التام في كل تعاملاتنا — أسعار واضحة، عقود مفهومة، ونتائج موثّقة بلا تعقيد.",
    descEn: "We believe in complete clarity in all our dealings — transparent pricing, understandable contracts, and documented results without complexity.",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    icon: Medal,
    titleAr: "الموثوقية",
    titleEn: "Reliability",
    descAr: "كل محامٍ على المنصة موثّق ومرخّص. كل إجابة AI مراجعة من خبراء. لا مجال للتخمين في الشأن القانوني.",
    descEn: "Every lawyer on the platform is verified and licensed. Every AI answer is reviewed by experts. No room for guesswork in legal matters.",
    color: "bg-emerald-500/10 text-emerald-500",
  },
  {
    icon: Lightbulb,
    titleAr: "الابتكار",
    titleEn: "Innovation",
    descAr: "نستخدم أحدث تقنيات الذكاء الاصطناعي لجعل القانون أكثر سهولة وأسرع وصولاً لكل شخص في المملكة.",
    descEn: "We leverage the latest AI technologies to make law more accessible and faster to reach for every person in the Kingdom.",
    color: "bg-[#C8A762]/15 text-[#C8A762]",
  },
];

const team = [
  { nameAr: "م. رامي باقادر", nameEn: "Eng. Rami Baqader", titleAr: "المؤسس والرئيس التنفيذي", titleEn: "Founder & CEO", initials: "رب" },
  { nameAr: "أ. أشرف ويح", nameEn: "Ashraf Wih", titleAr: "المدير التقني والتشغيلي", titleEn: "CTO & COO", initials: "أو" },
];

const timeline = [
  {
    year: "٢٠٢٠",
    yearEn: "2020",
    titleAr: "بذرة الفكرة والبحث",
    titleEn: "The Idea & Research",
    descAr: "رصد الفجوة في السوق القانوني وبدء التخطيط لإنشاء منصة رقمية متكاملة.",
    descEn: "Recognizing the gap in the legal market and planning an integrated digital platform.",
    icon: Lightbulb,
  },
  {
    year: "٢٠٢٢",
    yearEn: "2022",
    titleAr: "البنية التحتية والذكاء الاصطناعي",
    titleEn: "Infrastructure & AI",
    descAr: "تطوير الأساس التقني وتدريب النماذج الذكية حصرياً على الأنظمة السعودية.",
    descEn: "Developing the technical core and training AI models exclusively on Saudi laws.",
    icon: Rocket,
  },
  {
    year: "٢٠٢٤",
    yearEn: "2024",
    titleAr: "تكوين التحالفات الاستراتيجية",
    titleEn: "Strategic Alliances",
    descAr: "استقطاب نخبة من المحامين والمستشارين المرخصين لضمان جودة استثنائية.",
    descEn: "Attracting elite licensed lawyers and consultants to ensure exceptional quality.",
    icon: UsersThree,
  },
  {
    year: "٢٠٢٥",
    yearEn: "2025",
    titleAr: "الإطلاق الرسمي للمنصة",
    titleEn: "Official Launch",
    descAr: "إطلاق نظامي لتقديم أذكى تجربة قانونية مدمجة بالتقنية في المملكة.",
    descEn: "Launching Nezamy to provide the smartest tech-integrated legal experience in the Kingdom.",
    icon: Star,
  },
];

// ─── Animated Counter ─────────────────────────────────────────────────────────

function AnimatedCounter({ end, isRTL }: { end: string; isRTL: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [displayed, setDisplayed] = useState("0");

  useEffect(() => {
    if (!inView) return;
    // Just animate the raw value by showing it after a delay
    const timeout = setTimeout(() => setDisplayed(end), 400);
    return () => clearTimeout(timeout);
  }, [inView, end]);

  return <span ref={ref}>{displayed}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const { lang, theme } = useTheme();
  const isRTL = lang === "ar";
  const isDark = theme === "dark";

  return (
    <div className={`min-h-screen ${isDark ? "bg-dark-bg" : "bg-slate-50"} overflow-x-hidden`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      {/* ── 1. Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-0 pt-28 md:pt-36">
        {/* Background */}
        <div className="pointer-events-none absolute inset-0">
          <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-b from-[#0B3D2E]/40 via-dark-bg to-dark-bg" : "bg-gradient-to-b from-[#0B3D2E]/5 via-slate-50 to-slate-50"}`} />
        </div>

        <div className="relative mx-auto max-w-[1200px] px-4">
          <div className="mb-16 text-center">
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C8A762]/30 bg-[#C8A762]/10 px-4 py-1.5 text-xs font-semibold text-[#C8A762]"
            >
              <Scales size={13} weight="fill" />
              {isRTL ? "من نحن" : "About Us"}
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={`font-brand mb-4 text-4xl font-bold leading-tight md:text-6xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}
            >
              {isRTL ? "نجعل القانون في متناول الجميع" : "Making Law Accessible to Everyone"}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={`mx-auto max-w-[50ch] text-lg ${isDark ? "text-gray-400" : "text-slate-500"}`}
            >
              {isRTL
                ? "منصة تقنية قانونية سعودية تربط الأفراد والشركات بمحامين موثّقين وذكاء اصطناعي قانوني متخصص."
                : "A Saudi legal tech platform connecting individuals and companies with verified lawyers and specialized legal AI."}
            </motion.p>
          </div>

          {/* Counter stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {counterStats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className={`rounded-2xl border p-6 text-center ${
                  isDark ? "border-white/10 bg-dark-card" : "border-slate-100 bg-white"
                }`}
              >
                <div className={`font-brand mb-1 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                  <AnimatedCounter end={isRTL ? stat.valueAr : stat.valueEn} isRTL={isRTL} />
                </div>
                <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  {isRTL ? stat.labelAr : stat.labelEn}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. Story ─────────────────────────────────────────────────────────── */}
      <section className={`py-24 ${isDark ? "bg-dark-card" : "bg-white"}`}>
        <div className="mx-auto max-w-[1200px] px-4">
          <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
            {/* Text */}
            <motion.div
              initial={{ opacity: 0, x: isRTL ? 30 : -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className={`font-brand mb-6 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                {isRTL ? "كيف بدأت قصتنا" : "How Our Story Began"}
              </h2>
              <div className={`space-y-4 text-base leading-relaxed ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                <p>
                  {isRTL
                    ? "بدأت رحلتنا في عام ٢٠٢٠ كفكرة طموحة لسد الفجوة الرقمية في القطاع القانوني السعودي. أدركنا أن الكثيرين يجدون صعوبة في الوصول إلى خدمات قانونية موثوقة بأسعار شفافة ومناسبة."
                    : "Our journey began in 2020 as an ambitious idea to bridge the digital gap in the Saudi legal sector. We realized how challenging it was to access reliable legal services with transparent pricing."}
                </p>
                <p>
                  {isRTL
                    ? "على مدار خمس سنوات من البحث والتطوير، وبناء بنية تحتية تقنية متينة تعتمد على أحدث نماذج الذكاء الاصطناعي، تبلورت الرؤية وتأسست الشراكات الاستراتيجية مع نخبة المحامين والمستشارين."
                    : "Over five years of R&D, building a robust tech infrastructure powered by the latest AI models, our vision crystallized and strategic partnerships were formed with elite lawyers."}
                </p>
                <p>
                  {isRTL
                    ? "وفي عام ٢٠٢٥، أطلقنا «نظامي» رسمياً لتكون المنصة القانونية الرقمية الأذكى والأكثر تطوراً في المملكة، مقدمين تجربة سلسة تجمع بين حكمة المحامي الممارس ودقة الآلة."
                    : "In 2025, we officially launched 'Nezamy' as the smartest digital legal platform in the Kingdom, delivering a seamless experience that combines a lawyer's wisdom with machine precision."}
                </p>
              </div>
            </motion.div>

            {/* Image placeholder */}
            <motion.div
              initial={{ opacity: 0, x: isRTL ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className={`relative h-80 overflow-hidden rounded-3xl md:h-96 ${isDark ? "bg-dark-bg" : "bg-slate-100"}`}>
                {/* Decorative gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0B3D2E] via-[#0f5a42] to-[#C8A762]/30" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10">
                    <Scales size={40} weight="duotone" className="text-[#C8A762]" />
                  </div>
                  <p className="text-lg font-bold text-white">{isRTL ? "نظامي" : "Nezamy"}</p>
                  <p className="mt-2 text-sm text-white/70">{isRTL ? "العدالة في متناول الجميع" : "Justice for Everyone"}</p>
                </div>
                {/* Floating chips */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-4 end-4 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm"
                >
                  <span className="text-xs font-semibold text-white">{isRTL ? "٣٠٠+ محامٍ وخبير" : "300+ Lawyers"}</span>
                </motion.div>
                <motion.div
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                  className="absolute bottom-4 start-4 rounded-xl bg-[#C8A762]/20 px-3 py-2 backdrop-blur-sm border border-[#C8A762]/30"
                >
                  <span className="text-xs font-semibold text-[#C8A762]">{isRTL ? "١٥ ألف+ استشارة" : "15K+ Consults"}</span>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 3. Values ────────────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-[1200px] px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className={`font-brand mb-3 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "قيمنا الجوهرية" : "Our Core Values"}
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {values.map((val, i) => {
              const Icon = val.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ y: -4 }}
                  className={`rounded-2xl border p-8 transition-shadow hover:shadow-lg ${
                    isDark ? "border-white/10 bg-dark-card" : "border-slate-100 bg-white"
                  }`}
                >
                  <div className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${val.color}`}>
                    <Icon size={28} weight="duotone" />
                  </div>
                  <h3 className={`mb-3 text-xl font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                    {isRTL ? val.titleAr : val.titleEn}
                  </h3>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                    {isRTL ? val.descAr : val.descEn}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 4. Team ──────────────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-dark-card" : "bg-white"}`}>
        <div className="mx-auto max-w-[1200px] px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className={`font-brand mb-3 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "فريق القيادة" : "Leadership Team"}
            </h2>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL ? "الأشخاص الذين يبنون مستقبل القانون الرقمي في المملكة" : "The people building the future of digital law in Saudi Arabia"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:max-w-3xl lg:mx-auto">
            {team.map((member, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                className={`group rounded-2xl border p-6 text-center transition-shadow hover:shadow-lg ${
                  isDark ? "border-white/10 bg-dark-bg" : "border-slate-100 bg-slate-50"
                }`}
              >
                {/* Avatar */}
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#0f5a42] shadow-lg">
                  <span className="font-brand text-2xl font-bold text-[#C8A762]">{member.initials}</span>
                </div>
                <h3 className={`mb-1 text-base font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                  {isRTL ? member.nameAr : member.nameEn}
                </h3>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  {isRTL ? member.titleAr : member.titleEn}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Timeline ──────────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-[900px] px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className={`font-brand mb-3 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "رحلتنا عبر الزمن" : "Our Journey"}
            </h2>
          </motion.div>

          <div className="relative">
            {/* Vertical line */}
            <div className={`absolute start-[2.25rem] top-0 bottom-0 w-0.5 ${isDark ? "bg-white/10" : "bg-slate-200"} md:start-1/2 md:-translate-x-0.5`} />

            <div className="space-y-10">
              {timeline.map((item, i) => {
                const Icon = item.icon;
                const isRight = i % 2 === 0;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: isRight ? -30 : 30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className={`relative flex gap-6 md:gap-0 ${isRight ? "md:flex-row" : "md:flex-row-reverse"}`}
                  >
                    {/* Desktop: left/right content */}
                    <div className={`hidden md:block md:w-5/12 ${isRight ? "text-end" : "text-start"}`}>
                      <div className={`rounded-2xl border p-5 ${isDark ? "border-white/10 bg-dark-card" : "border-slate-100 bg-white"} ${isRight ? "me-8" : "ms-8"}`}>
                        <span className="mb-2 block text-sm font-bold text-[#C8A762]">
                          {isRTL ? item.year : item.yearEn}
                        </span>
                        <h3 className={`mb-2 font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                          {isRTL ? item.titleAr : item.titleEn}
                        </h3>
                        <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                          {isRTL ? item.descAr : item.descEn}
                        </p>
                      </div>
                    </div>

                    {/* Center dot */}
                    <div className="relative z-10 flex md:w-2/12 md:justify-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B3D2E] shadow-lg">
                        <Icon size={18} weight="duotone" className="text-[#C8A762]" />
                      </div>
                    </div>

                    {/* Desktop: opposite side spacer */}
                    <div className="hidden md:block md:w-5/12" />

                    {/* Mobile: content next to icon */}
                    <div className={`flex-1 rounded-2xl border p-5 md:hidden ${isDark ? "border-white/10 bg-dark-card" : "border-slate-100 bg-white"}`}>
                      <span className="mb-1 block text-sm font-bold text-[#C8A762]">
                        {isRTL ? item.year : item.yearEn}
                      </span>
                      <h3 className={`mb-1 font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                        {isRTL ? item.titleAr : item.titleEn}
                      </h3>
                      <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                        {isRTL ? item.descAr : item.descEn}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Partners ──────────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-dark-card" : "bg-white"}`}>
        <div className="mx-auto max-w-[1200px] px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 text-center"
          >
            <h2 className={`font-brand mb-3 text-2xl font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "شركاؤنا الاستراتيجيون" : "Our Strategic Partners"}
            </h2>
          </motion.div>

          <div className="grid grid-cols-4 gap-4 md:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ scale: 1.05 }}
                className={`flex h-16 items-center justify-center rounded-2xl border ${
                  isDark ? "border-white/10 bg-dark-bg" : "border-slate-100 bg-slate-50"
                }`}
              >
                <Buildings size={24} weight="duotone" className={isDark ? "text-gray-600" : "text-slate-300"} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. CTA ───────────────────────────────────────────────────────────── */}
      <section className={`py-24 ${isDark ? "bg-dark-bg" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-[700px] px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <CalendarBlank size={40} weight="duotone" className="mx-auto mb-6 text-[#C8A762]" />
            <h2 className={`font-brand mb-4 text-3xl font-bold md:text-4xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
              {isRTL ? "انضم إلى مجتمع نظامي" : "Join the Nezamy Community"}
            </h2>
            <p className={`mb-8 text-base ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {isRTL
                ? "كن جزءاً من مستقبل الخدمات القانونية الرقمية في المملكة العربية السعودية."
                : "Be part of the future of digital legal services in Saudi Arabia."}
            </p>
            <motion.a
              href="/register"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#0B3D2E] px-10 py-4 text-base font-bold text-white shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]"
            >
              {isRTL ? "انضم إلينا" : "Join Us"}
              <ArrowLeft size={18} weight="bold" className={isRTL ? "" : "rotate-180"} />
            </motion.a>
          </motion.div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
