"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Gavel, CheckCircle, CalendarBlank, MapPin, Download,
  ArrowSquareOut, Scales, SealCheck, FileText, Robot,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

interface Award {
  id: number;
  caseNumber: string;
  parties: string;
  subject: string;
  issuedDate: string;
  center: string;
  amount: string;
  outcome: "claimant_wins" | "respondent_wins" | "partial" | "settlement";
  registrationNumber: string;
  isEnforced: boolean;
}

const AWARDS: Award[] = [
  {
    id: 1, caseNumber: "ARB-2025-089",
    parties: "بنك الرياض ضد شركة العقارات الذهبية",
    subject: "نزاع تمويل عقاري — إخلال بشروط العقد",
    issuedDate: "١٥ يناير ٢٠٢٦",
    center: "مركز التحكيم التجاري الخليجي",
    amount: "١٢.٥ مليون ر.س",
    outcome: "claimant_wins",
    registrationNumber: "REG-2026-0041",
    isEnforced: true,
  },
  {
    id: 2, caseNumber: "ARB-2025-074",
    parties: "شركة الوطنية للاستثمار ضد مكتب العمارة الدولي",
    subject: "خلاف عقد تصميم وإشراف على مشروع تجاري",
    issuedDate: "٣ ديسمبر ٢٠٢٥",
    center: "هيئة التحكيم التجاري بالرياض",
    amount: "٤.٢ مليون ر.س (تسوية)",
    outcome: "settlement",
    registrationNumber: "REG-2025-1189",
    isEnforced: true,
  },
  {
    id: 3, caseNumber: "ARB-2025-061",
    parties: "مؤسسة الأمل التجارية ضد موردي التجهيزات الطبية",
    subject: "نزاع عقد توريد — تأخر التسليم وعيوب المنتج",
    issuedDate: "٨ أكتوبر ٢٠٢٥",
    center: "مركز التحكيم التجاري الخليجي",
    amount: "١.٨ مليون ر.س (جزئي)",
    outcome: "partial",
    registrationNumber: "REG-2025-0887",
    isEnforced: false,
  },
];

const OUTCOME_CONFIG = {
  claimant_wins:  { label: "حُكم للمدّعي",      bg: "bg-blue-500/10",    color: "text-blue-500"    },
  respondent_wins:{ label: "حُكم للمدّعى عليه", bg: "bg-rose-500/10",    color: "text-rose-500"    },
  partial:        { label: "حكم جزئي",           bg: "bg-amber-500/10",   color: "text-amber-500"   },
  settlement:     { label: "تسوية ودّية",         bg: "bg-emerald-500/10", color: "text-emerald-500" },
};

export default function ArbitrationAwardsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const bg   = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

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
              الأحكام التحكيمية الصادرة
            </h1>
            <p className={`text-sm mt-0.5 ${muted}`}>{AWARDS.length} حكم · {AWARDS.filter(a => a.isEnforced).length} منفّذ</p>
          </div>
          <Link href="/ai/draft?mode=arbitration"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-700 transition shadow">
            <Robot size={16} /> صائغ حكم جديد (AI)
          </Link>
        </motion.div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "أحكام صادرة",  value: AWARDS.length,                                           icon: Gavel,       color: "text-indigo-500", bg: "bg-indigo-500/10" },
            { label: "منفّذة رسمياً", value: AWARDS.filter(a => a.isEnforced).length,                 icon: CheckCircle, color: "text-emerald-500",bg: "bg-emerald-500/10" },
            { label: "تسويات ودّية", value: AWARDS.filter(a => a.outcome === "settlement").length,    icon: Scales,      color: "text-amber-500",  bg: "bg-amber-500/10" },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}
                className={`${card} p-4 shadow-sm`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${kpi.bg} mb-2`}>
                  <Icon size={16} weight="fill" className={kpi.color} />
                </div>
                <p className={`text-2xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>{kpi.value}</p>
                <p className={`text-xs font-semibold mt-0.5 ${muted}`}>{kpi.label}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Awards list */}
        <div className="space-y-4">
          {AWARDS.map((award, i) => {
            const outConf = OUTCOME_CONFIG[award.outcome];
            return (
              <motion.div key={award.id} variants={fadeUp} initial="hidden" animate="show" custom={i + 4}
                whileHover={{ y: -2 }}
                className={`${card} p-5 shadow-sm`}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono font-bold ${isDark ? "text-[#C8A762]" : "text-indigo-600"}`}>{award.caseNumber}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${outConf.bg} ${outConf.color}`}>{outConf.label}</span>
                      {award.isEnforced && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center gap-1">
                          <SealCheck size={10} weight="fill" /> منفّذ
                        </span>
                      )}
                    </div>
                    <p className={`font-bold text-sm mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{award.parties}</p>
                    <p className={`text-xs ${muted}`}>{award.subject}</p>
                  </div>
                  <p className={`text-base font-black ${isDark ? "text-[#C8A762]" : "text-indigo-700"}`}>{award.amount}</p>
                </div>

                <div className={`flex flex-wrap items-center gap-4 text-xs ${muted} pt-3 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                  <span className="flex items-center gap-1"><CalendarBlank size={11} /> {award.issuedDate}</span>
                  <span className="flex items-center gap-1"><MapPin size={11} weight="fill" /> {award.center}</span>
                  <span className="flex items-center gap-1"><FileText size={11} /> {award.registrationNumber}</span>
                  <div className="flex items-center gap-2 ms-auto">
                    <button className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl transition ${
                      isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}>
                      <Download size={11} /> تحميل الحكم
                    </button>
                    <button className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl transition ${
                      isDark ? "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    }`}>
                      <ArrowSquareOut size={11} /> عرض التفاصيل
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
