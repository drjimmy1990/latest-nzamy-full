"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Star, ChatTeardropText, ShieldCheck,
  ThumbsUp, ThumbsDown, MagnifyingGlass,
  WarningCircle, CaretDown, Export
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ────────────────────────────────────────────────────────

type Rating = 1 | 2 | 3 | 4 | 5;

interface Review {
  id: string;
  clientName: string;
  caseRef: string;
  rating: Rating;
  text: string;
  date: string;
  isVerified: boolean;
  reply?: string;
}

const MOCK_REVIEWS: Review[] = [
  {
    id: "REV-001", clientName: "شركة الأفق الحديثة", caseRef: "استشارة تجارية C-102", rating: 5,
    text: "خدمة ممتازة واحترافية عالية من المستشار سلمان العتيبي. تم إنهاء الاستشارة في وقت قياسي وبدقة متناهية.",
    date: "٢٠٢٤/٠٥/١٤", isVerified: true,
    reply: "شكراً لثقتكم بشركة نظامي للمحاماة. نسعد دائماً بخدمتكم."
  },
  {
    id: "REV-002", clientName: "أحمد عبدالله", caseRef: "قضية عمالية L-405", rating: 4,
    text: "المحامي كان متعاوناً جداً، لكن كان هناك تأخير بسيط في الرد على الاستفسارات في البداية.",
    date: "٢٠٢٤/٠٥/١٠", isVerified: true
  },
  {
    id: "REV-003", clientName: "مؤسسة الرواد", caseRef: "صياغة عقود B-099", rating: 5,
    text: "صياغة العقود كانت شاملة وحمت جميع حقوق المؤسسة. أنصح بالتعامل مع فريق الشركات في هذا المكتب.",
    date: "٢٠٢٤/٠٥/٠٥", isVerified: true,
    reply: "سعداء بخدمتكم ونسأل الله لكم التوفيق في أعمالكم."
  },
  {
    id: "REV-004", clientName: "عميل غير معروف", caseRef: "استشارة مجانية", rating: 2,
    text: "الأسعار مرتفعة مقارنة بالمكاتب الأخرى.",
    date: "٢٠٢٤/٠٤/٢٨", isVerified: false
  }
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FirmReviewsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [filterRating, setFilterRating] = useState<number | "الكل">("الكل");
  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = MOCK_REVIEWS.filter(r => 
    (filterRating === "الكل" || r.rating === filterRating) &&
    (!search || r.clientName.includes(search) || r.text.includes(search))
  );

  const averageRating = (MOCK_REVIEWS.reduce((acc, r) => acc + r.rating, 0) / MOCK_REVIEWS.length).toFixed(1);

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <Star className="text-amber-500" weight="fill" />
            التقييمات والسمعة (Reputation)
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            إدارة آراء العملاء، الرد على التقييمات، ومتابعة مستوى رضا العملاء عن خدمات المكتب
          </p>
        </div>
        <button className={`px-4 py-2.5 rounded-xl text-[12px] font-bold border transition-colors flex items-center gap-2 ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
          <Export size={15} /> تصدير التقرير
        </button>
      </motion.div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`${card} p-5 flex flex-col items-center justify-center text-center col-span-1`}>
          <p className={`text-[12px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>التقييم العام للمكتب</p>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className={`text-4xl font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{averageRating}</span>
            <span className={`text-[16px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>/ 5.0</span>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} size={18} weight={s <= parseFloat(averageRating) ? "fill" : "regular"} className={s <= parseFloat(averageRating) ? "text-amber-500" : isDark ? "text-zinc-700" : "text-slate-300"} />
            ))}
          </div>
          <p className={`text-[11px] mt-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>بناءً على {MOCK_REVIEWS.length} تقييم</p>
        </div>

        <div className={`${card} p-5 col-span-1 md:col-span-3 flex flex-col justify-center`}>
          <p className={`text-[12px] font-bold mb-4 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>توزيع التقييمات</p>
          <div className="space-y-2.5">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = MOCK_REVIEWS.filter(r => r.rating === rating).length;
              const percentage = (count / MOCK_REVIEWS.length) * 100;
              return (
                <div key={rating} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-12 shrink-0">
                    <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{rating}</span>
                    <Star size={12} weight="fill" className="text-amber-500" />
                  </div>
                  <div className={`flex-1 h-2.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} transition={{ duration: 1, ease: "easeOut" }}
                      className={`h-full rounded-full ${
                        rating >= 4 ? "bg-emerald-500" : rating === 3 ? "bg-amber-500" : "bg-red-500"
                      }`} />
                  </div>
                  <span className={`text-[11px] w-8 text-left ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${card} p-4 flex flex-col sm:flex-row gap-3`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 transition-colors ${isDark ? "bg-white/[0.04] border-white/[0.06] focus-within:border-royal/40" : "bg-zinc-50 border-zinc-200 focus-within:border-emerald-300"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث في نص التقييم أو اسم العميل..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500" dir="rtl" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(["الكل", 5, 4, 3, 2, 1] as const).map(r => (
            <button key={r} onClick={() => setFilterRating(r)}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold shrink-0 transition-all border flex items-center gap-1 ${
                filterRating === r ? "bg-[#0B3D2E] border-[#0B3D2E] text-[#C8A762]" : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
              }`}>
              {r === "الكل" ? "الكل" : <>{r} <Star size={12} weight="fill" /></>}
            </button>
          ))}
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {filtered.map((review, i) => (
          <motion.div key={review.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`${card} p-5`}>
            
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg font-bold ${
                  isDark ? "bg-white/[0.05] text-white" : "bg-slate-100 text-slate-800"
                }`}>
                  {review.clientName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{review.clientName}</p>
                    {review.isVerified && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">
                        <ShieldCheck size={12} weight="fill" /> عميل موثّق
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{review.date}</span>
                    <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>•</span>
                    <span className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{review.caseRef}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={16} weight={s <= review.rating ? "fill" : "regular"} className={s <= review.rating ? "text-amber-500" : isDark ? "text-zinc-700" : "text-slate-300"} />
                ))}
              </div>
            </div>

            <p className={`text-[13px] leading-relaxed mb-4 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
              "{review.text}"
            </p>

            {/* Reply Section */}
            {review.reply ? (
              <div className={`mt-4 p-4 rounded-xl border relative ${isDark ? "bg-emerald-900/10 border-emerald-500/20" : "bg-emerald-50/50 border-emerald-100"}`}>
                <div className={`absolute top-0 right-6 -mt-2 w-3 h-3 rotate-45 border-t border-r ${isDark ? "bg-zinc-900 border-emerald-500/20" : "bg-white border-emerald-100"}`} />
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full bg-[#0B3D2E] flex items-center justify-center">
                    <ChatTeardropText size={10} weight="fill" className="text-[#C8A762]" />
                  </div>
                  <p className={`text-[11px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>رد المكتب</p>
                </div>
                <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{review.reply}</p>
              </div>
            ) : replyingTo === review.id ? (
              <div className="mt-4 flex gap-2">
                <input type="text" value={replyText[review.id] || ""} onChange={e => setReplyText({ ...replyText, [review.id]: e.target.value })}
                  placeholder="اكتب رد المكتب هنا (سيكون مرئياً للعميل)..."
                  className={`flex-1 rounded-xl px-3 py-2 text-[12px] outline-none border transition-colors ${
                    isDark ? "bg-zinc-800 border-white/[0.06] focus:border-royal/40" : "bg-slate-50 border-slate-200 focus:border-emerald-300"
                  }`} />
                <button onClick={() => setReplyingTo(null)} className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "border-white/[0.1] text-zinc-400 hover:bg-zinc-800" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}>إلغاء</button>
                <button className="px-4 py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold hover:bg-[#0a3328] transition-colors">إرسال الرد</button>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => setReplyingTo(review.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1.5 ${isDark ? "bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                  <ChatTeardropText size={14} /> إضافة رد
                </button>
                {review.rating <= 3 && (
                  <button className={`px-3 py-1.5 rounded-lg text-[11px] font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center gap-1.5`}>
                    <WarningCircle size={14} /> فتح تذكرة شكوى
                  </button>
                )}
              </div>
            )}

          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div className={`${card} p-12 text-center`}>
            <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد تقييمات مطابقة للبحث.</p>
          </div>
        )}
      </div>
    </div>
  );
}
