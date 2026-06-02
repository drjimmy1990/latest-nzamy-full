"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Lock, Database, Eye, ArrowSquareOut, Sparkle,
  CheckCircle, Warning, X, UploadSimple, ShieldCheck,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const PDPL_CHECKLIST = [
  { id: 1, item: "سياسة الخصوصية محدّثة وواضحة للمستخدمين",           done: true },
  { id: 2, item: "وجود مسؤول حماية البيانات (DPO) معيّن",             done: false },
  { id: 3, item: "الحصول على موافقة المستخدم قبل جمع البيانات",        done: true },
  { id: 4, item: "تشفير البيانات الحساسة في قواعد البيانات",           done: true },
  { id: 5, item: "آلية تمكين حق المستخدم في حذف بياناته",             done: false },
  { id: 6, item: "التعامل مع طلبات نقل البيانات خارج المملكة",         done: false },
  { id: 7, item: "خطة استجابة لخرق البيانات (٧٢ ساعة للإبلاغ)",       done: true },
  { id: 8, item: "عقود معالجة البيانات مع الأطراف الثالثة",            done: false },
];

const DATA_CATEGORIES = [
  { label: "بيانات الهوية",     count: "١٢,٤٠٠",  risk: "high",   icon: Eye },
  { label: "بيانات التواصل",    count: "٨,٧٣٠",   risk: "medium", icon: Database },
  { label: "بيانات المالية",    count: "٣,٢١٠",   risk: "high",   icon: Lock },
  { label: "بيانات الاستخدام",  count: "٤٨,٠٠٠",  risk: "low",    icon: Eye },
];

export default function CorpPrivacyPage() {
  const { isDark } = useTheme();
  const [checklist, setChecklist] = useState(PDPL_CHECKLIST);

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const doneCount = checklist.filter(c => c.done).length;
  const score = Math.round((doneCount / checklist.length) * 100);

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>حامي البيانات</h1>
            <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">MAX</span>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">جديد</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            الامتثال لنظام حماية البيانات الشخصية (PDPL) — مراجعة ذكية وخطة علاجية
          </p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-purple-900/20" : "bg-purple-50"}`}>
          <Lock size={22} weight="duotone" className="text-purple-500" />
        </div>
      </div>

      {/* Score */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className={`text-[12px] font-semibold mb-0.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مستوى الامتثال — PDPL</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{doneCount} من {checklist.length} بنود مكتملة</p>
          </div>
          <span className={`text-3xl font-black ${score >= 75 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500"}`}>{score}%</span>
        </div>
        <div className={`h-2 w-full rounded-full ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 1, ease: "easeOut" }}
            className={`h-full rounded-full ${score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"}`} />
        </div>
      </div>

      {/* Checklist */}
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>قائمة الامتثال — PDPL</p>
        <div className="space-y-2.5">
          {checklist.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <button onClick={() => setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, done: !c.done } : c))}
                className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded flex items-center justify-center border transition-colors ${
                  item.done ? "bg-emerald-500 border-emerald-500" : isDark ? "border-white/[0.1]" : "border-zinc-300"
                }`}>
                {item.done && <CheckCircle size={12} className="text-white" weight="fill" />}
              </button>
              <p className={`text-[12px] leading-relaxed ${
                item.done
                  ? isDark ? "text-zinc-500 line-through" : "text-zinc-400 line-through"
                  : isDark ? "text-zinc-200" : "text-zinc-700"
              }`}>{item.item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Data categories */}
      <div>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>فئات البيانات المعالجة</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {DATA_CATEGORIES.map((cat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${card} p-3.5 shadow-sm text-center`}>
              <cat.icon size={18} weight="duotone" className={`mx-auto mb-2 ${cat.risk === "high" ? "text-red-500" : cat.risk === "medium" ? "text-amber-500" : "text-emerald-500"}`} />
              <p className={`text-[16px] font-black mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{cat.count}</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{cat.label}</p>
              <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 mt-1 inline-block ${
                cat.risk === "high" ? "bg-red-500/10 text-red-500" : cat.risk === "medium" ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
              }`}>{cat.risk === "high" ? "عالي الحساسية" : cat.risk === "medium" ? "متوسط" : "منخفض"}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* AI fix button */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>توليد خطة علاجية بالـ AI</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>خطوات عملية لسد الثغرات وتحقيق الامتثال الكامل</p>
          </div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-[12px] font-bold text-white shadow-md">
            <Sparkle size={13} weight="fill" /> توليد الخطة
          </motion.button>
        </div>
      </div>
    </div>
  );
}
