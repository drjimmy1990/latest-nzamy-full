"use client";

import { motion } from "framer-motion";
import { Bank, ShieldCheck } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import circuitsRawData from "@/data/circuits-directory.json";
import { CircuitsDirectory, type CircuitRecord } from "@/components/directory/CircuitsDirectory";

// ─── Data ─────────────────────────────────────────────────────────────────────

const ALL_CIRCUITS: CircuitRecord[] = (circuitsRawData as { circuits: CircuitRecord[] }).circuits;

// The counts come from the data, not the page: the 36 «مرجّحة» rows this page
// once counted by hand were adopted by the owner's answer ١٩٢ (2026-10-16).
const fmt = (n: number) => n.toLocaleString("en-US");
const TOTAL_COUNT = ALL_CIRCUITS.length;
const FLAGGED_COUNT = ALL_CIRCUITS.filter((c) => c.needsVerification).length;
const APPROVED_COUNT = TOTAL_COUNT - FLAGGED_COUNT;
const CATEGORY_COUNT = new Set(ALL_CIRCUITS.map((c) => c.category)).size;

const REGIONS = [
  "منطقة الرياض",
  "منطقة مكة المكرمة",
  "المنطقة الشرقية",
  "منطقة المدينة المنورة",
  "منطقة القصيم",
  "منطقة عسير",
  "منطقة تبوك",
  "منطقة حائل",
  "منطقة الحدود الشمالية",
  "منطقة جازان",
  "منطقة نجران",
  "منطقة الباحة",
  "منطقة الجوف"
];

// ─── Main Page Component ──────────────────────────────────────────────────────
// Owner note ٠٧: the search, filters and list are the one shared
// CircuitsDirectory (cross-field operator search, multi-colour highlight,
// infinite scroll, one-click copy); this page keeps its header and stats.

export default function CircuitsEmailsPage() {
  const { isDark } = useTheme();

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h1 className={`text-xl font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <Bank className="text-royal" weight="duotone" />
            دليل إيميلات الدوائر القضائية والجهات العدلية
          </h1>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck size={14} weight="fill" />
            الدليل الرسمي لوزارة العدل (٢,١٩٢ جهة ودائرة)
          </span>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          الدليل الرقمي الكامل لعناوين البريد الإلكتروني للمحاكم والدوائر وكتابات العدل وإدارات وزارة العدل في كافة مناطق المملكة.
        </p>
      </motion.div>

      {/* Official Directory Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${card} p-3.5 text-center`}>
          <p className="text-[11px] text-zinc-500">إجمالي الجهات والدوائر</p>
          <p className="text-lg font-bold text-royal font-mono">{fmt(TOTAL_COUNT)}</p>
        </div>
        <div className={`${card} p-3.5 text-center`}>
          <p className="text-[11px] text-zinc-500">العناوين المعتمدة</p>
          <p className="text-lg font-bold text-emerald-500 font-mono">{fmt(APPROVED_COUNT)}</p>
        </div>
        <div className={`${card} p-3.5 text-center`}>
          <p className="text-[11px] text-zinc-500">أنواع الجهات</p>
          <p className="text-lg font-bold text-amber-500 font-mono">{fmt(CATEGORY_COUNT)}</p>
        </div>
        <div className={`${card} p-3.5 text-center`}>
          <p className="text-[11px] text-zinc-500">المناطق المغطاة</p>
          <p className="text-lg font-bold text-blue-500 font-mono">13 منطقة</p>
        </div>
      </div>

      <CircuitsDirectory
        circuits={ALL_CIRCUITS}
        isDark={isDark}
        regions={REGIONS}
        showCategoryFilter
        showVerificationFilter
      />
    </div>
  );
}
