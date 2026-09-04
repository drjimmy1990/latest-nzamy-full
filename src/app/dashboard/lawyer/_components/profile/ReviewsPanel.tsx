"use client";

/**
 * ReviewsPanel — the «التقييمات» tab of the lawyer's own profile (item 192).
 * ─────────────────────────────────────────────────────────
 * Self-contained: fetches its own data (`getMyReviews`) and owns its own
 * loading/unreadable/empty/ready states via listRead.ts, the same contract
 * every other honest list on this dashboard follows — a failed read must
 * never render as "no reviews yet".
 *
 * A review here is a fact about one COMPLETED request (see reviewsService.ts
 * and the migration) — never a free-floating rating, and never editable by
 * the lawyer except the one response field, once.
 */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star, ChatCircleText, Warning, ArrowClockwise, SpinnerGap, CircleNotch, PaperPlaneTilt,
} from "@phosphor-icons/react";
import EmptyState from "@/components/ui/EmptyState";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { getMyReviews, respondToReview, type Review, type ReviewStats } from "@/lib/services/reviewsService";
import { offPlatformContactIssue } from "@/lib/services/contactSanitizer";
import { toArabicDigits, countPhraseAr } from "@/lib/services/arabicCount";

interface Props {
  isDark: boolean;
}

const REVIEW_COUNT_FORMS = {
  zero: null,
  one: "تقييم واحد",
  two: "تقييمان",
  few: "تقييمات",
  many: "تقييماً",
};

function StarRow({ value, size = 13 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          weight={n <= rounded ? "fill" : "regular"}
          className={n <= rounded ? "text-[#C8A762]" : "text-slate-300 dark:text-zinc-700"}
        />
      ))}
    </div>
  );
}

function relativeDateAr(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}

export default function ReviewsPanel({ isDark }: Props) {
  const [read, setRead] = useState<{ reviews: ListRead<Review>; stats: ReviewStats | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getMyReviews().then((res) => {
      setRead(res);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const reviewsRead = read?.reviews ?? null;
  const view = listViewState(loading, reviewsRead);
  const items = itemsOf(reviewsRead);
  const stats = read?.stats ?? null;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const draftIssue = draft.trim() ? offPlatformContactIssue(draft.trim()) : null;

  async function submitResponse(reviewId: string) {
    const text = draft.trim();
    if (!text || draftIssue) return;
    setSavingId(reviewId);
    setRespondError(null);
    try {
      const updated = await respondToReview(reviewId, text);
      setRead((prev) => {
        if (!prev || !prev.reviews.ok) return prev;
        return {
          ...prev,
          reviews: {
            ...prev.reviews,
            items: prev.reviews.items.map((r) => (r.id === updated.id ? updated : r)),
          },
        };
      });
      setRespondingId(null);
      setDraft("");
    } catch (err) {
      setRespondError(err instanceof Error && err.message ? err.message : "تعذّر حفظ الردّ. حاول مرة أخرى.");
    } finally {
      setSavingId(null);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (view === "loading") {
    return (
      <div className={`${card} p-10 text-center`}>
        <SpinnerGap size={24} className="animate-spin mx-auto text-zinc-400" />
        <p className={`mt-3 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل تقييماتك…</p>
      </div>
    );
  }

  // ── Unreadable — say so, offer retry. Never fall through to "no reviews". ──
  if (view === "unreadable") {
    return (
      <div className={`${card} p-6 text-center`}>
        <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}>
          <Warning size={22} weight="duotone" className="text-amber-500" />
        </div>
        <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>تعذّرت القراءة</p>
        <p className={`text-[12px] mb-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لم نتمكن من تحميل تقييماتك. لم نعرض بيانات بديلة.</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#0a3328]"
        >
          <ArrowClockwise size={13} weight="bold" /> إعادة المحاولة
        </button>
      </div>
    );
  }

  // ── Empty — genuinely no reviews yet ────────────────────────────────────
  if (view === "empty") {
    return (
      <div className={card}>
        <EmptyState
          icon={<ChatCircleText size={26} weight="duotone" />}
          title="لا تقييمات بعد"
          description="تظهر هنا تقييمات العملاء بعد اكتمال طلباتهم."
          size="sm"
        />
      </div>
    );
  }

  const countPhrase = countPhraseAr(stats?.reviewCount ?? items.length, REVIEW_COUNT_FORMS);

  return (
    <div className="space-y-4">
      {/* Stats header */}
      <div className={`${card} p-5 flex flex-wrap items-center gap-4`}>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>
            {stats?.avgRating != null ? toArabicDigits(stats.avgRating.toFixed(1)) : "—"}
          </span>
          <StarRow value={stats?.avgRating ?? 0} size={16} />
        </div>
        {countPhrase && (
          <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{countPhrase}</span>
        )}
      </div>

      {/* List */}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {items.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`${card} p-4`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                      {r.isAnonymous || !r.reviewerName ? "عميل" : r.reviewerName}
                    </span>
                    <StarRow value={r.rating} />
                  </div>
                  {r.serviceTitleAr && (
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الخدمة: {r.serviceTitleAr}</p>
                  )}
                </div>
                <span className={`text-[11px] flex-shrink-0 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{relativeDateAr(r.createdAt)}</span>
              </div>

              {r.title && (
                <p className={`mt-2 text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{r.title}</p>
              )}
              {r.body && (
                <p className={`mt-1 text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{r.body}</p>
              )}

              {/* Response — once per review */}
              {r.response ? (
                <div className={`mt-3 rounded-xl p-3 ${isDark ? "bg-white/[0.03] border border-white/[0.05]" : "bg-slate-50 border border-slate-100"}`}>
                  <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    ردّك{r.responseAt ? ` · ${relativeDateAr(r.responseAt)}` : ""}
                  </p>
                  <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{r.response}</p>
                </div>
              ) : respondingId === r.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    autoFocus rows={2} value={draft} disabled={savingId === r.id}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="اكتب ردّك على هذا التقييم"
                    className={`w-full rounded-xl border px-3 py-2 text-[13px] outline-none disabled:opacity-50 ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}
                  />
                  {draftIssue && <p className="text-[11px] font-semibold text-red-500">{draftIssue}</p>}
                  {respondError && <p className="text-[11px] font-semibold text-red-500">{respondError}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => submitResponse(r.id)}
                      disabled={savingId === r.id || !draft.trim() || !!draftIssue}
                      className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3 py-1.5 text-[12px] font-bold text-[#C8A762] disabled:opacity-50"
                    >
                      {savingId === r.id ? <CircleNotch size={12} className="animate-spin" /> : <PaperPlaneTilt size={12} weight="bold" />}
                      إرسال الردّ
                    </button>
                    <button
                      onClick={() => { setRespondingId(null); setDraft(""); setRespondError(null); }}
                      disabled={savingId === r.id}
                      className={`text-[12px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setRespondingId(r.id); setDraft(""); setRespondError(null); }}
                  className={`mt-3 text-[12px] font-bold ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}
                >
                  ردّ
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
