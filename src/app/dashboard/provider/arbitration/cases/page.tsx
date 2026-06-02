"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Scales, Clock, CheckCircle, HourglassMedium, Warning,
  MagnifyingGlass, FunnelSimple, ArrowRight, Plus,
  CalendarCheck, FileText, User, Buildings,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_CASES = [
  { id: "ARB-2025-001", title: "نزاع عقد توريد مواد بناء", titleEn: "Construction Supply Contract Dispute", party1: "شركة الإنشاءات المتحدة", party2: "مورد الخرسانة الدولي", value: "٤٢٠,٠٠٠", type: "تجاري", status: "active", nextHearing: "٢٠٢٥-٠٥-١٢", stage: "جلسة أولى" },
  { id: "ARB-2025-002", title: "نزاع عقد خدمات IT", titleEn: "IT Services Contract Dispute", party1: "بنك الأمل", party2: "شركة تك سوليوشنز", value: "١,٢٠٠,٠٠٠", type: "بنكي", status: "hearing", nextHearing: "٢٠٢٥-٠٥-٠٦", stage: "تبادل مذكرات" },
  { id: "ARB-2025-003", title: "نزاع عقد إيجار تجاري", titleEn: "Commercial Lease Dispute", party1: "مجموعة الخليج العقارية", party2: "سلسلة متاجر الأفق", value: "٨٥٠,٠٠٠", type: "عقاري", status: "award", nextHearing: "—", stage: "إصدار الحكم" },
  { id: "ARB-2024-018", title: "نزاع عمالي جماعي", titleEn: "Collective Labor Dispute", party1: "مصنع السلام الكيماوي", party2: "نقابة العمال", value: "٣٣٠,٠٠٠", type: "عمالي", status: "closed", nextHearing: "—", stage: "مكتمل" },
  { id: "ARB-2025-004", title: "نزاع شراكة تجارية", titleEn: "Business Partnership Dispute", party1: "مجموعة الرواد", party2: "مجموعة الأمل للتجارة", value: "٢,٥٠٠,٠٠٠", type: "شركات", status: "active", nextHearing: "٢٠٢٥-٠٥-٢٠", stage: "كتابة دفاع" },
];

const STATUS_CONFIG: Record<string, { label: string; labelEn: string; color: string; icon: React.ElementType }> = {
  active:  { label: "نشط",          labelEn: "Active",    color: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",    icon: HourglassMedium },
  hearing: { label: "جلسة قادمة",   labelEn: "Hearing",   color: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400", icon: CalendarCheck },
  award:   { label: "إصدار حكم",    labelEn: "Award",     color: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400", icon: Scales },
  closed:  { label: "مكتمل",        labelEn: "Closed",    color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400", icon: CheckCircle },
};

const TYPE_COLORS: Record<string, string> = {
  "تجاري":  "bg-royal/5 text-royal dark:bg-royal/15 dark:text-emerald-400",
  "بنكي":   "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  "عقاري":  "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  "عمالي":  "bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400",
  "شركات":  "bg-gold/8 text-gold-dark dark:bg-gold/15 dark:text-gold",
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string | number; sub: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200/60 dark:border-dark-border bg-white dark:bg-dark-card p-5"
    >
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        <Icon size={20} weight="duotone" />
      </div>
      <div className="text-2xl font-bold text-ink dark:text-gray-100">{value}</div>
      <div className="text-xs font-medium text-ink dark:text-gray-200 mt-0.5">{label}</div>
      <div className="text-xs text-ink-faint dark:text-gray-500 mt-1">{sub}</div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ArbitrationCasesPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = MOCK_CASES.filter(c => {
    const matchSearch = c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.title.includes(search) || c.party1.includes(search) || c.party2.includes(search);
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const kpis = [
    { icon: Scales,           label: isAr ? "إجمالي القضايا"   : "Total Cases",    value: MOCK_CASES.length,                                                 sub: isAr ? "كل الحالات" : "All statuses",          color: "bg-royal/8 text-royal dark:bg-royal/20 dark:text-emerald-400" },
    { icon: HourglassMedium,  label: isAr ? "قضايا نشطة"       : "Active Cases",   value: MOCK_CASES.filter(c => c.status === "active").length,               sub: isAr ? "جارٍ النظر فيها" : "In progress",      color: "bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400" },
    { icon: CalendarCheck,    label: isAr ? "جلسة قادمة"        : "Next Hearing",   value: MOCK_CASES.filter(c => c.status === "hearing").length,              sub: isAr ? "هذا الأسبوع" : "This week",             color: "bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" },
    { icon: CheckCircle,      label: isAr ? "أحكام صادرة"       : "Awards Issued",  value: MOCK_CASES.filter(c => c.status === "closed" || c.status === "award").length, sub: isAr ? "هذا العام" : "This year", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" },
  ];

  return (
    <div className="space-y-6 p-6 lg:p-8" dir={isAr ? "rtl" : "ltr"}>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-purple-50 dark:bg-purple-500/15 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-400">
              {isAr ? "محكّم معتمد" : "Certified Arbitrator"}
            </span>
          </div>
          <h1 className="font-heading text-2xl font-bold text-ink dark:text-gray-100">
            {isAr ? "قضايا التحكيم" : "Arbitration Cases"}
          </h1>
          <p className="text-sm text-ink-muted dark:text-gray-400">
            {isAr ? "إدارة قضايا التحكيم، الجلسات، والأحكام" : "Manage arbitration cases, hearings and awards"}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)]"
        >
          <Plus size={16} weight="bold" />
          {isAr ? "قضية جديدة" : "New Case"}
        </motion.button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <KpiCard {...kpi} />
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 ${isAr ? "right-3" : "left-3"}`} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? "ابحث بالرقم أو الأطراف..." : "Search by ID or parties..."}
            className={`w-full rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card py-2.5 text-sm text-ink dark:text-gray-200 outline-none focus:border-royal dark:focus:border-gold placeholder:text-ink-faint dark:placeholder:text-gray-600 ${isAr ? "pr-9 pl-4" : "pl-9 pr-4"}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <FunnelSimple size={14} className="text-ink-muted dark:text-gray-400 shrink-0" />
          {["all", "active", "hearing", "award", "closed"].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${filterStatus === st ? "bg-royal text-white" : "border border-slate-200 dark:border-dark-border text-ink-muted dark:text-gray-400 hover:border-royal/30 hover:text-royal dark:hover:text-gold"}`}
            >
              {st === "all" ? (isAr ? "الكل" : "All") : (isAr ? STATUS_CONFIG[st]?.label : STATUS_CONFIG[st]?.labelEn)}
            </button>
          ))}
        </div>
      </div>

      {/* Cases table */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-dark-border bg-white dark:bg-dark-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-dark-border bg-slate-50 dark:bg-dark-bg/40">
                {[
                  isAr ? "رقم القضية" : "Case ID",
                  isAr ? "موضوع النزاع" : "Subject",
                  isAr ? "الأطراف" : "Parties",
                  isAr ? "قيمة النزاع" : "Value (SAR)",
                  isAr ? "النوع" : "Type",
                  isAr ? "المرحلة / الجلسة" : "Stage",
                  isAr ? "الحالة" : "Status",
                  "",
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-start text-xs font-semibold text-ink-muted dark:text-gray-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-dark-border">
              {filtered.map((c, i) => {
                const st = STATUS_CONFIG[c.status];
                const StIcon = st?.icon ?? Scales;
                return (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="group hover:bg-slate-50 dark:hover:bg-dark-bg/40 transition-colors"
                  >
                    <td className="px-4 py-3.5 text-xs font-mono font-semibold text-ink-muted dark:text-gray-400">{c.id}</td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-semibold text-ink dark:text-gray-100 line-clamp-1">{isAr ? c.title : c.titleEn}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1 text-xs text-ink-muted dark:text-gray-400">
                          <Buildings size={10} /> {c.party1}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-ink-faint dark:text-gray-500">
                          <User size={10} /> {c.party2}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-ink dark:text-gray-200 whitespace-nowrap" dir="ltr">{c.value}</td>
                    <td className="px-4 py-3.5">
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[c.type] ?? ""}`}>{c.type}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-medium text-ink dark:text-gray-200">{c.stage}</div>
                      {c.nextHearing !== "—" && (
                        <div className="text-[10px] text-ink-faint dark:text-gray-500 mt-0.5 flex items-center gap-1">
                          <Clock size={9} /> {c.nextHearing}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${st?.color}`}>
                        <StIcon size={11} weight="fill" />
                        {isAr ? st?.label : st?.labelEn}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <button className="flex items-center gap-1 text-xs font-medium text-royal dark:text-gold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {isAr ? "التفاصيل" : "Details"}
                        <ArrowRight size={12} className={isAr ? "rotate-180" : ""} />
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-ink-faint dark:text-gray-500">
                    <Warning size={32} className="mx-auto mb-2 text-ink-faint dark:text-gray-600" />
                    {isAr ? "لا توجد قضايا تطابق البحث" : "No cases match your search"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI draft shortcut */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl border border-purple-100 dark:border-purple-500/20 bg-gradient-to-r from-purple-50 to-white dark:from-purple-500/10 dark:to-dark-card p-5 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400">
            <FileText size={22} weight="duotone" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink dark:text-gray-100">
              {isAr ? "صائغ حكم التحكيم (AI)" : "AI Arbitration Award Drafter"}
            </div>
            <div className="text-xs text-ink-muted dark:text-gray-400">
              {isAr ? "أنشئ مسودة حكم تحكيم في ثوانٍ باستخدام الذكاء الاصطناعي" : "Draft an award in seconds using AI assistance"}
            </div>
          </div>
        </div>
        <a
          href="/ai/draft?mode=arbitration"
          className="flex shrink-0 items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(124,58,237,0.4)] hover:bg-purple-700 transition-colors"
        >
          {isAr ? "ابدأ الآن" : "Start Now"}
          <ArrowRight size={14} className={isAr ? "rotate-180" : ""} />
        </a>
      </motion.div>
    </div>
  );
}
