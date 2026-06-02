"use client";

import { motion } from "framer-motion";
import { memo, useState, useEffect } from "react";
import {
  ChatTeardropDots,
  BookOpen,
  ThumbsUp,
  Eye,
  Gavel,
  FileText,
  ArrowLeft,
  ArrowRight,
  UsersThree,
  TrendUp,
  Star,
  Clock,
} from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";

// ─── Types / Interfaces (جاهزة للـ API) ───────────────────────────────────────

export interface CommunityQuestion {
  id: string;
  title: string;
  category: string;
  categoryColor: string;
  votes: number;
  answers: number;
  views: number;
  timeAgo: string;
}

export interface BlogArticle {
  id: string;
  title: string;
  author: string;
  authorRole: string;
  reads: number;
  minutesRead: number;
  category: string;
  publishedAt: string;
}

export interface TopLawyer {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  consultations: number;
  avatarInitials: string;
  avatarColor: string;
}

// ─── Mock Data (يُستبدل بـ API لاحقاً) ────────────────────────────────────────

const MOCK_QUESTIONS: CommunityQuestion[] = [
  {
    id: "q1",
    title: "هل يحق لصاحب العمل خصم الإجازة السنوية من مكافأة نهاية الخدمة؟",
    category: "عمالي",
    categoryColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    votes: 147,
    answers: 23,
    views: 3840,
    timeAgo: "منذ ساعتين",
  },
  {
    id: "q2",
    title: "ما هي شروط فسخ العقد التجاري قبل انتهاء مدته وهل يُشترط التعويض؟",
    category: "تجاري",
    categoryColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    votes: 98,
    answers: 17,
    views: 2210,
    timeAgo: "منذ 5 ساعات",
  },
  {
    id: "q3",
    title: "كيف أتقدم بشكوى ضد محامٍ أخل بالتزاماته في قضيتي؟",
    category: "إداري",
    categoryColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    votes: 76,
    answers: 11,
    views: 1590,
    timeAgo: "منذ يوم",
  },
];

const MOCK_ARTICLES: BlogArticle[] = [
  {
    id: "a1",
    title: "دليل شامل: حقوقك القانونية عند الفصل التعسفي في ظل نظام العمل السعودي",
    author: "أ. فهد العتيبي",
    authorRole: "محامٍ متخصص في شؤون العمل",
    reads: 14320,
    minutesRead: 8,
    category: "نظام العمل",
    publishedAt: "28 مارس 2026",
  },
  {
    id: "a2",
    title: "عيوب العقود التجارية الأكثر شيوعاً وكيف تحمي نفسك منها؟",
    author: "أ. منيرة القحطاني",
    authorRole: "مستشارة قانونية للشركات",
    reads: 9870,
    minutesRead: 6,
    category: "العقود التجارية",
    publishedAt: "25 مارس 2026",
  },
  {
    id: "a3",
    title: "أبرز التعديلات على نظام الملكية الفكرية في المملكة لعام 2025",
    author: "أ. سلطان الزهراني",
    authorRole: "محامٍ ملكية فكرية",
    reads: 7440,
    minutesRead: 5,
    category: "الملكية الفكرية",
    publishedAt: "20 مارس 2026",
  },
];

const MOCK_LAWYERS: TopLawyer[] = [
  { id: "l1", name: "أ. خالد المالكي", specialty: "نظام العمل", rating: 4.9, consultations: 312, avatarInitials: "خم", avatarColor: "bg-[#0B3D2E]" },
  { id: "l2", name: "أ. ريم الحربي", specialty: "العقود التجارية", rating: 4.8, consultations: 287, avatarInitials: "رح", avatarColor: "bg-[#1a5c44]" },
  { id: "l3", name: "أ. نواف العنزي", specialty: "الأحوال الشخصية", rating: 4.8, consultations: 241, avatarInitials: "نع", avatarColor: "bg-[#C8A762]" },
];

// ─── Stat Counter (مرئية بشكل تدريجي) ────────────────────────────────────────

const StatCounter = memo(function StatCounter({ value, suffix, label, isDark }: {
  value: number; suffix: string; label: string; isDark: boolean;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.ceil(value / 60);
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setCount(value); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return (
    <div className="text-center">
      <p className={`text-2xl font-extrabold font-mono ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
        {count.toLocaleString("ar-EG")}{suffix}
      </p>
      <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{label}</p>
    </div>
  );
});

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CommunityHighlights() {
  const { lang, theme } = useTheme();
  const isAr = lang === "ar";
  const isDark = theme === "dark";

  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

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
          <h2 className={`font-brand text-3xl font-extrabold tracking-tight md:text-5xl ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
            {isAr ? "الأكثر تفاعلاً في المجتمع" : "Most Engaging in Community"}
          </h2>
          <p className={`mt-4 max-w-[55ch] text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {isAr
              ? "أبرز الأسئلة والمدونات القانونية مرتبة حسب التفاعل الحقيقي من مجتمع نظامي"
              : "Top legal questions and articles ranked by real community engagement"}
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid gap-5 lg:grid-cols-3 lg:grid-rows-2">

          {/* ── أبرز الأسئلة (يأخذ عمودين وصفين) ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.05 }}
            className={`lg:col-span-2 lg:row-span-2 rounded-[2.5rem] border p-8 md:p-10 ${
              isDark ? "border-white/10 bg-dark-card" : "border-slate-200/60 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]"
            }`}
          >
            <div className="flex items-center justify-between mb-7">
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDark ? "bg-white/10" : "bg-[#0B3D2E]/5"}`}>
                  <ChatTeardropDots size={20} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
                </span>
                <div>
                  <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                    {isAr ? "أبرز أسئلة المجتمع" : "Top Community Questions"}
                  </h3>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {isAr ? "مرتبة بالأعلى تفاعلاً" : "Ranked by engagement"}
                  </p>
                </div>
              </div>
              <a
                href="/community"
                className={`flex items-center gap-1.5 text-xs font-semibold transition-all hover:gap-2.5 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}
              >
                {isAr ? "كل الأسئلة" : "All Questions"}
                <ArrowIcon size={14} weight="bold" />
              </a>
            </div>

            <div className="flex flex-col gap-4">
              {MOCK_QUESTIONS.map((q, i) => (
                <motion.a
                  key={q.id}
                  href={`/community/q/${q.id}`}
                  initial={{ opacity: 0, x: isAr ? -16 : 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 + i * 0.1, type: "spring", stiffness: 100, damping: 20 }}
                  whileHover={{ x: isAr ? -4 : 4 }}
                  className={`group flex items-start gap-4 rounded-2xl border p-5 transition-all ${
                    isDark
                      ? "border-white/10 bg-white/5 hover:bg-white/10"
                      : "border-slate-100 bg-slate-50/60 hover:bg-white hover:shadow-sm hover:border-[#0B3D2E]/20"
                  }`}
                >
                  {/* Rank */}
                  <span className={`shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold font-mono ${
                    i === 0
                      ? "bg-[#C8A762] text-white"
                      : isDark ? "bg-white/10 text-gray-300" : "bg-slate-200 text-gray-600"
                  }`}>
                    {i + 1}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-snug ${isDark ? "text-gray-200 group-hover:text-white" : "text-gray-800 group-hover:text-[#0B3D2E]"} transition-colors`}>
                      {q.title}
                    </p>
                    <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${q.categoryColor}`}>
                        {q.category}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                        <ThumbsUp size={12} /> {q.votes.toLocaleString("ar-EG")}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                        <ChatTeardropDots size={12} /> {q.answers}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                        <Eye size={12} /> {q.views.toLocaleString("ar-EG")}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                        <Clock size={12} /> {q.timeAgo}
                      </span>
                    </div>
                  </div>
                </motion.a>
              ))}
            </div>

            {/* CTA */}
            <motion.a
              href="/community/ask"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="mt-6 flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-dashed border-[#0B3D2E]/20 text-sm font-semibold text-[#0B3D2E] dark:text-emerald-400 dark:border-emerald-500/20 hover:border-[#0B3D2E]/40 dark:hover:border-emerald-500/40 transition-all"
            >
              <ChatTeardropDots size={16} weight="fill" />
              {isAr ? "اطرح سؤالك على المجتمع" : "Ask the Community"}
            </motion.a>
          </motion.div>

          {/* ── إحصائيات سريعة ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.1 }}
            className={`rounded-[2.5rem] border p-7 ${
              isDark ? "border-white/10 bg-dark-card" : "border-slate-200/60 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]"
            }`}
          >
            <div className="flex items-center gap-2 mb-6">
              <TrendUp size={18} weight="fill" className="text-[#C8A762]" />
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-700"}`}>
                {isAr ? "المجتمع بالأرقام" : "Community in Numbers"}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <StatCounter value={4820} suffix="+" label={isAr ? "سؤال في المجتمع" : "Community Questions"} isDark={isDark} />
              <StatCounter value={1240} suffix="+" label={isAr ? "إجابة موثوقة" : "Verified Answers"} isDark={isDark} />
              <StatCounter value={87} suffix="" label={isAr ? "محامٍ نشط" : "Active Lawyers"} isDark={isDark} />
              <StatCounter value={32600} suffix="+" label={isAr ? "مستخدم" : "Users"} isDark={isDark} />
            </div>
          </motion.div>

          {/* ── أكثر المحامين تفاعلاً ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.15 }}
            className={`rounded-[2.5rem] border p-7 ${
              isDark ? "border-white/10 bg-dark-card" : "border-slate-200/60 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]"
            }`}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Gavel size={18} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
                <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-700"}`}>
                  {isAr ? "أكثر المحامين تفاعلاً" : "Top Lawyers"}
                </h3>
              </div>
              <a href="/lawyers" className={`text-xs font-semibold ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>
                {isAr ? "الكل" : "All"}
              </a>
            </div>
            <div className="flex flex-col gap-4">
              {MOCK_LAWYERS.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${l.avatarColor}`}>
                    {l.avatarInitials}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{l.name}</p>
                    <p className={`text-xs truncate ${isDark ? "text-gray-500" : "text-gray-400"}`}>{l.specialty}</p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-xs font-bold text-[#C8A762] flex items-center gap-0.5 justify-end">
                      <Star size={11} weight="fill" /> {l.rating}
                    </p>
                    <p className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      {l.consultations} {isAr ? "استشارة" : "consults"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── أبرز المدونات (Row منفصلة) ── */}
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="md:col-span-3 flex items-center justify-between mb-1"
          >
            <div className="flex items-center gap-2">
              <BookOpen size={20} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
              <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>
                {isAr ? "أبرز المدونات القانونية" : "Top Legal Articles"}
              </h3>
            </div>
            <a
              href="/blog"
              className={`flex items-center gap-1.5 text-xs font-semibold transition-all hover:gap-2.5 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}
            >
              {isAr ? "كل المقالات" : "All Articles"}
              <ArrowIcon size={14} weight="bold" />
            </a>
          </motion.div>

          {MOCK_ARTICLES.map((article, i) => (
            <motion.a
              key={article.id}
              href={`/blog/${article.id}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className={`group rounded-[2rem] border p-6 flex flex-col gap-4 transition-all ${
                isDark
                  ? "border-white/10 bg-dark-card hover:bg-white/5"
                  : "border-slate-200/60 bg-white hover:shadow-lg hover:border-[#0B3D2E]/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-[#0B3D2E]/8 text-[#0B3D2E]"
                }`}>
                  {article.category}
                </span>
                <span className={`flex items-center gap-1 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  <Clock size={11} /> {article.minutesRead} {isAr ? "د" : "min"}
                </span>
              </div>

              <h4 className={`text-sm font-bold leading-snug ${
                isDark ? "text-gray-200 group-hover:text-white" : "text-gray-800 group-hover:text-[#0B3D2E]"
              } transition-colors`}>
                {article.title}
              </h4>

              <div className="mt-auto flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white bg-[#0B3D2E]`}>
                    {article.author.slice(3, 5)}
                  </span>
                  <div>
                    <p className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{article.author}</p>
                    <p className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{article.publishedAt}</p>
                  </div>
                </div>
                <span className={`flex items-center gap-1 text-xs font-mono ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  <Eye size={12} /> {article.reads.toLocaleString("ar-EG")}
                </span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
