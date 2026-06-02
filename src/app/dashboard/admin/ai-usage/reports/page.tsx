"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChartLineUp, ThumbsUp, ThumbsDown, Star } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const QUALITY = [
  { tool: "صائغ الأحكام",       satisfaction: 94, accuracy: 91, avg: 4.7, thumbs: 218, thumbsDown: 12 },
  { tool: "مستشار قانوني",     satisfaction: 88, accuracy: 86, avg: 4.4, thumbs: 743, thumbsDown: 89 },
  { tool: "صائغ العقود",        satisfaction: 91, accuracy: 89, avg: 4.6, thumbs: 487, thumbsDown: 43 },
  { tool: "محلل الأدلة",        satisfaction: 85, accuracy: 83, avg: 4.3, thumbs: 156, thumbsDown: 28 },
  { tool: "نماذج التحقيق",      satisfaction: 97, accuracy: 96, avg: 4.9, thumbs: 89,  thumbsDown: 3  },
];
export default function AdminAIReportsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-indigo-500/10" : "bg-indigo-50"}`}><ChartLineUp size={22} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>تقارير جودة الذكاء الاصطناعي</h1><p className={`text-xs ${muted}`}>رضا المستخدمين ودقة المخرجات لكل أداة</p></div>
        </div>
        <div className="space-y-4">
          {QUALITY.map((q, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className={`${card} p-5 shadow-sm`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{q.tool}</p>
                <div className="flex items-center gap-1">
                  <Star size={13} weight="fill" className="text-amber-500" />
                  <span className={`text-sm font-black ${isDark ? "text-white" : "text-gray-900"}`}>{q.avg}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                {[
                  { label: "رضا المستخدمين", val: q.satisfaction, color: "bg-emerald-500" },
                  { label: "دقة المخرجات",   val: q.accuracy,     color: "bg-blue-500" },
                ].map((m, j) => (
                  <div key={j}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={muted}>{m.label}</span>
                      <span className={`font-black ${isDark ? "text-gray-200" : "text-gray-700"}`}>{m.val}٪</span>
                    </div>
                    <div className={`h-2 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${m.val}%` }} transition={{ delay: i * 0.1 + j * 0.08, duration: 0.7 }}
                        className={`h-full rounded-full ${m.color}`} />
                    </div>
                  </div>
                ))}
              </div>
              <div className={`flex items-center gap-4 pt-3 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                <div className="flex items-center gap-1.5">
                  <ThumbsUp size={13} weight="fill" className="text-emerald-500" />
                  <span className={`text-xs font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{q.thumbs}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ThumbsDown size={13} weight="fill" className="text-rose-500" />
                  <span className={`text-xs font-bold ${isDark ? "text-rose-400" : "text-rose-600"}`}>{q.thumbsDown}</span>
                </div>
                <span className={`ms-auto text-[10px] ${muted}`}>معدل الرفض: {Math.round((q.thumbsDown / (q.thumbs + q.thumbsDown)) * 100)}٪</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
