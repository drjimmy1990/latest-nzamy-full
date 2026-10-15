"use client";

/**
 * /community/lawyers — مجتمع المحامين
 * ─────────────────────────────────────────────────────────────────────────────
 * Real lawyers-only posts (`visibility = 'lawyers_only'`) from
 * GET /api/v1/community/posts?tab=lawyers, through the same view model as
 * /community (../_feedView.ts).
 *
 * This page used to render a hardcoded POSTS array — four discussions by
 * named lawyers with ratings, cities, court-decision numbers and answers — a
 * stats banner («٣٤٧ نقاش · ٢١٤ محامٍ مشارك · ٨٩٪»), category counts drawn
 * from Math.random(), a «الأكثر إجابةً» list and «الوسوم الرائجة», none of it
 * read from anywhere. All of that is gone; what is left is what the database
 * returns, or an honest empty/failed state.
 *
 * What the database returns is narrow today: the community_posts SELECT
 * policy shows a `lawyers_only` post to its AUTHOR only, so a lawyer sees
 * their own lawyers-only topics here and not their colleagues' — a policy
 * change, not a page change (see the report for this branch).
 *
 * RBAC:
 *   - userType === "lawyer" | "firm" → the feed
 *   - غير ذلك → banner "للمحامين فقط" + زر للعودة
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  MagnifyingGlass, ArrowUp, ChatCircle, Fire, Clock, BookOpen, Gavel,
  PencilSimple, X, CheckCircle, Lock, ArrowLeft, Warning, ArrowClockwise, SpinnerGap,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import { CATEGORIES, type Category, type SortMode } from "@/constants/communityData";
import { getCommunityPosts, type StoredCommunityQuestion } from "@/lib/services/communityService";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { toFeedQuestion, filterAndSortFeed } from "../_feedView";

const PAGE_SIZE = 20;
const arNum = (n: number) => n.toLocaleString("ar-SA");

export default function LawyersCommunityPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const isLawyer = user.userType === "lawyer" || user.userType === "firm";

  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort] = useState<SortMode>("new");
  const [search, setSearch] = useState("");
  const [read, setRead] = useState<ListRead<StoredCommunityQuestion> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getCommunityPosts({ tab: "lawyers", limit: PAGE_SIZE });
    setRead(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user.loading || !isLawyer) return;
    void load();
  }, [user.loading, isLawyer, load]);

  const bg = isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  const feedState = listViewState(loading, read);
  const posts = filterAndSortFeed(itemsOf(read).map(toFeedQuestion), {
    tab: "lawyers",
    category,
    search,
    sort,
  });
  const truncated = feedState === "ready" && read?.ok && read.truncated && read.total !== null
    ? `يُعرض ${arNum(read.items.length)} من ${arNum(read.total)} موضوعاً.`
    : null;

  return (
    <div className={`min-h-screen flex flex-col ${bg}`} dir="rtl">
      <Navbar />

      {/* pt-32 clears the fixed z-50 Navbar — same convention as /laws. */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 pt-32 pb-8">

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
              نقاشات بين المحامين · مستجدات تشريعية · تبادل خبرات
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
        {!user.loading && !isLawyer && (
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
                سجّل الدخول بحساب محامٍ لقراءة النقاشات والمشاركة فيها.
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

        {isLawyer && (
          <div className="space-y-4">
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
                  <button onClick={() => setSearch("")} aria-label="مسح البحث">
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

            {/* Categories — no counts: nothing counts them. */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    category === cat.id
                      ? "bg-[#C8A762] text-[#0B3D2E] border-[#C8A762]"
                      : `${muted} border-gray-200 dark:border-[#2d3748]`
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {truncated && (
              <p className={`text-xs ${isDark ? "text-amber-400" : "text-amber-700"}`}>{truncated}</p>
            )}

            {feedState === "loading" ? (
              <div className={`${card} p-12 text-center`}>
                <SpinnerGap size={28} className="animate-spin text-[#C8A762] mx-auto mb-3" />
                <p className={`text-sm ${muted}`}>جارٍ تحميل النقاشات…</p>
              </div>
            ) : feedState === "unreadable" ? (
              <div className={`${card} p-12 text-center`}>
                <Warning size={36} weight="fill" className="text-amber-500 mx-auto mb-3" />
                <p className={`font-bold mb-1 ${isDark ? "text-zinc-200" : "text-gray-800"}`}>تعذّرت قراءة النقاشات</p>
                <p className={`text-sm mb-5 ${muted}`}>هذه ليست قائمة فارغة — لم نتمكّن من القراءة.</p>
                <button
                  type="button"
                  onClick={() => { void load(); }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition"
                >
                  <ArrowClockwise size={14} weight="bold" /> إعادة المحاولة
                </button>
              </div>
            ) : posts.length === 0 ? (
              <div className={`${card} p-12 text-center`}>
                <Gavel size={48} color="#C8A762" weight="duotone" className="mx-auto mb-4 opacity-40" />
                <p className={`font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-600"}`}>لا توجد نقاشات ظاهرة لك هنا بعد</p>
                <p className={`text-sm ${muted}`}>ابدأ أول موضوع في مجتمع المحامين.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map(post => {
                  const cat = CATEGORIES.find(c => c.id === post.category);
                  return (
                    <Link
                      key={post.key}
                      href={post.href}
                      className={`${card} block p-5 hover:border-[#C8A762]/40 transition-colors`}
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {cat && cat.id !== "all" && (
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
                      <p className={`text-sm font-bold leading-snug mb-2 ${isDark ? "text-zinc-100" : "text-gray-800"}`}>{post.title}</p>
                      {post.body && <p className={`text-xs leading-relaxed mb-3 line-clamp-2 ${muted}`}>{post.body}</p>}
                      <div className={`flex flex-wrap items-center gap-3 text-xs ${muted}`}>
                        {post.when && <span>{post.when}</span>}
                        <span className="flex items-center gap-1"><ChatCircle size={12} />{arNum(post.answerCount)} رد</span>
                        <span className="flex items-center gap-1"><BookOpen size={12} />{arNum(post.views)} مشاهدة</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
