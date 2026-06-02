"use client";

import { motion } from "framer-motion";
import { ChatDots, Plus, Clock, CheckCircle, ArrowUpRight, CalendarBlank } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const MOCK_CONSULTS = [
  { id: "1", client: "شركة الأفق للتجارة",    topic: "خيارات إجراءات الاستئناف",        assignee: "أ. سارة المنصور",  date: "١٦ أبريل ٢٠٢٤", status: "scheduled", mode: "عبر الفيديو" },
  { id: "2", client: "أحمد الزاهد",            topic: "تطورات قضية فسخ الإيجار",         assignee: "أ. تركي العمر",    date: "١٧ أبريل ٢٠٢٤", status: "pending",   mode: "حضوري" },
  { id: "3", client: "خالد القحطاني",           topic: "مستجدات قضية الفصل التعسفي",      assignee: "أ. نورة الشمري",   date: "١٥ أبريل ٢٠٢٤", status: "completed", mode: "اتصال هاتفي" },
  { id: "4", client: "مجموعة الذهبي",           topic: "مراجعة شروط عقد البناء",           assignee: "أ. خالد الحربي",   date: "١٨ أبريل ٢٠٢٤", status: "scheduled", mode: "عبر الفيديو" },
  { id: "5", client: "شركة الإبداع التقني",     topic: "استراتيجية حماية الملكية الفكرية",assignee: "أ. نورة الشمري",   date: "١٣ أبريل ٢٠٢٤", status: "completed", mode: "حضوري" },
];

const STATUS_STYLE = {
  scheduled: { label: "مجدولة",   color: "text-royal bg-royal/10 border-royal/20",             icon: CalendarBlank },
  pending:   { label: "انتظار",   color: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: Clock },
  completed: { label: "مكتملة",  color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
};

export default function FirmConsultationsPage() {
  const { isDark } = useTheme();
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[1000px] mx-auto space-y-5" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            الاستشارات
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {MOCK_CONSULTS.filter(c => c.status !== "completed").length} قادمة · {MOCK_CONSULTS.filter(c => c.status === "completed").length} مكتملة
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
          <Plus size={15} weight="bold" />
          استشارة جديدة
        </button>
      </motion.div>

      <div className="space-y-2">
        {MOCK_CONSULTS.map((c, i) => {
          const s = STATUS_STYLE[c.status as keyof typeof STATUS_STYLE];
          const StatusIcon = s.icon;
          return (
            <motion.div key={c.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`group ${card} p-4 flex items-center gap-4 hover:border-royal/20 transition-all cursor-pointer`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                <ChatDots size={18} weight="duotone" className="text-royal" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className={`text-[13px] font-semibold flex-1 truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.topic}</p>
                  <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.color}`}>
                    <StatusIcon size={9} weight="bold" />{s.label}
                  </span>
                </div>
                <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {c.client} · {c.assignee} · {c.mode} · {c.date}
                </p>
              </div>
              <ArrowUpRight size={15} className={`flex-shrink-0 transition-colors ${isDark ? "text-zinc-700 group-hover:text-royal" : "text-slate-300 group-hover:text-royal"}`} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
