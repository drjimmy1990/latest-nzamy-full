"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";
import { Star, Quotes, Buildings, Bank, Briefcase, Cube, Hexagon, Globe } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";

const AnimatedCounter = memo(function AnimatedCounter({
  target,
  suffix = "",
  prefix = "",
  locale = "ar-SA",
}: {
  target: number;
  suffix?: string;
  prefix?: string;
  locale?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const ctrl = animate(count, target, { duration: 2, ease: [0.16, 1, 0.3, 1] });
    return ctrl.stop;
  }, [inView, count, target]);

  useEffect(() => {
    const unsub = rounded.on("change", (v) => {
      if (ref.current) ref.current.textContent = `${prefix}${v.toLocaleString(locale)}${suffix}`;
    });
    return unsub;
  }, [rounded, prefix, suffix, locale]);

  return <span ref={ref}>{prefix}0{suffix}</span>;
});

const LogoMarquee = memo(function LogoMarquee({ isAr }: { isAr: boolean }) {
  const logos = [
    { icon: Buildings, name: isAr ? "مجموعة الرائد" : "Al-Raed Group" },
    { icon: Bank, name: isAr ? "بنك التنمية" : "Development Bank" },
    { icon: Briefcase, name: isAr ? "مكتب السعيد" : "Al-Saeed Office" },
    { icon: Cube, name: isAr ? "شركة ابتكار" : "Ebtikar Tech" },
    { icon: Hexagon, name: isAr ? "أكاديمية طويق" : "Tuwaiq Academy" },
    { icon: Globe, name: isAr ? "الشبكة العالمية" : "Global Network" }
  ];

  return (
    <div className="mt-16 border-t border-slate-100 pt-10 dark:border-white/10 overflow-hidden relative">
      <div className="absolute left-0 top-0 z-10 w-24 h-full bg-gradient-to-r from-surface dark:from-dark-bg to-transparent" />
      <div className="absolute right-0 top-0 z-10 w-24 h-full bg-gradient-to-l from-surface dark:from-dark-bg to-transparent" />
      
      <p className="mb-6 text-center text-sm font-semibold text-ink-muted uppercase tracking-wider">{isAr ? "يثق بنا أكثر من ٣٢,٠٠٠ عميل وشركة" : "Trusted by over 32,000 clients & companies"}</p>
      
      <motion.div
        animate={{ x: isAr ? ["0%", "50%"] : ["0%", "-50%"] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="flex items-center gap-16 whitespace-nowrap opacity-60 dark:opacity-40"
      >
        {[...logos, ...logos, ...logos].map((logo, i) => (
          <div key={i} className="flex items-center gap-2 text-ink dark:text-gray-300 pointer-events-none">
            <logo.icon size={28} weight="duotone" className="text-royal dark:text-emerald-500" />
            <span className="font-brand text-xl font-bold">{logo.name}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
});

export default function SocialProof() {
  const { lang, theme } = useTheme();
  const isAr = lang === "ar";
  const isDark = theme === "dark";

  const stats = [
    { value: 32600, suffix: "+", label: isAr ? "مستخدم مسجّل" : "Registered Users" },
    { value: 9200, suffix: "+", label: isAr ? "عقد تم تحليله بالـ AI" : "AI Analyzed Contracts" },
    { value: 850, suffix: "+", label: isAr ? "محامي معتمد" : "Certified Lawyers" },
    { value: 99, suffix: "%", label: isAr ? "رضا العملاء" : "Client Satisfaction" },
  ];

  const testimonials = [
    {
      name: "فيصل الدوسري",
      role: isAr ? "مدير شؤون قانونية — مجموعة الرائد" : "Legal Affairs Manager — Al-Raed Group",
      text: "نظامي وفر علينا وقت هائل في مراجعة العقود. الذكاء الاصطناعي يكتشف البنود المجحفة والثغرات الإجرائية بسرعة مذهلة وبدقة متناهية.",
      rating: 5,
    },
    {
      name: "نورة القحطاني",
      role: isAr ? "محامية مستقلة — الرياض" : "Independent Lawyer — Riyadh",
      text: "باقة المحامين غيرت طريقة إدارتي لمكتبي. من صياغة اللوائح الاعتراضية بالـ AI إلى إدارة تقويم الجلسات، كل شيء في مكان واحد.",
      rating: 5,
    },
    {
      name: "خالد بن سعيد العمري",
      role: isAr ? "رائد أعمال — جدة" : "Entrepreneur — Jeddah",
      text: "الاستشارة الفورية عبر الواتساب أنقذتني من توقيع عقد شراكة كان بيكلفني الكثير. تم مراجعة العقد ونصحوني برده فوراً.",
      rating: 5,
    },
  ];

  return (
    <section id="testimonials" className="relative py-24 md:py-32 bg-surface dark:bg-dark-bg">
      <div className="mx-auto max-w-[1400px] px-4">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className={`rounded-[2.5rem] border p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] md:p-12 ${
            isDark ? "border-white/10 bg-dark-card shadow-black/40" : "border-slate-200/50 bg-white"
          }`}
        >
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-0 md:divide-x md:divide-x-reverse md:divide-slate-100 dark:md:divide-white/10">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className={`font-brand text-3xl font-extrabold md:text-5xl ${isDark ? "text-emerald-400" : "text-royal"}`}>
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} locale={isAr ? "ar-SA" : "en-US"} />
                </div>
                <div className={`mt-3 text-sm font-semibold ${isDark ? "text-gray-400" : "text-ink-muted"}`}>{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Corporate Trust Logos */}
        <LogoMarquee isAr={isAr} />

        {/* Testimonials */}
        <div className="mt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center md:text-start"
          >
            <span className="text-sm font-bold text-gold-dark">{isAr ? "آراء العملاء" : "Client Reviews"}</span>
            <h2 className={`font-brand mt-2 text-3xl font-extrabold tracking-tight md:text-5xl ${isDark ? "text-white" : "text-royal"}`}>
              {isAr ? "نجاحات تصنع الثقة" : "Success Creating Trust"}
            </h2>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, type: "spring", stiffness: 100, damping: 20 }}
                className={`group relative rounded-[2rem] border p-8 transition-shadow hover:shadow-xl dark:shadow-none ${
                  isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200/50 bg-white hover:border-royal/20"
                }`}
              >
                <Quotes size={36} weight="fill" className="mb-6 text-gold opacity-40 group-hover:opacity-100 transition-opacity" />
                <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-ink-muted"}`}>{t.text}</p>

                <div className="mt-6 flex items-center gap-1.5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} size={16} weight="fill" className="text-gold" />
                  ))}
                </div>

                <div className="mt-6 border-t pt-6 dark:border-white/10">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-royal/10 dark:bg-emerald-500/10 font-brand text-lg font-bold text-royal dark:text-emerald-400">
                      {t.name[0]}
                    </div>
                    <div>
                      <div className={`text-base font-bold ${isDark ? "text-white" : "text-ink"}`}>{t.name}</div>
                      <div className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-ink-faint"}`}>{t.role}</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
