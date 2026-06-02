"use client";

import { motion } from "framer-motion";
import { CopySimple, Plus, MagnifyingGlass, FileText, ArrowUpRight } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

const MOCK_TEMPLATES = [
  { id: "1", name: "عقد الخدمات القانونية القياسي",     category: "عقود", uses: 47, updated: "مارس ٢٠٢٤" },
  { id: "2", name: "لائحة دعوى ابتدائية — تجاري",        category: "مذكرات", uses: 31, updated: "أبريل ٢٠٢٤" },
  { id: "3", name: "اتفاقية عدم إفصاح (NDA)",            category: "عقود", uses: 23, updated: "فبراير ٢٠٢٤" },
  { id: "4", name: "صحيفة اعتراض — استئناف",             category: "مذكرات", uses: 18, updated: "يناير ٢٠٢٤" },
  { id: "5", name: "عقد توكيل رسمي",                     category: "توكيلات", uses: 62, updated: "مارس ٢٠٢٤" },
  { id: "6", name: "مذكرة جوابية — قضايا عمالية",        category: "مذكرات", uses: 15, updated: "أبريل ٢٠٢٤" },
];

export default function FirmTemplatesPage() {
  const { isDark } = useTheme();
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            النماذج القياسية
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {MOCK_TEMPLATES.length} نموذج قياسي للمكتب
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai/draft" className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <ArrowUpRight size={15} />
            صياغة بـ AI
          </Link>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />
            نموذج جديد
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {MOCK_TEMPLATES.map((t, i) => (
          <motion.div key={t.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`group ${card} p-4 hover:border-royal/20 transition-all cursor-pointer flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-royal/10" : "bg-royal/8"}`}>
              <FileText size={18} weight="duotone" className="text-royal" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{t.name}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {t.category} · استخدم {t.uses} مرة · {t.updated}
              </p>
            </div>
            <CopySimple size={15} className={`flex-shrink-0 transition-colors ${isDark ? "text-zinc-700 group-hover:text-zinc-400" : "text-slate-300 group-hover:text-royal"}`} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
