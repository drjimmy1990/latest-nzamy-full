"use client";

import { motion } from "framer-motion";
import { memo } from "react";
import {
  ChatTeardropDots,
  BookOpen,
  Books,
  Gavel,
  ArrowLeft,
  ArrowRight,
  UsersThree,
  TrendUp,
} from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";
import { LIBRARY_STAT_KEYS, LIBRARY_STAT_LABELS, formatLibraryCount } from "@/lib/library/libraryStats";
import { useLibraryStats } from "@/lib/library/useLibraryStats";

// ─── MOCK_QUESTIONS · MOCK_ARTICLES · MOCK_LAWYERS — ALL THREE DELETED ───────
//
// Owner decision, matrix row 76. This component sits on the PUBLIC landing page
// (src/app/page.tsx:47), so it was the first evidence a visitor had that the
// platform is used by anyone. None of it was true.
//
//   MOCK_LAWYERS    «أ. خالد المالكي — نظام العمل — ٤٫٩ — ٣١٢ استشارة» and two
//                   more: three named lawyers with star ratings and
//                   consultation counts, under a heading «أكثر المحامين
//                   تفاعلاً», on a platform with ZERO published lawyers and
//                   ZERO consultations. Row 76 says replace them with
//                   SPECIALTIES, which is what the card below now shows —
//                   practice areas are a real taxonomy; the people were not.
//
//   MOCK_QUESTIONS  three questions carrying «١٤٧ صوت · ٢٣ إجابة · ٣٬٨٤٠
//                   مشاهدة», and hardcoded relative timestamps («منذ ساعتين»,
//                   «منذ 5 ساعات») that never aged — so the community looked
//                   equally busy at 3am on any day of any year, forever.
//
//   MOCK_ARTICLES   three articles with invented authors and job titles («أ.
//                   فهد العتيبي — محامٍ متخصص في شؤون العمل»), invented read
//                   counts (١٤٬٣٢٠) and all three dated مارس ٢٠٢٦ — presented
//                   as the latest writing while being months stale on their own
//                   face.
//
// The «المجتمع بالأرقام» tile went with them: «٤٬٨٢٠ سؤال» · «١٬٢٤٠ إجابة
// موثوقة» · «٨٧ محامٍ نشط» · and «+٣٢٬٦٠٠ مستخدم» — that last one being the SAME
// fabricated figure this wave already deleted from SocialProof.tsx, on the SAME
// page, in a different component. Fixing one and leaving the other is exactly
// the failure the shape rule exists to prevent, so both went in one pass.
//
// WHAT REPLACED THEM. The legal library is real, so the counters below are its
// size. 2026-09-25: they are no longer literals — the same code runs against the
// cloud project (386 laws) and the self-hosted one (5,901 rows of every
// instrument type), so any constant is false on one of them. They are counted
// live from whichever database the site runs on (GET /api/library/stats, cached
// ~24h), shown as floors with the labels in src/lib/library/libraryStats.ts
// (library.laws is «وثيقة نظامية», not «نظام ولائحة»: only 593 of its 5,901
// self-hosted rows are «نظام»). While loading: a neutral placeholder. If the
// count fails: no numbers at all, only the link to the library.
//
// The blog is ALSO real and has a CMS behind it, but pointing this rail at
// published posts is a data fetch with an owner and a contract, not a hole to
// plug with a literal — so the rail links to /blog and claims nothing about
// what is in it. That wiring is the remaining half of row 76.

/** Practice areas, from the community taxonomy in src/constants/communityData.ts.
 *  Labels only. The `count` field on those rows is invented and is NOT read here. */
const PRACTICE_AREAS = [
  { ar: "عمالي", en: "Labor" },
  { ar: "تجاري", en: "Commercial" },
  { ar: "مدني", en: "Civil" },
  { ar: "جنائي", en: "Criminal" },
  { ar: "أحوال شخصية", en: "Family" },
  { ar: "عقاري", en: "Real Estate" },
] as const;

// ─── Stat Counter ─────────────────────────────────────────────────────────────

/** A floor, printed as-is. Floors do not animate: a counter that spins up to a
 *  round number and stops reads as a precise total, and a floor is not one.
 *  `value` null = still loading → neutral placeholder, no number. */
const StatCounter = memo(function StatCounter({
  value, label, isDark,
}: {
  value: string | null;
  label: string;
  isDark: boolean;
}) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-extrabold font-mono ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
        {value ?? (
          <span
            aria-hidden
            className={`inline-block h-[0.8em] w-16 rounded-md align-middle animate-pulse ${isDark ? "bg-white/10" : "bg-slate-200"}`}
          />
        )}
      </p>
      <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{label}</p>
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommunityHighlights() {
  const { lang, theme } = useTheme();
  const isAr = lang === "ar";
  const isDark = theme === "dark";

  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;
  const library = useLibraryStats();
  const libraryStats = library.status === "error"
    ? []
    : LIBRARY_STAT_KEYS.map((key) => ({
        key,
        value: library.status === "ready" ? formatLibraryCount(library.stats[key], isAr ? "ar" : "en") : null,
        label: isAr ? LIBRARY_STAT_LABELS[key].ar : LIBRARY_STAT_LABELS[key].en,
      })).filter((s) => library.status === "loading" || s.value !== null);

  const card = isDark
    ? "border-white/10 bg-dark-card"
    : "border-slate-200/60 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]";

  return (
    <section id="community" className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-surface via-royal/[0.015] to-surface dark:from-dark-bg dark:via-dark-card/20 dark:to-dark-bg" />

      <div className="relative mx-auto max-w-[1400px] px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="mb-14"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C8A762]/20 bg-[#C8A762]/5 px-4 py-1.5 mb-4">
            <UsersThree size={14} weight="fill" className="text-[#C8A762]" />
            <span className="text-xs font-bold text-[#C8A762]">
              {isAr ? "مجتمع نظامي" : "Nezamy Community"}
            </span>
          </div>
          {/* The heading used to read «الأكثر تفاعلاً في المجتمع» over invented
              engagement, and the sub-line promised questions «مرتبة حسب التفاعل
              الحقيقي» — a claim of authenticity printed directly above the mock
              array. Both now describe what is actually on the page. */}
          <h2 className={`font-brand text-3xl font-extrabold tracking-tight md:text-5xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
            {isAr ? "المجتمع والمكتبة القانونية" : "Community & Legal Library"}
          </h2>
          <p className={`mt-4 max-w-[55ch] text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {isAr
              ? "اسأل مجتمع نظامي في تخصصك، وابحث في الأنظمة واللوائح ومَوادّها بالنص الكامل."
              : "Ask the Nezamy community in your practice area, and search Saudi laws, regulations and their articles in full text."}
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid gap-5 lg:grid-cols-3">

          {/* ── اسأل المجتمع ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.05 }}
            className={`lg:col-span-2 rounded-[2.5rem] border p-5 sm:p-8 md:p-10 ${card}`}
          >
            <div className="flex items-center justify-between mb-7">
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDark ? "bg-white/10" : "bg-[#0B3D2E]/5"}`}>
                  <ChatTeardropDots size={20} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
                </span>
                <div>
                  <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                    {isAr ? "اسأل المجتمع القانوني" : "Ask the Legal Community"}
                  </h3>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {isAr ? "سؤالك يبقى منشوراً ليستفيد منه غيرك" : "Your question stays public so others benefit"}
                  </p>
                </div>
              </div>
              <a
                href="/community"
                className={`flex items-center gap-1.5 text-xs font-semibold transition-all hover:gap-2.5 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}
              >
                {isAr ? "تصفّح المجتمع" : "Browse Community"}
                <ArrowIcon size={14} weight="bold" />
              </a>
            </div>

            {/* SPANS, not links, and that is the whole point.
                These were six <a> tags all pointing at bare `/community`, so
                six differently-labelled buttons did one identical thing —
                which is defect 2 («two labels for one action») turned inside
                out: one action wearing six labels. `/community` keeps its
                category in `useState` (community/page.tsx:64) and reads no
                search param, so `?category=labor` would be silently ignored;
                a chip that discards what you clicked is a false promise on the
                page this component was just cleaned of false promises.
                They are a list of what the platform covers. The two real
                actions — browse, and ask — are the link above and the button
                below, and both go somewhere. */}
            <ul className="flex flex-wrap gap-2.5 list-none p-0 m-0">
              {PRACTICE_AREAS.map((area) => (
                <li
                  key={area.en}
                  className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold ${
                    isDark
                      ? "border-white/10 bg-white/[0.03] text-gray-300"
                      : "border-slate-200 bg-slate-50/60 text-gray-700"
                  }`}
                >
                  {isAr ? area.ar : area.en}
                </li>
              ))}
            </ul>

            {/* /community/ask, not /community. The two links on this card had
                different labels and one destination, which is the same shape
                the chips above just lost. The ask route is real — the community
                page's own CTA points at it (community/page.tsx:206). */}
            <a
              href="/community/ask"
              className={`mt-7 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-colors ${
                isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15" : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328]"
              }`}
            >
              {isAr ? "اطرح سؤالك" : "Ask a Question"}
              <ArrowIcon size={14} weight="bold" />
            </a>
          </motion.div>

          {/* ── المكتبة بالأرقام ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.1 }}
            className={`rounded-[2.5rem] border p-5 sm:p-8 md:p-10 ${card}`}
          >
            <div className="flex items-center gap-2 mb-6">
              <TrendUp size={18} weight="fill" className="text-[#C8A762]" />
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-700"}`}>
                {libraryStats.length > 0
                  ? (isAr ? "المكتبة بالأرقام" : "The Library in Numbers")
                  : (isAr ? "المكتبة القانونية" : "The Legal Library")}
              </h3>
            </div>
            {libraryStats.length > 0 && (
              <div className="grid grid-cols-2 gap-4 sm:gap-6" aria-busy={library.status === "loading"}>
                {libraryStats.map((s) => (
                  <StatCounter key={s.key} value={s.value} label={s.label} isDark={isDark} />
                ))}
              </div>
            )}
            <a
              href="/laws"
              className={`${libraryStats.length > 0 ? "mt-6" : "mt-0"} inline-flex items-center gap-1.5 text-xs font-semibold transition-all hover:gap-2.5 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}
            >
              {isAr ? "تصفّح المكتبة" : "Browse the Library"}
              <ArrowIcon size={14} weight="bold" />
            </a>
          </motion.div>

          {/* ── التخصصات ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.15 }}
            className={`lg:col-span-2 rounded-[2.5rem] border p-5 sm:p-8 md:p-10 ${card}`}
          >
            <div className="flex items-center gap-2 mb-5">
              <Gavel size={18} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-700"}`}>
                {isAr ? "مجالات الممارسة" : "Practice Areas"}
              </h3>
            </div>
            <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isAr
                ? "نظامي يغطي هذه المجالات في الاستشارات وصياغة العقود والمذكرات. سجّل واطلب في المجال الذي يخصّك."
                : "Nezamy covers these areas across consultations, contract drafting and legal memoranda. Sign up and request in the area you need."}
            </p>
            <a
              href="/services"
              className={`mt-6 inline-flex items-center gap-1.5 text-xs font-semibold transition-all hover:gap-2.5 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}
            >
              {isAr ? "كل الخدمات" : "All Services"}
              <ArrowIcon size={14} weight="bold" />
            </a>
          </motion.div>

          {/* ── المدونة ── */}
          <motion.a
            href="/blog"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.2 }}
            whileHover={{ y: -4 }}
            className={`group rounded-[2.5rem] border p-5 sm:p-8 md:p-10 flex flex-col justify-between transition-all ${card} ${
              isDark ? "hover:bg-white/5" : "hover:border-[#0B3D2E]/20 hover:shadow-lg"
            }`}
          >
            <div>
              <div className="flex items-center gap-2 mb-4">
                <BookOpen size={20} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
                <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                  {isAr ? "المدونة القانونية" : "Legal Blog"}
                </h3>
              </div>
              <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {isAr
                  ? "مقالات يحرّرها فريق نظامي القانوني في الأنظمة السعودية وتطبيقاتها العملية."
                  : "Articles written by the Nezamy legal team on Saudi law and how it applies in practice."}
              </p>
            </div>
            <span className={`mt-6 inline-flex items-center gap-1.5 text-xs font-semibold transition-all group-hover:gap-2.5 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>
              <Books size={14} weight="fill" />
              {isAr ? "اقرأ المقالات" : "Read the Articles"}
              <ArrowIcon size={14} weight="bold" />
            </span>
          </motion.a>

        </div>
      </div>
    </section>
  );
}
