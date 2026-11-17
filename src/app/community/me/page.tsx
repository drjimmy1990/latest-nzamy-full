"use client";

/**
 * /community/me — «أسئلتي والمحفوظة» (owner TODO N05-C5)
 * ─────────────────────────────────────────────────────────────────────────────
 * The member's own community page, two tabs:
 *   - «المحفوظة»: questions he saved with «حفظ» on a question page
 *     (GET /api/v1/community/saved — his own community_saves rows; a saved
 *     question that is no longer readable drops out).
 *   - «أسئلتي»: the questions he asked (GET /api/v1/community/posts?mine=1).
 * Signed-in only — the server layout beside this file sends a guest to /login.
 * Every number and line is what the server returned; a failed read says so.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookmarkSimple, ChatCircle, ArrowUp, ArrowLeft, Warning, ArrowClockwise,
  SpinnerGap, Scales, PencilSimple, CheckCircle, X,
} from "@phosphor-icons/react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { CATEGORIES } from "@/constants/communityData";
import {
  getCommunityPosts,
  getSavedCommunityPosts,
  setCommunityPostSaved,
  type StoredCommunityQuestion,
} from "@/lib/services/communityService";
import { listOk, listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { toFeedQuestion } from "../_feedView";

type MeTab = "saved" | "mine";
const PAGE_SIZE = 20;
const arNum = (n: number) => n.toLocaleString("ar-SA");

export default function CommunityMePage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<MeTab>("saved");
  const [read, setRead] = useState<ListRead<StoredCommunityQuestion> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (offset: number) =>
      tab === "saved"
        ? getSavedCommunityPosts({ limit: PAGE_SIZE, offset })
        : getCommunityPosts({ mine: true, limit: PAGE_SIZE, offset, sort: "new" }),
    [tab],
  );

  // A slow read of the tab just left must not land on the tab now open.
  const seqRef = useRef(0);
  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setMoreFailed(false);
    setRemoveError(null);
    const result = await fetchPage(0);
    if (seq !== seqRef.current) return;
    setRead(result);
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!read || !read.ok || !read.truncated) return;
    setLoadingMore(true);
    setMoreFailed(false);
    const seq = seqRef.current;
    const next = await fetchPage(read.items.length);
    if (seq !== seqRef.current) { setLoadingMore(false); return; }
    if (!next.ok) setMoreFailed(true);
    else setRead(listOk([...read.items, ...next.items], next.total ?? read.total));
    setLoadingMore(false);
  };

  /** «إزالة من المحفوظة» — removed from the list only once the server confirms. */
  const unsave = async (key: string) => {
    if (removing) return;
    setRemoving(key);
    setRemoveError(null);
    try {
      const stillSaved = await setCommunityPostSaved(key, false);
      if (!stillSaved && read && read.ok) {
        const items = read.items.filter((q) => String(q.id) !== key);
        setRead(listOk(items, read.total !== null ? Math.max(read.total - 1, items.length) : null));
      }
    } catch (err) {
      setRemoveError(err instanceof Error && err.message ? err.message : "تعذّرت الإزالة — لم يتغيّر شيء.");
    } finally {
      setRemoving(null);
    }
  };

  if (!mounted) return null;

  const bg = isDark ? "bg-[#0c0f12] text-white" : "bg-[#f9fafb] text-zinc-900";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-slate-200"}`;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const feedState = listViewState(loading, read);
  const items = itemsOf(read).map(toFeedQuestion);

  return (
    <div className={`min-h-screen flex flex-col ${bg}`} dir="rtl">
      <Navbar />
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 pt-32 pb-10">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link href="/community" className={`text-xs flex items-center gap-1 mb-1 ${muted} hover:text-current transition`}>
              <ArrowLeft size={12} /> المجتمع القانوني
            </Link>
            <h1 className="text-2xl font-black">أسئلتي والمحفوظة</h1>
          </div>
          <Link
            href="/community/ask"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition w-fit"
          >
            <PencilSimple size={16} weight="bold" /> اطرح سؤالاً
          </Link>
        </div>

        <div className={`flex gap-1 p-1.5 rounded-2xl mb-6 w-fit border ${isDark ? "bg-[#161b22]/60 border-white/[0.06]" : "bg-white border-slate-200"}`} role="tablist">
          {([["saved", "المحفوظة"], ["mine", "أسئلتي"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition ${tab === id ? "bg-[#0B3D2E] text-white" : `${muted} hover:text-current`}`}
            >
              {id === "saved" ? <BookmarkSimple size={15} /> : <ChatCircle size={15} />}
              {label}
            </button>
          ))}
        </div>

        {removeError && (
          <p role="alert" className="mb-4 text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Warning size={14} weight="fill" className="shrink-0" /> {removeError}
          </p>
        )}

        {feedState === "loading" ? (
          <div className={`${card} p-10 text-center flex flex-col items-center`}>
            <SpinnerGap size={28} className="animate-spin text-[#C8A762] mb-3" />
            <p className={`text-sm ${muted}`}>جارٍ التحميل…</p>
          </div>
        ) : feedState === "unreadable" ? (
          <div className={`${card} p-10 text-center flex flex-col items-center`}>
            <Warning size={32} weight="fill" className="text-amber-500 mb-3" />
            <p className={`text-base font-black mb-1 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>تعذّرت القراءة</p>
            <p className={`text-sm mb-5 ${muted}`}>هذه ليست قائمة فارغة — لم نتمكّن من قراءتها الآن.</p>
            <button
              type="button"
              onClick={() => { void load(); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition"
            >
              <ArrowClockwise size={14} weight="bold" /> إعادة المحاولة
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className={`${card} p-10 text-center flex flex-col items-center`}>
            <Scales size={34} color="#C8A762" weight="duotone" className="mb-3" />
            <p className={`text-base font-black mb-1 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              {tab === "saved" ? "لا توجد أسئلة محفوظة" : "لم تطرح أي سؤال بعد"}
            </p>
            <p className={`text-sm ${muted}`}>
              {tab === "saved"
                ? "اضغط «حفظ» في صفحة أي سؤال ليظهر هنا."
                : "أسئلتك في المجتمع تظهر هنا بعد نشرها."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {read?.ok && read.total !== null && (
              <p className={`text-xs ${muted}`}>
                {read.truncated
                  ? `يُعرض ${arNum(items.length)} من ${arNum(read.total)}`
                  : `${arNum(read.total)} سؤالاً`}
              </p>
            )}
            {items.map((q) => {
              const cat = CATEGORIES.find((c) => c.id === q.category);
              return (
                <article key={q.key} className={`${card} p-4 flex items-start gap-3`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {cat && cat.id !== "all" && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-[#0B3D2E]/30 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                          {cat.label}
                        </span>
                      )}
                      {q.tab === "lawyers" && (
                        <span className="text-xs font-bold text-[#C8A762]">مجتمع المحامين</span>
                      )}
                      {q.isAnswered && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                          <CheckCircle size={12} weight="fill" /> تمت الإجابة
                        </span>
                      )}
                    </div>
                    <Link
                      href={q.href}
                      className={`block text-sm font-bold leading-snug mb-2 hover:text-[#0B3D2E] dark:hover:text-[#C8A762] transition ${isDark ? "text-zinc-100" : "text-gray-800"}`}
                    >
                      {q.title}
                    </Link>
                    <div className={`flex flex-wrap items-center gap-3 text-xs ${muted}`}>
                      {q.when && <span>{q.when}</span>}
                      <span className="flex items-center gap-1"><ChatCircle size={12} /> {arNum(q.answerCount)} إجابة</span>
                      <span className="flex items-center gap-1"><ArrowUp size={12} /> {arNum(q.votes)}</span>
                    </div>
                  </div>
                  {tab === "saved" && (
                    <button
                      type="button"
                      onClick={() => { void unsave(q.key); }}
                      disabled={removing === q.key}
                      className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition disabled:opacity-50 ${isDark ? "border-[#2d3748] text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                    >
                      <X size={12} /> إزالة من المحفوظة
                    </button>
                  )}
                </article>
              );
            })}
            {read?.ok && read.truncated && (
              <div className="text-center pt-2 space-y-2">
                {moreFailed && (
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    تعذّر تحميل المزيد — ما يظهر أعلاه لا يزال ناقصاً.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => { void loadMore(); }}
                  disabled={loadingMore}
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border text-sm font-medium transition disabled:opacity-50 ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {loadingMore ? <><SpinnerGap size={14} className="animate-spin" /> جارٍ التحميل…</> : moreFailed ? "إعادة المحاولة" : "تحميل المزيد"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
