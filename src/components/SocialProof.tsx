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

// ─── LogoMarquee — DELETED, with the «٣٢,٠٠٠» line above it ──────────────────
//
// It scrolled six client logos past the visitor: «مجموعة الرائد» · «بنك التنمية»
// · «مكتب السعيد» · «شركة ابتكار» · «أكاديمية طويق» · «الشبكة العالمية» — none
// of which is a customer, none of which is a logo. They were generic Phosphor
// glyphs (Buildings, Bank, Briefcase, Cube, Hexagon, Globe) with invented names
// beside them, and two of the six drew the same building icon.
//
// Above them sat «يثق بنا أكثر من ٣٢,٠٠٠ عميل وشركة», which contradicted the
// «+٣٢,٦٠٠» counter forty pixels higher — two different totals for one claim,
// on one screen, in one screenshot (shot 27). Both are gone; the real counts
// are in `stats`.
//
// Owner decision, matrix row 75. Nothing replaces it: a strip of real customer
// logos needs real customers who have agreed to be named, and that is a
// business conversation, not a component.

// ─── The three testimonials — DELETED, on both surfaces ──────────────────────
//
// «فيصل الدوسري — مدير شؤون قانونية، مجموعة الرائد» · «نورة القحطاني — محامية
// مستقلة، الرياض» · «خالد العمري — رائد أعمال، جدة». Three named people, with
// job titles, employers, cities, quoted paragraphs and five gold stars each.
//
// None of them exists. Production holds 18 accounts, ZERO consultations, zero
// published lawyers, and no reviews table for a review to have come from — so
// there is no customer who could have said any of it. This is not an
// exaggerated number like the counters above; it is invented testimony
// attributed to named individuals, which is the most serious thing in this
// entire audit.
//
// The same three personas were rendered TWICE — here and on /pricing, where
// «فيصل الدوسري» also claimed «نظامي AI وفّر علينا ٤٠٪ من وقت مراجعة العقود»
// about a language model that is not connected to anything. Deleting one and
// leaving the other is the exact failure mode Wave 1's rule exists to stop, so
// both went in the same commit.
//
// Nothing replaces them. A testimonial needs a customer who said it and agreed
// to be named; `reviews` is a real table waiting for `/api/v1/reviews`
// (matrix row 192), and that is where real ones will come from.

export default function SocialProof() {
  const { lang, theme } = useTheme();
  const isAr = lang === "ar";
  const isDark = theme === "dark";

  /**
   * FOUR REAL COUNTS, replacing four invented ones. Owner decision, matrix
   * row 75: «حذف أرقام الـ32 ألف وشعارات الشركات الوهمية واستبدالها بعدادات
   * الأصول الحقيقية».
   *
   * What was here, against what production actually holds:
   *
   *   «+٣٢٬٦٠٠ مستخدم مسجّل»        18 accounts exist
   *   «+٩٬٢٠٠ عقد تم تحليله بالـ AI»  no language model is wired to anything
   *   «+٨٥٠ محامي معتمد»             0 published lawyers; the directory is empty
   *   «٩٩٪ رضا العملاء»              0 consultations, and no reviews table
   *
   * These are the first numbers a visitor reads, and every one of them was
   * false by three orders of magnitude. The library, by contrast, is real and
   * took months: the figures below are the same ones LegalLibraryBanner.tsx
   * publishes, each re-checkable with one query, and each written as a FLOOR so
   * it stays true as the library grows instead of going stale the first time
   * anyone seeds a row.
   *
   *   select count(*) from library.laws;              -- 386
   *   select count(*) from library.articles;          -- 13,436
   *   select count(*) from library.principles;        -- 17,940
   *   select count(*) from library.decrees_circulars; --  2,078
   *
   * `exact` turns the animated count-up off for the floors: a counter that
   * spins up to «١٣٬٠٠٠» and stops reads as a precise total, and these are not
   * totals. 386 keeps the animation because it IS exact.
   */
  const stats = [
    { value: 386, suffix: "", exact: true, label: isAr ? "نظاماً ولائحة" : "Laws & Regulations" },
    { value: 13000, suffix: "+", exact: false, label: isAr ? "مادة نظامية" : "Statute Articles" },
    { value: 17000, suffix: "+", exact: false, label: isAr ? "مبدأ قضائي" : "Judicial Principles" },
    { value: 2000, suffix: "+", exact: false, label: isAr ? "قرار وتعميم" : "Decrees & Circulars" },
  ];

  return (
    <section id="platform-numbers" className="relative py-24 md:py-32 bg-surface dark:bg-dark-bg">
      <div className="mx-auto max-w-[1400px] px-4">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className={`rounded-[2.5rem] border p-4 sm:p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] ${
            isDark ? "border-white/10 bg-dark-card shadow-black/40" : "border-slate-200/50 bg-white"
          }`}
        >
          <div className="grid grid-cols-2 gap-4 sm:gap-8 md:grid-cols-4 md:gap-0 md:divide-x md:divide-x-reverse md:divide-slate-100 dark:md:divide-white/10">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className={`font-brand text-2xl sm:text-3xl md:text-5xl font-extrabold ${isDark ? "text-emerald-400" : "text-royal"}`}>
                  {stat.exact
                    ? <AnimatedCounter target={stat.value} suffix={stat.suffix} locale={isAr ? "ar-SA" : "en-US"} />
                    : `${stat.value.toLocaleString(isAr ? "ar-SA" : "en-US")}${stat.suffix}`}
                </div>
                <div className={`mt-3 text-sm font-semibold ${isDark ? "text-gray-400" : "text-ink-muted"}`}>{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}
