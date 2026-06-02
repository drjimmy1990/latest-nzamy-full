"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  Star, ThumbsUp, ChatText, Flag, SmileyMeh, SmileyWink,
  SmileySad, ArrowRight, Funnel,
} from "@phosphor-icons/react";

// ── Types & Mock data ──────────────────────────────────────────────────────────────

interface Review {
  id: number;
  client: string;
  initial: string;
  rating: number;
  date: string;
  tags: string[];
  text: string;
  topic: string;
  helpful: number;
  replied: boolean;
}

const REVIEWS: Review[] = [
  {
    id: 1, client: "محمد الحارثي", initial: "م", rating: 5,
    date: "٧ أبريل ٢٠٢٦", tags: ["سريع الاستجابة", "خبرة عالية", "شرح واضح"],
    text: "تجربة ممتازة بكل المقاييس. أسلوب شرح واضح ومباشر، وساعدني في اتخاذ قرار صواب في وقت ضيق.",
    topic: "نزاع عقاري", helpful: 4, replied: false,
  },
  {
    id: 2, client: "سارة المطيري", initial: "س", rating: 5,
    date: "٦ أبريل ٢٠٢٦", tags: ["موثوق", "متعمق في القانون"],
    text: "محامية محترفة، تجيب بدقة ووضوح دون تعقيد. سأتواصل معها مجدداً.",
    topic: "عقد عمل", helpful: 2, replied: true,
  },
  {
    id: 3, client: "نوف القرني", initial: "ن", rating: 4,
    date: "٤ أبريل ٢٠٢٦", tags: ["سريع الاستجابة"],
    text: "استشارة مفيدة وشاملة. كنت أتمنى لو استغرقت وقتاً أطول لكن التوقيت كان محدوداً.",
    topic: "قضية عمالية", helpful: 1, replied: false,
  },
  {
    id: 4, client: "خالد العتيبي", initial: "خ", rating: 5,
    date: "٣ أبريل ٢٠٢٦", tags: ["خبرة عالية", "موثوق", "شرح واضح"],
    text: "اجتماع مطوّل وتفصيلي جداً. غطّى كل جوانب العقد وأضاف ملاحظات قيّمة لم أكن منتبهاً لها.",
    topic: "عقد شراكة", helpful: 5, replied: true,
  },
  {
    id: 5, client: "ريم السلمي", initial: "ر", rating: 3,
    date: "٢ أبريل ٢٠٢٦", tags: [],
    text: "الاستشارة كانت مفيدة، لكنني أتمنى تفصيلاً أكبر في الردود. بشكل عام مقبولة.",
    topic: "مشكلة مع مقاول", helpful: 0, replied: false,
  },
];

const RATING_DIST = [
  { stars: 5, count: 3 },
  { stars: 4, count: 1 },
  { stars: 3, count: 1 },
  { stars: 2, count: 0 },
  { stars: 1, count: 0 },
];

const avgRating = REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length;

// ── Star display ───────────────────────────────────────────────────────────────

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          weight={i <= rating ? "fill" : "regular"}
          className={i <= rating ? "text-[#C8A762]" : "text-zinc-300 dark:text-zinc-600"}
        />
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProviderReviewsPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<number | null>(null);
  const [replyOpen, setReplyOpen] = useState<number | null>(null);

  const surface = isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white";

  const displayed = filter ? REVIEWS.filter(r => r.rating === filter) : REVIEWS;

  const sentimentIcon = avgRating >= 4.5 ? SmileyWink : avgRating >= 3.5 ? SmileyMeh : SmileySad;
  const SentimentIcon = sentimentIcon;

  return (
    <main className={`min-h-screen py-8 px-4 ${isDark ? "bg-zinc-950" : "bg-zinc-50/50"}`}>
      <div className="mx-auto max-w-3xl space-y-6">

          {/* Header */}
          <div>
            <h1 className={`font-brand text-2xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>التقييمات</h1>
            <p className={`mt-0.5 text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>ما يقوله عملاؤك عنك</p>
          </div>

          {/* Summary card */}
          <div className={`flex flex-col gap-6 rounded-2xl border p-6 sm:flex-row sm:items-center ${surface}`}>
            {/* Avg rating */}
            <div className="flex flex-col items-center gap-2 sm:w-36 shrink-0">
              <SentimentIcon size={28} className="text-[#C8A762]" />
              <span className={`font-brand text-5xl font-extrabold ${isDark ? "text-white" : "text-zinc-900"}`}>
                {avgRating.toFixed(1)}
              </span>
              <StarRow rating={Math.round(avgRating)} size={16} />
              <span className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{REVIEWS.length} تقييم</span>
            </div>

            {/* Bar distribution */}
            <div className="flex-1 space-y-2">
              {RATING_DIST.map(({ stars, count }) => (
                <div key={stars} className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 w-16 justify-end">
                    <span className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{stars}</span>
                    <Star size={10} weight="fill" className="text-[#C8A762]" />
                  </div>
                  <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                    <motion.div
                      className="h-2 rounded-full bg-[#C8A762]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / REVIEWS.length) * 100}%` }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                  <span className={`w-4 text-xs text-end ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{count}</span>
                </div>
              ))}
            </div>

            {/* Top tags */}
            <div className="shrink-0 space-y-1.5">
              <p className={`text-xs font-semibold mb-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>أبرز ما ذكره العملاء</p>
              {["سريع الاستجابة", "خبرة عالية", "شرح واضح"].map(tag => (
                <div key={tag} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-50 text-zinc-600"}`}>
                  <ThumbsUp size={11} className="text-emerald-500" />
                  {tag}
                </div>
              ))}
            </div>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Funnel size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
            {[null, 5, 4, 3, 2, 1].map(f => (
              <button
                key={String(f)}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? "border-[#0B3D2E] bg-[#0B3D2E]/10 text-[#0B3D2E] dark:border-[#C8A762]/50 dark:bg-[#C8A762]/10 dark:text-[#C8A762]"
                    : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-zinc-500"
                }`}
              >
                {f === null ? "الكل" : <><Star size={10} weight="fill" className="text-[#C8A762]" />{f}</>}
              </button>
            ))}
          </div>

          {/* Reviews list */}
          <div className="space-y-4">
            {displayed.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-2xl border p-5 ${surface}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-zinc-500"}`}>
                      {r.initial}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{r.client}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{r.topic} — {r.date}</p>
                    </div>
                  </div>
                  <StarRow rating={r.rating} size={13} />
                </div>

                <p className={`text-sm leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{r.text}</p>

                {r.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.tags.map(tag => (
                      <span key={tag} className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center gap-4">
                  <button className={`flex items-center gap-1.5 text-xs ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
                    <ThumbsUp size={13} />
                    مفيد ({r.helpful})
                  </button>
                  {!r.replied ? (
                    <button
                      onClick={() => setReplyOpen(replyOpen === r.id ? null : r.id)}
                      className={`flex items-center gap-1.5 text-xs font-medium ${isDark ? "text-[#C8A762]/70 hover:text-[#C8A762]" : "text-[#0B3D2E]/70 hover:text-[#0B3D2E]"}`}
                    >
                      <ChatText size={13} />
                      رد على التقييم
                    </button>
                  ) : (
                    <span className={`flex items-center gap-1.5 text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      <ChatText size={11} />
                      رددت على هذا التقييم
                    </span>
                  )}
                  <button className={`ms-auto flex items-center gap-1.5 text-xs ${isDark ? "text-zinc-600 hover:text-red-400" : "text-zinc-400 hover:text-red-500"}`}>
                    <Flag size={12} />
                    إبلاغ
                  </button>
                </div>

                <AnimatePresence>
                  {replyOpen === r.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className={`mt-3 rounded-xl border p-3 ${isDark ? "border-white/[0.05] bg-zinc-800/50" : "border-slate-100 bg-slate-50"}`}>
                        <textarea
                          rows={3}
                          placeholder="اكتب ردّك على هذا التقييم..."
                          className={`w-full resize-none bg-transparent text-sm outline-none ${isDark ? "placeholder:text-zinc-600 text-zinc-300" : "placeholder:text-zinc-400 text-zinc-700"}`}
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button onClick={() => setReplyOpen(null)} className={`text-xs px-3 py-1.5 rounded-lg ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>إلغاء</button>
                          <button
                            onClick={() => setReplyOpen(null)}
                            className="rounded-lg bg-[#0B3D2E] px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            إرسال الرد
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

      </div>
    </main>
  );
}
