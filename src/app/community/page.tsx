"use client";

/**
 * /community — المجتمع القانوني
 * ─────────────────────────────────────────────────────────────
 * تبويبان:
 *   1. "مجتمع الأفراد" (public) — الجميع يسأل، المحامون يجيبون أولاً حسب التقييم
 *   2. "مجتمع المحامين" (lawyers) — للمحامين فقط
 *
 * منطق ترتيب الردود (Public):
 *   - المحامون دائماً في المقدمة
 *   - المحامون مرتبون: التقييم الإيجابي → الخبرة → تاريخ الرد
 *   - الأفراد تحت المحامين
 *
 * RBAC:
 *   - userType === "lawyer" | "firm" → يصل لتبويب المحامين
 *   - باقي الأنواع → يرون Public فقط
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, ArrowUp, ArrowDown, CheckCircle, ChatCircle,
  Fire, Clock, BookOpen, Scales, Briefcase, House, Users,
  X, SealCheck, PencilSimple, Gavel, ShieldCheck, Warning,
  Star, CaretLeft, Plus, ChartBar
} from "@phosphor-icons/react";
import {
  type CommunityTab,
  type Category,
  type SortMode,
  type Question,
  type Answer,
  CATEGORIES,
  ALL_QUESTIONS,
  sortAnswers,
  TOP_CONTRIBUTORS,
} from "@/constants/communityData";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import Link from "next/link";
import {
  type StoredCommunityQuestion,
  readCommunityQuestionsLocal,
  COMMUNITY_UPDATED_EVENT,
} from "@/lib/communityStore";

export default function CommunityPage() {
  const { isRTL, isDark } = useTheme();
  const user = useUser();
  const isLawyer = user.userType === "lawyer" || user.userType === "firm";

  const [tab, setTab]           = useState<CommunityTab>("public");
  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort]         = useState<SortMode>("hot");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [mounted, setMounted]   = useState(false);
  const [savedQuestions, setSavedQuestions] = useState<StoredCommunityQuestion[]>([]);
  const [questionVotes, setQuestionVotes] = useState<Record<number, "up" | "down" | null>>({});

  useEffect(() => {
    setMounted(true);
    const loadSavedQuestions = () => setSavedQuestions(readCommunityQuestionsLocal());
    loadSavedQuestions();
    window.addEventListener(COMMUNITY_UPDATED_EVENT, loadSavedQuestions);
    return () => window.removeEventListener(COMMUNITY_UPDATED_EVENT, loadSavedQuestions);
  }, []);

  const bg   = isDark ? "bg-[#0c0f12] text-white"   : "bg-[#f9fafb] text-zinc-900";
  const card = `rounded-[2rem] border ${isDark ? "bg-[#161b22]/80 border-white/[0.06] backdrop-blur-xl" : "bg-white/80 border-slate-200/50 backdrop-blur-xl shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]"}`;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";

  const questions = [...savedQuestions, ...ALL_QUESTIONS];

  const getVoteCount = (question: Question) => {
    const vote = questionVotes[question.id];
    if (vote === "up") return question.votes + 1;
    if (vote === "down") return question.votes - 1;
    return question.votes;
  };

  const handleQuestionVote = (question: Question, direction: "up" | "down") => {
    setQuestionVotes((prev) => ({
      ...prev,
      [question.id]: prev[question.id] === direction ? null : direction,
    }));
  };

  // Filter questions by tab, category, search
  const filtered = questions
    .filter(q => q.tab === tab)
    .filter(q => category === "all" || q.category === category)
    .filter(q => search === "" || q.title.toLowerCase().includes(search.toLowerCase()) || q.body?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === "hot") return getVoteCount(b) - getVoteCount(a);
      if (sort === "new") return b.id - a.id;
      return b.answers.length - a.answers.length;
    });

  if (!mounted) return null;

  return (
    <div className={`min-h-screen flex flex-col ${bg}`} dir="rtl">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

        {/* ── Page Header ── */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black mb-1">المجتمع القانوني</h1>
            <p className={`text-sm ${muted}`}>
              اسأل سؤالاً قانونياً — يجيب المحامون أولاً، مرتبون حسب التقييم
            </p>
          </div>
          <Link
            href="/community/ask"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition"
          >
            <PencilSimple size={16} weight="bold" />
            اطرح سؤالاً
          </Link>
        </div>

        {/* ── Tabs ── */}
        <div className={`flex gap-1 p-1.5 rounded-2xl mb-6 w-fit backdrop-blur-md ${isDark ? "bg-[#161b22]/60 border border-white/[0.06]" : "bg-white/60 border border-slate-200/60 shadow-sm"}`}>
          <button
            onClick={() => setTab("public")}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === "public"
                ? "bg-[#0B3D2E] text-white shadow"
                : `${muted} hover:text-current`
            }`}
          >
            <Users size={15} />
            مجتمع الأفراد
            {tab !== "public" && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/10" : "bg-black/5"}`}>
                {questions.filter(q => q.tab === "public").length}
              </span>
            )}
          </button>
          {isLawyer ? (
            <button
              onClick={() => setTab("lawyers")}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === "lawyers"
                  ? "bg-[#C8A762] text-white shadow"
                  : `${muted} hover:text-current`
              }`}
            >
              <Gavel size={15} />
              مجتمع المحامين
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-[#C8A762]/10 text-[#C8A762]"}`}>
                للمحامين فقط
              </span>
            </button>
          ) : (
            <div
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold opacity-40 cursor-not-allowed select-none ${muted}`}
              title="متاح للمحامين المسجلين فقط"
            >
              <Gavel size={15} />
              مجتمع المحامين
              <ShieldCheck size={13} weight="fill" className="text-[#C8A762]" />
            </div>
          )}
        </div>

        {/* ── Tab Description Banner ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mb-5 flex items-start gap-3 rounded-[1.5rem] border p-5 backdrop-blur-sm ${
              tab === "public"
                ? isDark ? "bg-sky-900/10 border-sky-500/20" : "bg-sky-50/80 border-sky-200/60"
                : isDark ? "bg-[#C8A762]/5 border-[#C8A762]/20" : "bg-amber-50/80 border-amber-200/60"
            }`}
          >
            {tab === "public" ? (
              <>
                <Users size={20} className="text-sky-500 mt-0.5 flex-shrink-0" weight="duotone" />
                <div>
                  <p className={`text-sm font-bold mb-1 tracking-tight ${isDark ? "text-sky-300" : "text-sky-800"}`}>
                    مجتمع الأفراد
                  </p>
                  <p className={`text-[13px] leading-relaxed ${isDark ? "text-sky-400" : "text-sky-700"}`}>
                    الجميع يسأل — المحامون يجيبون أولاً مرتبين حسب التقييم الإيجابي.
                    يمكن للأفراد الإجابة أيضاً وتظهر ردودهم بعد ردود المحامين.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Gavel size={20} className="text-[#C8A762] mt-0.5 flex-shrink-0" weight="duotone" />
                <div>
                  <p className={`text-sm font-bold mb-1 tracking-tight ${isDark ? "text-[#C8A762]" : "text-amber-800"}`}>
                    مجتمع المحامين
                  </p>
                  <p className={`text-[13px] leading-relaxed ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                    نقاشات متخصصة بين المحامين — تبادل الخبرات، مناقشة المستجدات التشريعية،
                    وسوابق قضائية. المحتوى هنا موجه للمختصين القانونيين فقط.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-6">
          {/* ── Left Sidebar ── */}
          <aside className="hidden lg:flex flex-col gap-4 w-56 shrink-0 text-right">

            {/* Categories */}
            <div className={`${card} p-4`}>
              <p className={`text-xs font-bold mb-3 uppercase tracking-wider ${muted}`}>التخصصات</p>
              <div className="space-y-1">
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const active = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-right transition-all ${
                        active
                          ? "bg-[#0B3D2E] text-white"
                          : `${muted} hover:bg-gray-100 dark:hover:bg-white/5`
                      }`}
                    >
                      <Icon size={14} />
                      <span className="flex-1 text-right">{cat.label}</span>
                      <span className={`text-xs font-mono ${active ? "opacity-70" : "opacity-40"}`}>{cat.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Top Contributors */}
            <div className={`${card} p-4`}>
              <p className={`text-xs font-bold mb-3 uppercase tracking-wider ${muted}`}>أكثر المجيبين</p>
              <div className="space-y-3">
                {TOP_CONTRIBUTORS.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0B3D2E] to-[#1a5c44] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {l.name.charAt(3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{l.name}</p>
                      <div className="flex items-center gap-1">
                        <Star size={10} weight="fill" className="text-[#C8A762]" />
                        <span className={`text-[10px] ${muted} truncate`}>{l.rating} تقييم — {l.specialty}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ranking rules info */}
            <div className={`${card} p-4`}>
              <p className={`text-xs font-bold mb-2 flex items-center gap-1 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                <ChartBar size={14} /> آلية ترتيب الردود
              </p>
              <ul className={`text-xs space-y-1.5 ${muted}`}>
                <li className="flex items-start gap-1.5">
                  <SealCheck size={12} className="text-[#C8A762] mt-0.5 flex-shrink-0" weight="fill" />
                  المحامون يظهرون أولاً دائماً
                </li>
                <li className="flex items-start gap-1.5">
                  <Star size={12} className="text-amber-400 mt-0.5 flex-shrink-0" weight="fill" />
                  مرتبون حسب التقييم الإيجابي
                </li>
                <li className="flex items-start gap-1.5">
                  <ArrowUp size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" weight="bold" />
                  ثم حسب الأصوات الإيجابية
                </li>
              </ul>
            </div>
          </aside>

          {/* ── Main Feed ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Search + Sort */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className={`flex-1 flex items-center gap-2 rounded-2xl border px-4 backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-[#0B3D2E]/20 ${isDark ? "bg-[#161b22]/60 border-white/[0.06]" : "bg-white/80 border-slate-200/60 shadow-sm"}`}>
                <MagnifyingGlass size={18} className={muted} weight="duotone" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ابحث في الأسئلة..."
                  className={`flex-1 py-3.5 text-sm bg-transparent outline-none text-right ${isDark ? "text-white placeholder-zinc-500" : "text-slate-900 placeholder-slate-400"}`}
                />
                {search && (
                  <button onClick={() => setSearch("")} className="cursor-pointer">
                    <X size={14} color={isDark ? "#6b7280" : "#9ca3af"} />
                  </button>
                )}
              </div>
              <div className={`flex rounded-2xl border overflow-hidden text-sm backdrop-blur-sm ${isDark ? "bg-[#161b22]/60 border-white/[0.06]" : "bg-white/80 border-slate-200/60 shadow-sm"}`}>
                {(["hot", "new", "top"] as SortMode[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={`px-5 py-3 font-semibold transition-all flex items-center gap-2 border-s first:border-s-0 cursor-pointer ${isDark ? "border-white/[0.06]" : "border-slate-100"} ${
                      sort === s ? "bg-[#0B3D2E] text-white shadow-inner" : `${muted} hover:bg-slate-50 dark:hover:bg-white/5`
                    }`}
                  >
                    {s === "hot" && <Fire size={13} weight={sort === "hot" ? "fill" : "regular"} />}
                    {s === "new" && <Clock size={13} />}
                    {s === "top" && <ArrowUp size={13} />}
                    {s === "hot" ? "الأنشط" : s === "new" ? "الأحدث" : "الأعلى"}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile categories */}
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    category === cat.id
                      ? "bg-[#0B3D2E] text-white border-[#0B3D2E]"
                      : `${muted} border-gray-200 dark:border-[#2d3748]`
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Questions list */}
            <AnimatePresence>
              {filtered.length === 0 ? (
                <div className={`${card} p-16 text-center flex flex-col items-center justify-center min-h-[300px]`}>
                  <div className="w-20 h-20 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-5 dark:bg-zinc-800 dark:border-white/10">
                    <Scales size={36} color="#C8A762" weight="duotone" />
                  </div>
                  <p className={`text-lg font-black tracking-tight mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>لم يعثر على أسئلة</p>
                  <p className={`text-sm mb-6 ${muted}`}>جرب البحث بكلمات مختلفة أو طرح سؤال جديد</p>
                  <Link href="/community/ask" className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] shadow-md transition-all active:scale-[0.98]">
                    اطرح أول سؤال
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {filtered.map((q, i) => {
                    const cat = CATEGORIES.find(c => c.id === q.category);
                    const isOpen = expanded === q.id;
                    const sortedAnswers = sortAnswers(q.answers);

                    return (
                      <motion.article
                        key={q.id}
                        layout
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, type: 'spring', stiffness: 100, damping: 20 }}
                        className={`${card} overflow-hidden hover:border-[#0B3D2E]/30 transition-all duration-300 group text-right`}
                      >
                        {/* Question header */}
                        <div className="p-5 flex gap-4">
                          {/* Vote column */}
                          <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
                            <button
                              onClick={() => handleQuestionVote(q, "up")}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
                                questionVotes[q.id] === "up"
                                  ? "bg-[#0B3D2E] text-white"
                                  : isDark ? "hover:bg-white/10" : "hover:bg-gray-100"
                              }`}
                            >
                              <ArrowUp size={16} className="text-[#0B3D2E]" />
                            </button>
                            <span className={`text-sm font-bold font-mono ${isDark ? "text-gray-200" : "text-gray-700"}`}>{getVoteCount(q)}</span>
                            <button
                              onClick={() => handleQuestionVote(q, "down")}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
                                questionVotes[q.id] === "down"
                                  ? "bg-red-500/10 text-red-500"
                                  : isDark ? "hover:bg-white/10" : "hover:bg-gray-100"
                              }`}
                            >
                              <ArrowDown size={16} className={muted} />
                            </button>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              {cat && (
                                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${isDark ? "bg-[#0B3D2E]/30 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                                  {cat.label}
                                </span>
                              )}
                              {q.isAnswered && (
                                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                                  <CheckCircle size={12} weight="fill" /> تمت الإجابة
                                </span>
                              )}
                              {q.askerType === "lawyer" && (
                                <span className="flex items-center gap-1 text-xs text-[#C8A762] font-bold">
                                  <SealCheck size={12} weight="fill" /> محامٍ
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => setExpanded(isOpen ? null : q.id)}
                              className={`text-right w-full block text-sm font-bold leading-snug mb-3 hover:text-[#0B3D2E] dark:hover:text-[#C8A762] transition cursor-pointer ${isDark ? "text-gray-100" : "text-gray-800"}`}
                            >
                              {q.title}
                            </button>
                            {q.body && (
                              <p className={`line-clamp-2 text-[13px] leading-relaxed mb-3 ${muted}`}>
                                {q.body}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-1 mb-3">
                              {q.tags.map((t: string, ti: number) => (
                                <span key={ti} className={`text-xs px-2 py-0.5 rounded-md ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{t}</span>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className={`flex items-center gap-1 ${muted}`}>
                                {q.askerType === "lawyer" && <SealCheck size={12} className="text-[#C8A762]" weight="fill" />}
                                {q.asker}
                              </span>
                              <span className={muted}>·</span>
                              <span className={muted}>{q.ago}</span>
                              <span className={muted}>·</span>
                              <button
                                onClick={() => setExpanded(isOpen ? null : q.id)}
                                className={`flex items-center gap-1 font-bold hover:text-[#0B3D2E] dark:hover:text-[#C8A762] transition cursor-pointer ${muted}`}
                              >
                                <ChatCircle size={12} />
                                {q.answers.length} إجابة
                              </button>
                              <span className={`flex items-center gap-1 ${muted} font-mono`}>
                                <BookOpen size={12} />{q.views} مشاهدة
                              </span>
                            </div>
                          </div>

                          {/* Expand toggle */}
                          <button
                            onClick={() => setExpanded(isOpen ? null : q.id)}
                            className={`flex-shrink-0 self-start mt-1 w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${isDark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                          >
                            <motion.div animate={{ rotate: isOpen ? -90 : 0 }}>
                              <CaretLeft size={14} className={muted} />
                            </motion.div>
                          </button>
                        </div>

                        {/* Answers (expandable) */}
                        <AnimatePresence>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className={`border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}
                            >
                              <div className="p-5 space-y-4">
                                <p className={`text-xs font-bold uppercase tracking-wider ${muted}`}>
                                  الإجابات ({sortedAnswers.length}) — المحامون أولاً · مرتبة حسب التقييم
                                </p>
                                {sortedAnswers.map((ans, ai) => (
                                  <div
                                    key={ans.id}
                                    className={`flex gap-4 rounded-2xl p-5 ${
                                      ans.isAccepted
                                        ? isDark ? "bg-emerald-900/15 border border-emerald-800/30" : "bg-emerald-50/80 border border-emerald-200/60"
                                        : ans.authorType === "lawyer"
                                        ? isDark ? "bg-[#0B3D2E]/10 border border-[#0B3D2E]/20" : "bg-slate-50/80 border border-slate-200/60 shadow-sm"
                                        : isDark ? "bg-white/[0.02] border border-white/5" : "bg-white border border-slate-100"
                                    }`}
                                  >
                                    {/* Rank badge */}
                                    {ai === 0 && ans.authorType === "lawyer" && (
                                      <div className="absolute -me-2 -mt-2">
                                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#C8A762] text-white">
                                          #1
                                        </span>
                                      </div>
                                    )}

                                    {/* Vote */}
                                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                                      <button className={`w-6 h-6 rounded-lg flex items-center justify-center transition cursor-pointer ${isDark ? "hover:bg-white/10" : "hover:bg-white/60"}`}>
                                        <ArrowUp size={13} className="text-[#0B3D2E]" />
                                      </button>
                                      <span className={`text-xs font-bold font-mono ${isDark ? "text-gray-300" : "text-gray-600"}`}>{ans.votes}</span>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        {/* Author badge */}
                                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${ans.authorType === "lawyer" ? "text-[#C8A762]" : isDark ? "text-gray-300" : "text-gray-600"}`}>
                                          {ans.authorType === "lawyer" && <SealCheck size={13} weight="fill" />}
                                          {ans.author}
                                          {ans.authorType === "lawyer" && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-[#C8A762]/15 text-amber-700"}`}>محامٍ</span>}
                                        </span>
                                        {/* Rating */}
                                        {ans.authorType === "lawyer" && (
                                          <span className={`flex items-center gap-0.5 text-xs ${muted}`}>
                                            <Star size={10} weight="fill" className="text-amber-400" />
                                            <span className="font-mono">{ans.authorRating}</span> تقييم
                                            {ans.authorYears && ` · ${ans.authorYears} سنة خبرة`}
                                          </span>
                                        )}
                                        {ans.isAccepted && (
                                          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100/50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                                            <CheckCircle size={12} weight="fill" /> الإجابة المقبولة
                                          </span>
                                        )}
                                        <span className={`text-[11px] ${muted}`}>{ans.ago}</span>
                                      </div>
                                      <p className={`text-[13.5px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                                        {ans.content}
                                      </p>
                                    </div>
                                  </div>
                                ))}

                                {/* Add answer CTA */}
                                <div className={`flex items-center gap-3 pt-2 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                                  <Link
                                    href={`/community/${q.id}`}
                                    className="flex items-center gap-1.5 text-xs font-bold text-[#0B3D2E] dark:text-[#C8A762] hover:underline"
                                  >
                                    <ChatCircle size={13} />
                                    أضف إجابة
                                  </Link>
                                  <Link
                                    href={`/community/${q.id}`}
                                    className={`text-xs ${muted} hover:text-current transition`}
                                  >
                                    عرض الصفحة الكاملة ←
                                  </Link>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.article>
                    );
                  })}
                </div>
              )}
            </AnimatePresence>

            {/* Load more */}
            <div className="text-center pt-2">
              <button className={`px-6 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                تحميل المزيد
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <FloatingButtons />

      {/* ── Floating Action Button (Add Question) ── */}
      <Link
        href="/community/ask"
        className={`fixed bottom-24 left-4 md:bottom-8 md:left-8 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-[0_8px_25px_rgba(11,61,46,0.35)] transition-all duration-300 hover:scale-110 active:scale-95 group
          ${isDark ? "bg-[#C8A762] text-zinc-900 shadow-[0_8px_25px_rgba(200,167,98,0.25)]" : "bg-[#0B3D2E] text-white"}
        `}
        aria-label="إضافة سؤال جديد"
      >
        <Plus size={28} weight="bold" className="transition-transform group-hover:rotate-90" />
        {/* Tooltip */}
        <span className={`absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${isDark ? "bg-zinc-800 text-white" : "bg-white text-zinc-800"}`}>
          إضافة استفسار
        </span>
      </Link>
    </div>
  );
}
