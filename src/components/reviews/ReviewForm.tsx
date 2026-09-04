"use client";

/**
 * ReviewForm.tsx — item 192, client side. A client reviews a COMPLETED
 * request once (DB: unique per request; RLS: only its requester). This
 * component only ever renders when the caller has already established that —
 * it does not itself check eligibility (see reviewsService.getReviewableRequests
 * and the mount sites on the request detail screens).
 *
 * The off-platform-contact check runs inline, on the exact same function
 * (offPlatformContactIssue) the route re-runs before insert — so this screen
 * never disagrees with the server about what it is about to refuse.
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { Star, Warning, CheckCircle, EyeSlash } from "@phosphor-icons/react";
import { submitReview, type Review } from "@/lib/services/reviewsService";
import { offPlatformContactIssue } from "@/lib/services/contactSanitizer";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

const MAX_TITLE_LENGTH = 120; // mirrors POST /api/v1/reviews
const MAX_BODY_LENGTH = 2000; // mirrors POST /api/v1/reviews

const STAR_LABELS = ["سيئ جداً", "سيئ", "متوسط", "جيد", "ممتاز"] as const;

export interface ReviewFormProps {
  requestId: string;
  lawyerName: string;
  isDark: boolean;
  /** Fires once, right after the review is saved — with the saved row, so the
   * caller can drop this request out of any "still eligible" list it holds. */
  onSubmitted?: (review: Review) => void;
}

export default function ReviewForm({ requestId, lawyerName, isDark, onSubmitted }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The saved row IS the read-only view — no re-fetch needed, submitReview()
  // already returns exactly what the server stored.
  const [saved, setSaved] = useState<Review | null>(null);

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const titleIssue = trimmedTitle ? offPlatformContactIssue(trimmedTitle) : null;
  const bodyIssue = trimmedBody ? offPlatformContactIssue(trimmedBody) : null;
  const canSubmit = rating >= 1 && rating <= 5 && !titleIssue && !bodyIssue && !submitting;

  const card = isDark
    ? "rounded-2xl border border-white/[0.08] bg-zinc-900/60"
    : "rounded-2xl border border-zinc-200 bg-white";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const review = await submitReview({
        requestId,
        rating: rating as 1 | 2 | 3 | 4 | 5,
        title: trimmedTitle || undefined,
        body: trimmedBody || undefined,
        isAnonymous,
      });
      setSaved(review);
      onSubmitted?.(review);
    } catch (err) {
      // apiMutate throws `Error(<the Arabic reason the route sent>)` — on a
      // duplicate review that text IS «قيّمت هذا الطلب من قبل» (the route's
      // 23505 branch), so echoing the message covers that case and every
      // other refusal the route can return without a status-code switch.
      setError(err instanceof Error && err.message ? err.message : "تعذّر إرسال التقييم. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  if (saved) {
    return (
      <div className={`${card} p-5 space-y-3`} dir="rtl">
        <div className="flex items-center gap-2 text-emerald-500">
          <CheckCircle size={18} weight="fill" />
          <span className="text-[13px] font-black">تم إرسال تقييمك، شكراً لك</span>
        </div>
        <div className="flex items-center gap-1" aria-label={`تقييمك: ${saved.rating} من ٥`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              size={16}
              weight={n <= saved.rating ? "fill" : "regular"}
              className={n <= saved.rating ? "text-amber-400" : isDark ? "text-zinc-700" : "text-zinc-300"}
            />
          ))}
        </div>
        {saved.title && (
          <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{saved.title}</p>
        )}
        {saved.body && (
          <p className={`text-[12.5px] leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
            {saved.body}
          </p>
        )}
        {saved.isAnonymous && (
          <p className={`text-[11px] font-bold flex items-center gap-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            <EyeSlash size={12} /> نُشر تقييمك دون اسمك
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`${card} p-5 space-y-4`} dir="rtl">
      <div>
        <h3 className={`text-[13px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>
          قيّم تجربتك مع {lawyerName}
        </h3>
        <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {BETA_MONOPOLY_MODE
            ? "تقييمك يُحفظ في ملف المحامي وسيظهر لعملاء آخرين متى فُتح دليل المحامين العام — غير مُفعَّل خلال مرحلة التجربة الحالية."
            : "تقييمك يساعد عملاء آخرين ويظهر في ملف المحامي العام."}
        </p>
      </div>

      {/* Five real buttons — reachable with Tab, activated with Enter/Space,
          each independently labelled. Not an ARIA radio pattern (which needs
          roving-tabindex arrow-key nav to be correct) — a plain toggle group
          is the simpler contract that stays accessible without it. */}
      <div role="group" aria-label="التقييم من ١ إلى ٥ نجوم" className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={rating === n}
            aria-label={`${n} من ٥ — ${STAR_LABELS[n - 1]}`}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            onFocus={() => setHoverRating(n)}
            onBlur={() => setHoverRating(0)}
            onClick={() => setRating(n)}
            className="p-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Star
              size={22}
              weight={(hoverRating || rating) >= n ? "fill" : "regular"}
              className={(hoverRating || rating) >= n ? "text-amber-400" : isDark ? "text-zinc-700" : "text-zinc-300"}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className={`text-[11px] font-bold mr-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            {STAR_LABELS[rating - 1]}
          </span>
        )}
      </div>

      {/* Title (optional) */}
      <div>
        <label htmlFor="review-title" className="sr-only">عنوان التقييم</label>
        <input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="عنوان التقييم (اختياري)"
          className={`w-full rounded-xl text-[12.5px] px-3.5 py-2.5 outline-none border ${
            isDark
              ? "bg-white/[0.03] border-white/10 text-white placeholder:text-zinc-600"
              : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
          }`}
        />
        {titleIssue && (
          <p className="text-[11px] font-bold text-rose-500 mt-1 flex items-center gap-1">
            <Warning size={12} weight="fill" /> {titleIssue}
          </p>
        )}
      </div>

      {/* Body (optional, ≤2000) */}
      <div>
        <label htmlFor="review-body" className="sr-only">نص التقييم</label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY_LENGTH}
          rows={4}
          placeholder="اكتب تجربتك مع المحامي (اختياري)"
          className={`w-full rounded-xl text-[12.5px] px-3.5 py-2.5 outline-none border resize-none ${
            isDark
              ? "bg-white/[0.03] border-white/10 text-white placeholder:text-zinc-600"
              : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
          }`}
        />
        <div className="flex items-center justify-between mt-1 gap-2">
          {bodyIssue ? (
            <p className="text-[11px] font-bold text-rose-500 flex items-center gap-1">
              <Warning size={12} weight="fill" /> {bodyIssue}
            </p>
          ) : <span />}
          <span className={`text-[10px] font-mono flex-shrink-0 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            {body.length.toLocaleString("ar-SA")}/{MAX_BODY_LENGTH.toLocaleString("ar-SA")}
          </span>
        </div>
      </div>

      {/* «تقييم مجهول» */}
      <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="w-4 h-4 rounded accent-emerald-600"
        />
        <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>تقييم مجهول</span>
      </label>

      {error && (
        <div
          role="alert"
          className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] font-bold ${
            isDark ? "border-rose-900/40 bg-rose-900/15 text-rose-300" : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          <Warning size={14} weight="fill" className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[12.5px] font-black transition-colors hover:bg-[#0a3328] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "جارٍ الإرسال…" : "إرسال التقييم"}
      </button>
    </form>
  );
}
