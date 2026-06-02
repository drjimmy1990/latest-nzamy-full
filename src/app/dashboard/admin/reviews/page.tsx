"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, MagnifyingGlass, ThumbsUp, ThumbsDown, User } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const REVIEWS = [
  { id: 1, reviewer: "أ. سارة العمري",      target: "صائغ الأحكام",    rating: 5, text: "أداة مذهلة وفّرت وقتاً طويلاً في صياغة الأحكام.",   date: "٢٥ أبريل", status: "معلّق" },
  { id: 2, reviewer: "شركة المستقبل",       target: "المستشار القانوني",rating: 4, text: "جيد جداً لكن أحتاج تفصيل أكثر في المصادر.",          date: "٢٤ أبريل", status: "منشور" },
  { id: 3, reviewer: "جمعية البيئة",         target: "صائغ عقود التطوع",rating: 5, text: "دقيق ومتوافق مع نظام التطوع السعودي.",               date: "٢٣ أبريل", status: "منشور" },
  { id: 4, reviewer: "أ. خالد الدوسري",     target: "محلل الأدلة",     rating: 2, text: "أخطأ في تقدير قوة الدليل الرقمي — يحتاج تحسين.",   date: "٢٢ أبريل", status: "معلّق" },
];
export default function AdminReviewsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const filtered = REVIEWS.filter(r => r.reviewer.includes(search) || r.target.includes(search));
  const pending = REVIEWS.filter(r => r.status === "معلّق").length;
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}><Star size={22} weight="duotone" className={isDark ? "text-amber-400" : "text-amber-600"} /></div>
            <div>
              <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>تقييمات المستخدمين</h1>
              <p className={`text-xs ${muted}`}>{pending > 0 ? <span className="text-amber-500 font-bold">{pending} تقييم معلّق للمراجعة</span> : "لا توجد تقييمات معلّقة"}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-white"}`}>
            <MagnifyingGlass size={13} className={muted} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className={`bg-transparent outline-none text-sm w-28 ${isDark ? "text-gray-200 placeholder:text-gray-600" : "text-gray-800 placeholder:text-gray-400"}`} />
          </div>
        </div>
        <div className="space-y-3">
          {filtered.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className={`${card} p-4 shadow-sm`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? "bg-white/5" : "bg-gray-100"}`}><User size={14} className={muted} /></div>
                  <div>
                    <p className={`text-xs font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{r.reviewer}</p>
                    <p className={`text-[10px] ${isDark ? "text-[#C8A762]" : "text-amber-600"} font-semibold`}>{r.target}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex">{Array.from({ length: 5 }).map((_, j) => (<Star key={j} size={11} weight={j < r.rating ? "fill" : "regular"} className={j < r.rating ? "text-amber-500" : isDark ? "text-gray-700" : "text-gray-300"} />))}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === "معلّق" ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>{r.status}</span>
                </div>
              </div>
              <p className={`text-xs mb-3 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r.text}</p>
              {r.status === "معلّق" && (
                <div className={`flex gap-2 pt-3 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition">
                    <ThumbsUp size={11} /> نشر
                  </button>
                  <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${isDark ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20" : "bg-rose-50 text-rose-600 hover:bg-rose-100"}`}>
                    <ThumbsDown size={11} /> رفض
                  </button>
                  <span className={`ms-auto text-[10px] self-center ${muted}`}>{r.date}</span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
