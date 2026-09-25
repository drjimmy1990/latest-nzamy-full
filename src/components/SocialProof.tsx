"use client";

import { motion } from "framer-motion";
import { Star, Quotes, Buildings, Bank, Briefcase, Cube, Hexagon, Globe } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";
import { LIBRARY_STAT_KEYS, LIBRARY_STAT_LABELS, formatLibraryCount } from "@/lib/library/libraryStats";
import { useLibraryStats } from "@/lib/library/useLibraryStats";

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
   * false by three orders of magnitude. The library, by contrast, is real.
   *
   * 2026-09-25: the figures are no longer literals. The same code runs against
   * the cloud project (386 laws) and the self-hosted one (5,901), so any
   * constant is false on one of them. They are counted live from whichever
   * database the site runs on (GET /api/library/stats, cached ~24h) and shown
   * as floors by src/lib/library/libraryStats.ts. While loading, a neutral
   * placeholder; if the count fails, this section is not rendered at all —
   * never a fallback number that could be false. Floors do not animate: a
   * count-up that lands on a round number reads as an exact total.
   */
  const library = useLibraryStats();
  if (library.status === "error") return null;
  const stats = LIBRARY_STAT_KEYS.map((key) => ({
    key,
    value: library.status === "ready" ? formatLibraryCount(library.stats[key], isAr ? "ar" : "en") : null,
    label: isAr ? LIBRARY_STAT_LABELS[key].ar : LIBRARY_STAT_LABELS[key].en,
  })).filter((s) => library.status === "loading" || s.value !== null);

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
                key={stat.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className={`font-brand text-2xl sm:text-3xl md:text-5xl font-extrabold ${isDark ? "text-emerald-400" : "text-royal"}`}>
                  {stat.value ?? (
                    <span
                      aria-hidden
                      className={`inline-block h-[0.8em] w-24 rounded-lg align-middle animate-pulse ${isDark ? "bg-white/10" : "bg-slate-200"}`}
                    />
                  )}
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
