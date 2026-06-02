"use client";

/**
 * /community/lawyers — مجتمع المحامين
 * ─────────────────────────────────────────────────────────────────────────────
 * هذه الصفحة حصرية للمحامين وأعضاء شركات المحاماة.
 * تعرض نقاشات متخصصة: مستجدات تشريعية، سوابق قضائية، تبادل خبرات.
 *
 * RBAC:
 *   - userType === "lawyer" | "firm" → وصول كامل
 *   - غير ذلك → يُعرض banner "للمحامين فقط" + زر للعودة
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, ArrowUp, ArrowDown, ChatCircle,
  Fire, Clock, BookOpen, Gavel, ShieldCheck,
  SealCheck, PencilSimple, X, Star, CaretLeft,
  CheckCircle, Lock, ArrowLeft, Users, Scales,
  Briefcase, TrendUp, Lightning, BookmarksSimple,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";
import * as PhosphorIcons from "@phosphor-icons/react";

// ─── Types ──────────────────────────────────────────────────────────────────
type LawyerCategory = string;

type SortMode = "hot" | "new" | "top";

interface LawyerPost {
  id: number;
  category: LawyerCategory;
  title: string;
  body: string;
  author: string;
  authorRating: number;
  authorYears: number;
  authorCity: string;
  answers: PostAnswer[];
  views: number;
  votes: number;
  bookmarks: number;
  isAnswered: boolean;
  isPinned?: boolean;
  ago: string;
  tags: string[];
}

interface PostAnswer {
  id: number;
  author: string;
  authorRating: number;
  authorYears: number;
  content: string;
  votes: number;
  isAccepted: boolean;
  ago: string;
}

// ─── Categories ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "all", label: "الكل", icon: BookOpen, count: 347 },
  ...LEGAL_TAXONOMY.slice(0, 7).map((cat, i) => ({
    id: cat.id,
    label: cat.label,
    icon: (PhosphorIcons as any)[cat.iconName || "BookOpen"] || BookOpen,
    count: Math.floor(Math.random() * 50) + 10 // Dynamic mock count for demo
  }))
];

// ─── Mock Posts ──────────────────────────────────────────────────────────────
const POSTS: LawyerPost[] = [
  {
    id: 101, category: "SA-00",
    title: "هل ينقطع التقادم بمجرد إيداع صحيفة الدعوى أم بتبليغها للمدعى عليه؟",
    body: "أثناء إعداد مذكرة في قضية مدنية، واجهت إشكالية تحديد لحظة انقطاع التقادم. المادة ٧٤ من نظام المرافعات تُشير إلى الإيداع، لكن هل ثمة سوابق قضائية أوسّعت أو ضيّقت هذا التفسير؟",
    author: "أ. فهد العتيبي", authorRating: 57, authorYears: 9, authorCity: "الرياض",
    views: 284, votes: 42, bookmarks: 18, isAnswered: true, isPinned: true,
    ago: "منذ ٦ ساعات",
    tags: ["تقادم", "مرافعات مدنية", "نظام المرافعات م٧٤"],
    answers: [
      {
        id: 201, author: "أ. خالد المطيري", authorRating: 127, authorYears: 14,
        content: "وفق المادة ٧٤ من نظام المرافعات، الانقطاع يحدث بمجرد إيداع صحيفة الدعوى رسمياً، لكن يزول أثره إذا انقضت الدعوى أو سقطت لأي سبب قانوني. المحكمة العليا أيّدت هذا التفسير في قرار ١٤٤٢/ق/٢١٧. الفارق الجوهري: التبليغ شرط لصحة الخصومة وليس شرطاً لانقطاع التقادم.",
        votes: 38, isAccepted: true, ago: "منذ ٥ ساعات",
      },
      {
        id: 202, author: "أ. سارة القحطاني", authorRating: 44, authorYears: 7,
        content: "أتفق مع ما ذكره الزميل. أضيف أن بعض أحكام محاكم الاستئناف اشترطت صحة الإيداع ذاته (خلو الصحيفة من عيوب جوهرية) لاعتبار الانقطاع ناجزاً.",
        votes: 14, isAccepted: false, ago: "منذ ٤.٥ ساعة",
      },
    ],
  },
  {
    id: 102, category: "SA-04",
    title: "تجربتكم في إثبات الوكالة الضمنية أمام المحكمة التجارية",
    body: "لديّ قضية يدّعي فيها المدعي عليه عدم تفويض وكيله بإبرام العقد، رغم وجود مراسلات ودوام على التعامل. ما القرائن التي اعتمدتموها في قضايا مماثلة وقُبلت أمام المحاكم التجارية؟",
    author: "أ. سارة القحطاني", authorRating: 44, authorYears: 7, authorCity: "جدة",
    views: 167, votes: 29, bookmarks: 11, isAnswered: false,
    ago: "منذ ١٢ ساعة",
    tags: ["وكالة ضمنية", "إثبات", "تجاري"],
    answers: [
      {
        id: 203, author: "أ. أحمد الغامدي", authorRating: 127, authorYears: 14,
        content: "في قضية مماثلة اعتمدت على: (١) المراسلات الرسمية التي يؤكد فيها الموكّل علمه بالتفاوض، (٢) السلوك المستمر المؤيِّد للعقد (استلام مدفوعات، تكديس بضاعة)، (٣) أي وثيقة تُثبت انتفاء الاعتراض الفوري. المحكمة التجارية تقبل القرائن المتعددة المتكاتفة كما في المادة ١٠٣ من نظام الإثبات.",
        votes: 21, isAccepted: false, ago: "منذ ١٠ ساعات",
      },
    ],
  },
  {
    id: 103, category: "SA-04",
    title: "شرط التحكيم المُدرَج في عقد إذعان — مدى نفاذه وحدوده",
    body: "هل شرط التحكيم المدرج في عقود الإذعان (كعقود الاشتراك أو الخدمات) نافذٌ تلقائياً أم يستلزم موافقة صريحة وفق نظام التحكيم السعودي الجديد؟",
    author: "أ. عمر الدوسري", authorRating: 38, authorYears: 6, authorCity: "الدمام",
    views: 129, votes: 24, bookmarks: 15, isAnswered: true,
    ago: "منذ يوم",
    tags: ["تحكيم", "عقود إذعان", "نظام التحكيم"],
    answers: [
      {
        id: 204, author: "أ. خالد المطيري", authorRating: 127, authorYears: 14,
        content: "نظام التحكيم السعودي (م. ٢) يستلزم اتفاقاً صريحاً مستقلاً أو في العقد. في عقود الإذعان، يُطعن في شرط التحكيم إذا لم يُبرَز للطرف الضعيف بشكل واضح وأُعطي فرصة معقولة للمعرفة به. محاكم الاستئناف ألغت بعض شروط التحكيم المُدرجة بخط صغير دون لفت الانتباه.",
        votes: 19, isAccepted: true, ago: "منذ ٢٢ ساعة",
      },
    ],
  },
  {
    id: 104, category: "SA-06",
    title: "احتساب مدة التقادم في دعاوى الأجور المتأخرة بعد تعديل نظام العمل",
    body: "بعد تعديلات نظام العمل الأخيرة، هل بقيت مدة التقادم في دعاوى الأجور ١٢ شهراً؟ وهل تسري على منازعات ما قبل التعديل؟",
    author: "أ. نورة السبيعي", authorRating: 29, authorYears: 5, authorCity: "جدة",
    views: 98, votes: 17, bookmarks: 8, isAnswered: false,
    ago: "منذ يومين",
    tags: ["نظام العمل", "تقادم", "أجور"],
    answers: [],
  },
];

// ─── Trending Tags ───────────────────────────────────────────────────────────
const TRENDING = [
  "نظام المرافعات", "تقادم", "وكالة ضمنية", "تحكيم", "نظام الإثبات",
  "محاكم تجارية", "إذعان", "سوابق قضائية",
];

// ─── Top Lawyers ─────────────────────────────────────────────────────────────
const TOP_LAWYERS = [
  { name: "أ. أحمد الغامدي",  rating: 127, specialty: "عمالي + مدني",  answers: 127 },
  { name: "أ. خالد المطيري",  rating: 114, specialty: "تجاري + تحكيم", answers: 114 },
  { name: "أ. سارة القحطاني", rating: 44,  specialty: "مدني + عقاري",  answers: 44  },
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function LawyersCommunityPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const isLawyer = user.userType === "lawyer" || user.userType === "firm";

  const [category, setCategory] = useState<LawyerCategory>("all");
  const [sort, setSort]         = useState<SortMode>("hot");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [mounted, setMounted]   = useState(false);

  useEffect(() => setMounted(true), []);

  const bg   = isDark ? "bg-[#0c0f12] text-white"   : "bg-gray-50 text-gray-900";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  const filtered = POSTS
    .filter(p => category === "all" || p.category === category)
    .filter(p => search === "" || p.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (b.isPinned && !a.isPinned) return 1;
      if (a.isPinned && !b.isPinned) return -1;
      if (sort === "hot") return b.votes - a.votes;
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
            <div className="flex items-center gap-2 mb-1">
              <Link href="/community" className={`text-xs flex items-center gap-1 ${muted} hover:text-current transition`}>
                <ArrowLeft size={12} /> المجتمع
              </Link>
              <span className={`text-xs ${muted}`}>/</span>
              <span className="text-xs font-bold text-[#C8A762]">مجتمع المحامين</span>
            </div>
            <h1 className="text-3xl font-black mb-1 flex items-center gap-2">
              <Gavel size={28} weight="duotone" className="text-[#C8A762]" />
              مجتمع المحامين
            </h1>
            <p className={`text-sm ${muted}`}>
              نقاشات متخصصة بين المحامين · مستجدات تشريعية · سوابق قضائية · تبادل خبرات
            </p>
          </div>
          {isLawyer && (
            <Link
              href="/community/ask?tab=lawyers"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8A762] text-[#0B3D2E] text-sm font-bold rounded-xl hover:opacity-90 transition"
            >
              <PencilSimple size={16} weight="bold" />
              اطرح موضوعاً
            </Link>
          )}
        </div>

        {/* ── Access Guard ── */}
        {!isLawyer && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className={`mb-6 flex items-start gap-4 rounded-2xl border p-5 ${
              isDark ? "bg-amber-900/10 border-amber-800/30" : "bg-amber-50 border-amber-200"
            }`}
          >
            <Lock size={22} className="text-[#C8A762] mt-0.5 flex-shrink-0" weight="fill" />
            <div className="flex-1">
              <p className={`text-sm font-bold mb-1 ${isDark ? "text-amber-300" : "text-amber-800"}`}>
                هذا القسم حصري للمحامين المسجلين
              </p>
              <p className={`text-xs ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                المحتوى متاح للقراءة فقط لغير المحامين. سجّل كمحامٍ لتشارك في النقاشات.
              </p>
            </div>
            <Link
              href="/community"
              className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl border transition ${
                isDark ? "border-amber-700 text-amber-400 hover:bg-amber-900/20" : "border-amber-300 text-amber-700 hover:bg-amber-100"
              }`}
            >
              مجتمع الأفراد
            </Link>
          </motion.div>
        )}

        {/* ── Stats Banner ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { icon: ChatCircle, label: "نقاش", value: "٣٤٧",  color: "text-[#C8A762]" },
            { icon: Users,      label: "محامٍ مشارك", value: "٢١٤", color: "text-emerald-400" },
            { icon: TrendUp,    label: "هذا الأسبوع", value: "٤٧",  color: "text-blue-400" },
            { icon: Lightning,  label: "إجابة خبير", value: "٨٩%", color: "text-purple-400" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className={`${card} px-4 py-3 flex items-center gap-3`}>
                <Icon size={18} className={s.color} weight="duotone" />
                <div>
                  <p className={`text-lg font-black ${isDark ? "text-white" : "text-gray-800"}`}>{s.value}</p>
                  <p className={`text-[11px] ${muted}`}>{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-6">
          {/* ── Left Sidebar ── */}
          <aside className="hidden lg:flex flex-col gap-4 w-56 shrink-0">

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
                        active ? "bg-[#C8A762] text-[#0B3D2E]" : `${muted} hover:bg-gray-100 dark:hover:bg-white/5`
                      }`}
                    >
                      <Icon size={14} />
                      <span className="flex-1">{cat.label}</span>
                      <span className={`text-xs ${active ? "opacity-70" : "opacity-40"}`}>{cat.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Top Contributors */}
            <div className={`${card} p-4`}>
              <p className={`text-xs font-bold mb-3 uppercase tracking-wider ${muted}`}>الأكثر إجابةً</p>
              <div className="space-y-3">
                {TOP_LAWYERS.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C8A762] to-[#b8974f] flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{l.name}</p>
                      <div className="flex items-center gap-1">
                        <Star size={10} weight="fill" className="text-[#C8A762]" />
                        <span className={`text-xs ${muted}`}>{l.rating} • {l.specialty}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trending Tags */}
            <div className={`${card} p-4`}>
              <p className={`text-xs font-bold mb-3 uppercase tracking-wider ${muted}`}>الوسوم الرائجة</p>
              <div className="flex flex-wrap gap-1.5">
                {TRENDING.map((tag, i) => (
                  <span
                    key={i}
                    className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition ${
                      isDark ? "bg-[#C8A762]/10 text-[#C8A762] hover:bg-[#C8A762]/20" : "bg-[#C8A762]/10 text-amber-700 hover:bg-[#C8A762]/20"
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </aside>

          {/* ── Main Feed ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Search + Sort */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className={`flex-1 flex items-center gap-2 rounded-xl border px-3 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
                <MagnifyingGlass size={16} color={isDark ? "#6b7280" : "#9ca3af"} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ابحث في نقاشات المحامين..."
                  className={`flex-1 py-2.5 text-sm bg-transparent outline-none ${isDark ? "text-white placeholder-gray-600" : "text-gray-900 placeholder-gray-400"}`}
                />
                {search && (
                  <button onClick={() => setSearch("")}>
                    <X size={14} color={isDark ? "#6b7280" : "#9ca3af"} />
                  </button>
                )}
              </div>
              <div className={`flex rounded-xl border overflow-hidden text-sm ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
                {(["hot", "new", "top"] as SortMode[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={`px-4 py-2.5 font-medium transition flex items-center gap-1.5 border-s first:border-s-0 ${isDark ? "border-[#2d3748]" : "border-gray-200"} ${
                      sort === s ? "bg-[#C8A762] text-[#0B3D2E]" : `${muted} hover:bg-gray-50 dark:hover:bg-white/5`
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

            {/* Posts List */}
            <AnimatePresence>
              {filtered.length === 0 ? (
                <div className={`${card} p-12 text-center`}>
                  <Gavel size={48} color="#C8A762" weight="duotone" className="mx-auto mb-4 opacity-40" />
                  <p className={`font-semibold ${isDark ? "text-gray-300" : "text-gray-600"}`}>لم يُعثر على نقاشات</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filtered.map((post, i) => {
                    const isOpen = expanded === post.id;
                    const cat = CATEGORIES.find(c => c.id === post.category);
                    return (
                      <motion.article
                        key={post.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`${card} overflow-hidden hover:border-[#C8A762]/30 transition-colors`}
                      >
                        {post.isPinned && (
                          <div className={`px-5 py-1.5 flex items-center gap-1.5 text-xs font-bold border-b ${
                            isDark ? "bg-[#C8A762]/5 border-[#C8A762]/20 text-[#C8A762]" : "bg-amber-50 border-amber-100 text-amber-700"
                          }`}>
                            <Lightning size={12} weight="fill" /> موضوع مثبّت
                          </div>
                        )}
                        <div className="p-5 flex gap-4">
                          {/* Vote */}
                          <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
                            <button className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${isDark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}>
                              <ArrowUp size={16} className="text-[#C8A762]" />
                            </button>
                            <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{post.votes}</span>
                            <button className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${isDark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}>
                              <ArrowDown size={16} className={muted} />
                            </button>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              {cat && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#C8A762]/10 text-amber-700"}`}>
                                  {cat.label}
                                </span>
                              )}
                              {post.isAnswered && (
                                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <CheckCircle size={12} weight="fill" /> تمت الإجابة
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => setExpanded(isOpen ? null : post.id)}
                              className={`text-right block text-sm font-bold leading-snug mb-2 hover:text-[#C8A762] transition ${isDark ? "text-gray-100" : "text-gray-800"}`}
                            >
                              {post.title}
                            </button>

                            <p className={`text-xs leading-relaxed mb-3 line-clamp-2 ${muted}`}>{post.body}</p>

                            <div className="flex flex-wrap gap-1 mb-3">
                              {post.tags.map((t, ti) => (
                                <span key={ti} className={`text-xs px-2 py-0.5 rounded-md ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{t}</span>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="flex items-center gap-1 text-[#C8A762] font-bold">
                                <SealCheck size={12} weight="fill" />
                                {post.author}
                                <span className={`ms-1 font-normal ${muted}`}>· {post.authorYears} سنة خبرة · {post.authorCity}</span>
                              </span>
                              <span className={muted}>·</span>
                              <span className={muted}>{post.ago}</span>
                              <span className={muted}>·</span>
                              <button
                                onClick={() => setExpanded(isOpen ? null : post.id)}
                                className={`flex items-center gap-1 font-medium hover:text-[#C8A762] transition ${muted}`}
                              >
                                <ChatCircle size={12} />
                                {post.answers.length} رد
                              </button>
                              <span className={`flex items-center gap-1 ${muted}`}>
                                <BookOpen size={12} />{post.views} مشاهدة
                              </span>
                              <span className={`flex items-center gap-1 ${muted}`}>
                                <BookmarksSimple size={12} />{post.bookmarks}
                              </span>
                            </div>
                          </div>

                          {/* Expand */}
                          <button
                            onClick={() => setExpanded(isOpen ? null : post.id)}
                            className={`flex-shrink-0 self-start mt-1 w-7 h-7 rounded-lg flex items-center justify-center transition ${isDark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
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
                                  الردود ({post.answers.length}) — مرتّبة حسب التقييم
                                </p>

                                {post.answers.length === 0 ? (
                                  <div className={`text-center py-8 ${muted}`}>
                                    <ChatCircle size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">لا توجد ردود بعد — كن أول من يشارك</p>
                                  </div>
                                ) : (
                                  post.answers.map(ans => (
                                    <div
                                      key={ans.id}
                                      className={`flex gap-3 rounded-xl p-4 ${
                                        ans.isAccepted
                                          ? isDark ? "bg-emerald-900/15 border border-emerald-800/30" : "bg-emerald-50 border border-emerald-100"
                                          : isDark ? "bg-[#C8A762]/5 border border-[#C8A762]/10" : "bg-amber-50/50 border border-amber-100"
                                      }`}
                                    >
                                      <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                                        <button className={`w-6 h-6 rounded-lg flex items-center justify-center transition ${isDark ? "hover:bg-white/10" : "hover:bg-white/60"}`}>
                                          <ArrowUp size={13} className="text-[#C8A762]" />
                                        </button>
                                        <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-600"}`}>{ans.votes}</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#C8A762]">
                                            <SealCheck size={13} weight="fill" />
                                            {ans.author}
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isDark ? "bg-[#C8A762]/20" : "bg-[#C8A762]/15"}`}>محامٍ</span>
                                          </span>
                                          <span className={`flex items-center gap-0.5 text-xs ${muted}`}>
                                            <Star size={10} weight="fill" className="text-amber-400" />
                                            {ans.authorRating} تقييم · {ans.authorYears} سنة خبرة
                                          </span>
                                          {ans.isAccepted && (
                                            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                                              <CheckCircle size={12} weight="fill" /> أفضل رد
                                            </span>
                                          )}
                                          <span className={`text-xs ${muted}`}>{ans.ago}</span>
                                        </div>
                                        <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{ans.content}</p>
                                      </div>
                                    </div>
                                  ))
                                )}

                                {isLawyer && (
                                  <div className={`flex items-center gap-3 pt-2 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                                    <Link
                                      href={`/community/${post.id}?tab=lawyers`}
                                      className="flex items-center gap-1.5 text-xs font-bold text-[#C8A762] hover:underline"
                                    >
                                      <ChatCircle size={13} /> أضف ردك
                                    </Link>
                                  </div>
                                )}
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
              <button className={`px-6 py-2.5 rounded-xl border text-sm font-medium transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                تحميل المزيد
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
