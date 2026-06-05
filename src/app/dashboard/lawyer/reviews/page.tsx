'use client';

import { motion } from 'framer-motion';
import { Star, ThumbsUp, ThumbsDown, ChatCircle, Clock, SealCheck, Warning } from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';

const MOCK_REVIEWS = [
  {
    id: 'r-1',
    client: 'شركة الأفق التجارية',
    rating: 5,
    date: 'منذ أسبوعين',
    text: 'محامٍ محترف ومتميز، أنجز قضيتنا العمالية بدقة واحترافية عالية. ننصح بشدة بالتعامل معه.',
    case: 'نزاع عمالي',
    helpful: 12,
  },
  {
    id: 'r-2',
    client: 'أحمد بن علي الزهراني',
    rating: 5,
    date: 'منذ شهر',
    text: 'تعامل مهني رائع، التزم بالمواعيد وقدّم استشارات واضحة ساعدتني على اتخاذ القرار الصحيح.',
    case: 'مكافأة نهاية الخدمة',
    helpful: 8,
  },
  {
    id: 'r-3',
    client: 'مؤسسة الريادة للتجارة',
    rating: 4,
    date: 'منذ شهرين',
    text: 'خبرة جيدة وأسلوب راقٍ في التعامل مع الملف. أتمنى تواصلاً أسرع في المستقبل.',
    case: 'عقد عمل',
    helpful: 5,
  },
  {
    id: 'r-4',
    client: 'خالد محمد العمري',
    rating: 5,
    date: 'منذ 3 أشهر',
    text: 'من أفضل المحامين الذين تعاملت معهم، ملم بأدق تفاصيل نظام العمل السعودي.',
    case: 'فصل تعسفي',
    helpful: 18,
  },
];

const AVG_RATING = 4.8;
const TOTAL = MOCK_REVIEWS.length;
const DIST = [
  { stars: 5, count: 3 },
  { stars: 4, count: 1 },
  { stars: 3, count: 0 },
  { stars: 2, count: 0 },
  { stars: 1, count: 0 },
];

export default function LawyerReviewsPage() {
  const { isDark } = useTheme();

  const card      = isDark ? 'border-white/5 bg-zinc-900/40 backdrop-blur-md' : 'border-slate-200 bg-white shadow-sm';
  const textPri   = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400'  : 'text-slate-500';
  const subCard   = isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-slate-50 border-slate-100';

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto" dir="rtl">

      {/* بيانات تجريبية Banner */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl p-4 border flex items-center gap-3 mb-5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
          <Warning size={18} weight="fill" className="text-amber-500" />
        </div>
        <div>
          <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>بيانات تجريبية</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>التقييمات ستظهر بعد تفعيل نظام التقييم</p>
        </div>
      </motion.div>

      {/* Header */}
      <div className="mb-6">
        <h1 className={`text-xl font-black ${textPri}`}>التقييمات</h1>
        <p className={`text-sm mt-0.5 ${textMuted}`}>آراء العملاء حول خدماتك</p>
      </div>

      {/* Summary */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={`rounded-2xl border ${card} p-6 mb-5`}>
        <div className="flex items-start gap-8">
          {/* Average */}
          <div className="text-center flex-shrink-0">
            <p className="text-5xl font-black text-[#C8A762] tabular-nums">{AVG_RATING}</p>
            <div className="flex items-center justify-center gap-0.5 my-1">
              {[1,2,3,4,5].map(n => (
                <Star key={n} size={14} weight="fill" className={n <= Math.round(AVG_RATING) ? 'text-[#C8A762]' : isDark ? 'text-zinc-700' : 'text-slate-200'} />
              ))}
            </div>
            <p className={`text-xs ${textMuted}`}>{TOTAL} تقييم</p>
          </div>
          {/* Distribution bars */}
          <div className="flex-1 space-y-2">
            {DIST.map(d => (
              <div key={d.stars} className="flex items-center gap-2">
                <span className={`text-xs w-4 text-left font-bold ${textMuted}`}>{d.stars}</span>
                <Star size={10} weight="fill" className="text-[#C8A762]" />
                <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.08]' : 'bg-slate-100'}`}>
                  <div
                    className="h-full bg-[#C8A762] rounded-full"
                    style={{ width: `${TOTAL ? (d.count / TOTAL) * 100 : 0}%` }}
                  />
                </div>
                <span className={`text-xs w-4 ${textMuted}`}>{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Reviews list */}
      <div className="space-y-4">
        {MOCK_REVIEWS.map((r, i) => (
          <motion.div key={r.id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.3 }}
            className={`rounded-2xl border ${card} p-5`}>
            {/* Review header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#0B3D2E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {r.client.charAt(0)}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${textPri}`}>{r.client}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} size={11} weight={r.rating >= n ? 'fill' : 'regular'}
                          className={r.rating >= n ? 'text-[#C8A762]' : isDark ? 'text-zinc-700' : 'text-slate-200'} />
                      ))}
                    </div>
                    <span className={`text-[11px] ${textMuted}`}>{r.date}</span>
                  </div>
                </div>
              </div>
              <span className={`text-[11px] px-2 py-1 rounded-lg border font-medium ${isDark ? 'bg-white/[0.04] border-white/[0.08] text-zinc-400' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                {r.case}
              </span>
            </div>
            {/* Text */}
            <p className={`text-sm leading-relaxed mb-3 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>{r.text}</p>
            {/* Footer */}
            <div className="flex items-center gap-3">
              <span className={`text-xs ${textMuted}`}>هل كان مفيداً؟</span>
              <button className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 transition-colors ${isDark ? 'text-zinc-400 hover:text-emerald-400' : 'text-slate-400 hover:text-emerald-600'}`}>
                <ThumbsUp size={12} /> {r.helpful}
              </button>
              <button className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 transition-colors ${isDark ? 'text-zinc-400 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}>
                <ThumbsDown size={12} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

    </div>
  );
}
