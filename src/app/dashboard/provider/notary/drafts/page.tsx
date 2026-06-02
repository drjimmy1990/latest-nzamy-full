"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PencilSimple, Stamp, Plus, Trash, FloppyDisk, Warning, Robot, Clock } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

interface Draft {
  id: number; title: string; type: string;
  status: "مسودة" | "جاهز للتوثيق";
  lastEdited: string; progress: number;
}
const DRAFTS: Draft[] = [
  { id: 1, title: "عقد بيع عقاري — أرض الرياض",    type: "بيع عقاري",    status: "مسودة",            lastEdited: "منذ ساعتين", progress: 65 },
  { id: 2, title: "وكالة عامة — أ. محمد الشهراني", type: "وكالة عامة",   status: "جاهز للتوثيق",   lastEdited: "أمس ٣:٠٠م",  progress: 100 },
];
export default function NotaryDraftsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-violet-500/10" : "bg-violet-50"}`}><PencilSimple size={22} weight="duotone" className={isDark ? "text-violet-400" : "text-violet-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>مسودات التوثيق</h1><p className={`text-xs ${muted}`}>{DRAFTS.length} مسودة نشطة</p></div>
          </div>
          <Link href="/ai/draft?mode=notary"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 transition">
            <Plus size={15} /> مسودة جديدة
          </Link>
        </div>
        {/* AI Banner */}
        <div className={`rounded-2xl p-4 flex items-center gap-4 ${isDark ? "bg-violet-500/10 border border-violet-500/20" : "bg-violet-50 border border-violet-200"}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-violet-500/20" : "bg-violet-100"}`}>
            <Robot size={22} weight="duotone" className={isDark ? "text-violet-400" : "text-violet-600"} />
          </div>
          <div className="flex-1">
            <p className={`font-bold text-sm ${isDark ? "text-violet-300" : "text-violet-800"}`}>صائغ عقود التوثيق بالذكاء الاصطناعي</p>
            <p className={`text-xs mt-0.5 ${isDark ? "text-violet-400/70" : "text-violet-600/80"}`}>أدخل بيانات الأطراف والموضوع — سيُنشئ الـ AI مسودة التوثيق فوراً</p>
          </div>
          <Link href="/ai/draft?mode=notary"
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition ${isDark ? "bg-violet-500/20 text-violet-300 hover:bg-violet-500/30" : "bg-violet-600 text-white hover:bg-violet-700"}`}>
            ابدأ
          </Link>
        </div>
        {/* Drafts */}
        <div className="space-y-4">
          {DRAFTS.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              whileHover={{ y: -2 }} className={`${card} p-5 shadow-sm`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.status === "جاهز للتوثيق" ? "bg-emerald-500/10 text-emerald-500" : "bg-gray-400/10 text-gray-400"}`}>{d.status}</span>
                    <span className={`text-[10px] ${isDark ? "text-[#C8A762]" : "text-violet-600"} font-semibold`}>{d.type}</span>
                  </div>
                  <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{d.title}</p>
                  <div className={`flex items-center gap-1 mt-0.5 text-[10px] ${muted}`}><Clock size={10} /> {d.lastEdited}</div>
                </div>
                <p className={`text-lg font-black ${d.progress === 100 ? "text-emerald-500" : isDark ? "text-violet-400" : "text-violet-600"}`}>{d.progress}٪</p>
              </div>
              <div className={`h-1.5 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"} mb-4`}>
                <div className={`h-full rounded-full ${d.progress === 100 ? "bg-emerald-500" : "bg-gradient-to-r from-violet-600 to-purple-500"}`} style={{ width: `${d.progress}%` }} />
              </div>
              {d.status !== "جاهز للتوثيق" && (
                <div className={`flex items-start gap-2 p-2.5 rounded-xl mb-3 text-xs ${isDark ? "bg-amber-500/5 border border-amber-500/15" : "bg-amber-50 border border-amber-100"}`}>
                  <Warning size={12} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
                  <span className={isDark ? "text-amber-400/80" : "text-amber-700"}>المراجعة القانونية إلزامية قبل التوثيق الرسمي.</span>
                </div>
              )}
              <div className={`flex gap-2 pt-3 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                <Link href="/ai/draft?mode=notary" className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition">
                  <PencilSimple size={12} /> تحرير
                </Link>
                {d.progress === 100 && (
                  <button className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition">
                    <Stamp size={12} /> توثيق رسمي
                  </button>
                )}
                <button className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  <FloppyDisk size={12} /> حفظ
                </button>
                <button className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition ms-auto ${isDark ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20" : "bg-rose-50 text-rose-600 hover:bg-rose-100"}`}>
                  <Trash size={12} /> حذف
                </button>
              </div>
            </motion.div>
          ))}
        </div>
        {/* Empty CTA */}
        <div className={`${card} p-8 text-center shadow-sm border-dashed`}>
          <Stamp size={32} className={`mx-auto mb-3 ${isDark ? "text-violet-500/30" : "text-violet-200"}`} />
          <p className={`text-sm font-bold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>ابدأ مسودة توثيق جديدة</p>
          <p className={`text-xs ${muted} mb-4`}>أدخل بيانات الأطراف والعقد — سيُنشئ الـ AI الصيغة فوراً</p>
          <Link href="/ai/draft?mode=notary" className="inline-flex items-center gap-2 bg-violet-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-violet-700 transition">
            <Robot size={15} /> صائغ بالـ AI
          </Link>
        </div>
      </div>
    </div>
  );
}
