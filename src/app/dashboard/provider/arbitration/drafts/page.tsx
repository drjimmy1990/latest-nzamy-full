"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  PencilSimple, Robot, Gavel, CalendarBlank, Trash,
  ArrowRight, ArrowLeft, Scales, FloppyDisk, Warning,
  Plus, Clock,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

type DraftStatus = "draft" | "review" | "finalized";

interface AwardDraft {
  id: number;
  caseNumber: string;
  parties: string;
  title: string;
  status: DraftStatus;
  lastEdited: string;
  wordCount: number;
  isAiAssisted: boolean;
}

const DRAFTS: AwardDraft[] = [
  {
    id: 1, caseNumber: "ARB-2026-001",
    parties: "البناء الحديث ضد الخليج للتطوير",
    title: "مسودة الحكم التحكيمي — النزاع العقاري",
    status: "draft", lastEdited: "منذ ٣ ساعات",
    wordCount: 2840, isAiAssisted: true,
  },
  {
    id: 2, caseNumber: "ARB-2026-002",
    parties: "الشروق للتجارة ضد التقنية المتقدمة",
    title: "مسودة حكم التحكيم — إنهاء عقد البرمجيات",
    status: "review", lastEdited: "أمس ١١:٣٠م",
    wordCount: 4120, isAiAssisted: true,
  },
];

const STATUS_CONFIG: Record<DraftStatus, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  draft:     { label: "مسودة",          bg: "bg-gray-400/10",    color: "text-gray-400",    icon: <PencilSimple size={11} /> },
  review:    { label: "قيد المراجعة",   bg: "bg-amber-500/10",   color: "text-amber-500",   icon: <Clock size={11} /> },
  finalized: { label: "نهائي",           bg: "bg-emerald-500/10", color: "text-emerald-500", icon: <Gavel size={11} weight="fill" /> },
};

export default function ArbitrationDraftsPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const bg   = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  const fadeUp = {
    hidden: { opacity: 0, y: 14 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.35 } }),
  };

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">

        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className={`text-xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
              مسودات الأحكام التحكيمية
            </h1>
            <p className={`text-sm mt-0.5 ${muted}`}>{DRAFTS.length} مسودة نشطة</p>
          </div>
          <Link href="/ai/draft?mode=arbitration"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-700 transition shadow">
            <Plus size={15} /> مسودة جديدة بالـ AI
          </Link>
        </motion.div>

        {/* AI Banner */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}
          className={`rounded-2xl p-4 flex items-center gap-4 ${
            isDark ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-indigo-50 border border-indigo-200"
          }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-indigo-500/20" : "bg-indigo-100"}`}>
            <Robot size={22} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} />
          </div>
          <div className="flex-1">
            <p className={`font-bold text-sm ${isDark ? "text-indigo-300" : "text-indigo-800"}`}>صائغ الحكم بالذكاء الاصطناعي</p>
            <p className={`text-xs mt-0.5 ${isDark ? "text-indigo-400/70" : "text-indigo-600/80"}`}>
              يُنشئ هيكل الحكم بناءً على وقائع القضية والمذكرات المرفوعة — المراجعة القانونية إلزامية قبل الإصدار.
            </p>
          </div>
          <Link href="/ai/draft?mode=arbitration"
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition ${
              isDark ? "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30" : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}>
            ابدأ <Arrow size={12} />
          </Link>
        </motion.div>

        {/* Drafts */}
        <div className="space-y-4">
          {DRAFTS.map((draft, i) => {
            const stConf = STATUS_CONFIG[draft.status];
            return (
              <motion.div key={draft.id} variants={fadeUp} initial="hidden" animate="show" custom={i + 2}
                whileHover={{ y: -2 }}
                className={`${card} p-5 shadow-sm`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-mono font-bold ${isDark ? "text-[#C8A762]" : "text-indigo-600"}`}>{draft.caseNumber}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${stConf.bg} ${stConf.color}`}>
                        {stConf.icon} {stConf.label}
                      </span>
                      {draft.isAiAssisted && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          isDark ? "bg-purple-500/10 text-purple-400" : "bg-purple-100 text-purple-600"
                        }`}>
                          <Robot size={10} /> AI
                        </span>
                      )}
                    </div>
                    <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{draft.title}</p>
                    <p className={`text-xs mt-0.5 ${muted}`}>{draft.parties}</p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className={`text-xs font-bold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{draft.wordCount.toLocaleString()} كلمة</p>
                    <div className={`flex items-center gap-1 mt-1 text-[10px] ${muted}`}>
                      <CalendarBlank size={10} /> {draft.lastEdited}
                    </div>
                  </div>
                </div>

                {/* Warning */}
                <div className={`flex items-start gap-2 rounded-xl p-3 mb-3 text-xs ${
                  isDark ? "bg-amber-500/5 border border-amber-500/15" : "bg-amber-50 border border-amber-100"
                }`}>
                  <Warning size={14} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
                  <span className={isDark ? "text-amber-400/80" : "text-amber-700"}>
                    هذه مسودة مساعِدة — تحقق قانونياً من كل البنود قبل الإصدار الرسمي.
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className={muted}>اكتمال المسودة</span>
                    <span className={isDark ? "text-indigo-400" : "text-indigo-600"} style={{ fontWeight: 700 }}>
                      {draft.status === "draft" ? "٦٠٪" : "٨٥٪"}
                    </span>
                  </div>
                  <div className={`w-full h-1.5 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-500"
                      style={{ width: draft.status === "draft" ? "60%" : "85%" }} />
                  </div>
                </div>

                <div className={`flex items-center gap-2 pt-3 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                  <Link href="/ai/draft?mode=arbitration"
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition">
                    <PencilSimple size={13} /> متابعة التحرير
                  </Link>
                  <button className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition ${
                    isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>
                    <FloppyDisk size={13} /> حفظ النسخة
                  </button>
                  <button className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition ms-auto ${
                    isDark ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20" : "bg-rose-50 text-rose-600 hover:bg-rose-100"
                  }`}>
                    <Trash size={13} /> حذف
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Empty state draft CTA */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={DRAFTS.length + 2}
          className={`${card} p-8 text-center shadow-sm border-dashed`}>
          <Scales size={36} className={`mx-auto mb-3 ${isDark ? "text-indigo-500/30" : "text-indigo-200"}`} />
          <p className={`text-sm font-bold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>ابدأ مسودة حكم جديد</p>
          <p className={`text-xs ${muted} mb-4`}>أدخل وقائع القضية والمذكرات — سيُنشئ الـ AI هيكل الحكم فوراً</p>
          <Link href="/ai/draft?mode=arbitration"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-indigo-700 transition">
            <Robot size={15} /> صائغ حكم بالـ AI <Arrow size={13} />
          </Link>
        </motion.div>

      </div>
    </div>
  );
}
