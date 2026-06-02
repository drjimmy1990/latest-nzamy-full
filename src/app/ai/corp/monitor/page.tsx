"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Bell, ArrowSquareOut, Sparkle, Clock,
  Newspaper, Tag, BookOpen, Check,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const MOCK_UPDATES = [
  {
    id: 1, date: "٢٠٢٦/٤/١", urgency: "high",
    title: "تعديلات جديدة على نظام حماية البيانات الشخصية",
    body: "أصدرت الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا) لوائح تنفيذية محدّثة تُلزم الشركات بتعيين مسؤول حماية بيانات خلال ٩٠ يوماً.",
    tags: ["PDPL", "سدايا", "امتثال"],
    impact: "يُلزمك بتحديث سياسة الخصوصية وتعيين DPO",
  },
  {
    id: 2, date: "٢٠٢٦/٣/٢٨", urgency: "medium",
    title: "تحديث نسب نيتاقات للقطاع التقني",
    body: "وزارة الموارد البشرية عدّلت نسب التوطين لشركات التقنية — الحد الأدنى انتقل من ١٥% إلى ١٨% للشركات بين ٢٠–٤٩ موظفاً.",
    tags: ["نيتاقات", "توطين", "HR"],
    impact: "راجع نسبة السعودة لديك حالاً",
  },
  {
    id: 3, date: "٢٠٢٦/٣/١٥", urgency: "low",
    title: "مبادرة التوسع الإقليمي — تسهيل التراخيص",
    body: "أعلنت وزارة الاستثمار عن تخفيض رسوم التراخيص لشركات التقنية المتوسطة بنسبة ٢٥٪ لدعم التوسع الإقليمي.",
    tags: ["استثمار", "تراخيص", "فرص"],
    impact: "فرصة لتوسيع النشاط بتكلفة أقل",
  },
  {
    id: 4, date: "٢٠٢٦/٣/٥", urgency: "medium",
    title: "تعديل اشتراطات العقود الحكومية",
    body: "ديوان المظالم أصدر تعميماً يُلزم الشركات بإدراج بند التحكيم المحلي في العقود مع الجهات الحكومية.",
    tags: ["عقود", "حكومة", "تحكيم"],
    impact: "أدرج بند التحكيم في عقودك الحكومية الجديدة",
  },
];

const URGENCY = {
  high:   { label: "عاجل",    color: "text-red-500",    bg: "bg-red-500/10",    dot: "bg-red-500"    },
  medium: { label: "مهم",     color: "text-amber-500",  bg: "bg-amber-500/10",  dot: "bg-amber-500"  },
  low:    { label: "للاطلاع", color: "text-blue-500",   bg: "bg-blue-500/10",   dot: "bg-blue-500"   },
};

export default function CorpMonitorPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [dismissed, setDismissed] = useState<number[]>([]);

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const visible = MOCK_UPDATES.filter(u => !dismissed.includes(u.id) && (filter === "all" || u.urgency === filter));

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>راصد التشريعات</h1>
            <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">MAX</span>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">جديد</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            متابعة تلقائية للأنظمة والتعاميم السارية — تنبيه فوري بما يؤثر على نشاطك
          </p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-purple-900/20" : "bg-purple-50"}`}>
          <Bell size={22} weight="duotone" className="text-purple-500" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "عاجل", count: MOCK_UPDATES.filter(u => u.urgency === "high").length,   color: "text-red-500",   bg: isDark ? "bg-red-500/5 border-red-700/20" : "bg-red-50 border-red-200" },
          { label: "مهم",  count: MOCK_UPDATES.filter(u => u.urgency === "medium").length, color: "text-amber-500", bg: isDark ? "bg-amber-500/5 border-amber-700/20" : "bg-amber-50 border-amber-200" },
          { label: "هذا الشهر", count: MOCK_UPDATES.length, color: "text-purple-500",     bg: isDark ? "bg-purple-500/5 border-purple-700/20" : "bg-purple-50 border-purple-200" },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl border p-4 text-center ${s.bg}`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.count}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "high", "medium", "low"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold border transition-all ${
              filter === f
                ? "bg-[#0B3D2E] border-[#0B3D2E] text-white"
                : isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-white text-zinc-500"
            }`}>
            {f === "all" ? "الكل" : URGENCY[f].label}
          </button>
        ))}
      </div>

      {/* Updates feed */}
      <div className="space-y-3">
        {visible.map((update, i) => {
          const u = URGENCY[update.urgency as keyof typeof URGENCY];
          return (
            <motion.div key={update.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${card} p-4 shadow-sm`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1.5">
                  <div className={`h-2.5 w-2.5 rounded-full ${u.dot}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] rounded-full px-2 py-0.5 font-bold ${u.bg} ${u.color}`}>{u.label}</span>
                    <span className={`text-[10px] flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      <Clock size={9} /> {update.date}
                    </span>
                  </div>
                  <p className={`text-[13px] font-bold mb-1.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{update.title}</p>
                  <p className={`text-[12px] leading-relaxed mb-2 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{update.body}</p>
                  <div className={`flex items-start gap-1.5 rounded-lg p-2 mb-2 ${isDark ? "bg-[#C8A762]/5 border border-[#C8A762]/15" : "bg-amber-50 border border-amber-200"}`}>
                    <Sparkle size={11} className="text-[#C8A762] flex-shrink-0 mt-0.5" weight="fill" />
                    <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      <span className="font-bold text-[#C8A762]">تأثير عليك: </span>{update.impact}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {update.tags.map(tag => (
                      <span key={tag} className={`text-[10px] rounded-full px-2 py-0.5 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>
                        #{tag}
                      </span>
                    ))}
                    <button className={`ms-auto flex items-center gap-1 text-[11px] ${isDark ? "text-zinc-600 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
                      <ArrowSquareOut size={11} /> التفاصيل
                    </button>
                    <button onClick={() => setDismissed(p => [...p, update.id])}
                      className={`flex items-center gap-1 text-[11px] ${isDark ? "text-zinc-700 hover:text-zinc-500" : "text-zinc-300 hover:text-zinc-500"}`}>
                      <Check size={11} /> تمت القراءة
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
        {visible.length === 0 && (
          <div className={`${card} p-8 text-center`}>
            <Bell size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
            <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>لا توجد تحديثات في هذه الفئة</p>
          </div>
        )}
      </div>
    </div>
  );
}
