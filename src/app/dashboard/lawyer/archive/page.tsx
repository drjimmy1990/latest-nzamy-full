"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive, MagnifyingGlass, Gavel, User, FileText,
  FolderOpen, ArrowCounterClockwise, Eye, CaretLeft,
  Clock, Buildings, Tag, CalendarBlank, ArrowUpRight,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityKind = "case" | "client" | "contract" | "document";

interface ArchiveEntry {
  id:          string;
  kind:        EntityKind;
  title:       string;         // اسم القضية / الموكل / العقد / المستند
  subtitle:    string;         // الموكل / النوع / الطرف / القضية المرتبطة
  reason:      string;         // سبب الأرشفة (مغلقة / منتهي / غير نشط...)
  reasonColor: string;
  date:        string;         // تاريخ الأرشفة / آخر نشاط
  meta?:       string;         // معلومة إضافية (قيمة العقد / حجم الملف...)
  href:        string;         // رابط الصفحة الأصلية
  canRestore:  boolean;
}

// ─── Mock Aggregated Archive Data ─────────────────────────────────────────────
// In production: fetched from a shared archiveStore / API

const ARCHIVE_DATA: ArchiveEntry[] = [
  // ── القضايا المغلقة ───────────────────────────────────────────────
  {
    id: "c1", kind: "case",
    title:    "مطالبة إدارية — التأمينات",
    subtitle: "علي السبيعي · المحكمة الإدارية",
    reason:   "صدر حكم نهائي", reasonColor: "text-slate-500 bg-slate-100 dark:bg-white/[0.04]",
    date:     "يوليو ٢٠٢٣", meta: "١٢٠,٠٠٠ ﷼",
    href:     "/dashboard/lawyer/cases",
    canRestore: true,
  },
  {
    id: "c2", kind: "case",
    title:    "قضية جمارك — مجموعة الذهبي",
    subtitle: "مجموعة الذهبي · المحكمة التجارية",
    reason:   "مؤرشفة يدوياً", reasonColor: "text-purple-500 bg-purple-500/10",
    date:     "مارس ٢٠٢٣", meta: "٤٥,٠٠٠ ﷼",
    href:     "/dashboard/lawyer/cases",
    canRestore: true,
  },
  // ── العملاء غير النشطين ──────────────────────────────────────────
  {
    id: "cl1", kind: "client",
    title:    "علي السبيعي",
    subtitle: "فرد · لا قضايا نشطة",
    reason:   "غير نشط", reasonColor: "text-slate-500 bg-slate-100 dark:bg-white/[0.04]",
    date:     "منذ شهرين", meta: "٦,٠٠٠ ﷼ مسدد بالكامل",
    href:     "/dashboard/lawyer/clients",
    canRestore: true,
  },
  {
    id: "cl2", kind: "client",
    title:    "مجموعة الرياض العقارية",
    subtitle: "شركة · ٣ قضايا مغلقة",
    reason:   "غير نشط", reasonColor: "text-slate-500 bg-slate-100 dark:bg-white/[0.04]",
    date:     "منذ شهر", meta: "١٢٠,٠٠٠ ﷼ مسدد بالكامل",
    href:     "/dashboard/lawyer/clients",
    canRestore: true,
  },
  {
    id: "cl3", kind: "client",
    title:    "ريم المطيري",
    subtitle: "فرد · تعامل صعب",
    reason:   "غير نشط — متأخر بالسداد", reasonColor: "text-red-500 bg-red-500/10",
    date:     "منذ شهر", meta: "١٤,٠٠٠ ﷼ غير مسددة",
    href:     "/dashboard/lawyer/clients",
    canRestore: true,
  },
  // ── العقود المنتهية ───────────────────────────────────────────────
  {
    id: "ct1", kind: "contract",
    title:    "وكالة قانونية — السبيعي",
    subtitle: "وكالة قانونية · علي السبيعي",
    reason:   "منتهية الصلاحية", reasonColor: "text-amber-600 bg-amber-500/10",
    date:     "٣١ ديسمبر ٢٠٢٣", meta: "انتهت منذ ٤ أشهر",
    href:     "/dashboard/lawyer/contracts",
    canRestore: false,
  },
  // ── المستندات المؤرشفة ────────────────────────────────────────────
  {
    id: "d1", kind: "document",
    title:    "صحيفة دعوى — قضية الفصل التعسفي",
    subtitle: "مذكرات · قضائية",
    reason:   "مؤرشف يدوياً", reasonColor: "text-purple-500 bg-purple-500/10",
    date:     "أبريل ٢٠٢٣", meta: "٢.٤ ميغابايت",
    href:     "/dashboard/lawyer/documents",
    canRestore: false,
  },
  {
    id: "d2", kind: "document",
    title:    "تقرير خبير — نزاع الميراث",
    subtitle: "تقارير خبراء · مدني",
    reason:   "مؤرشف يدوياً", reasonColor: "text-purple-500 bg-purple-500/10",
    date:     "يناير ٢٠٢٣", meta: "١.٨ ميغابايت",
    href:     "/dashboard/lawyer/documents",
    canRestore: false,
  },
];

// ─── Config ───────────────────────────────────────────────────────────────────

const KIND_CONFIG: Record<EntityKind, {
  label: string; icon: React.ElementType;
  bg: string; color: string; border: string;
}> = {
  case:     { label: "قضايا",    icon: Gavel,    bg: "bg-blue-500/10",   color: "text-blue-500",   border: "border-blue-500/20" },
  client:   { label: "موكلون",   icon: User,     bg: "bg-emerald-500/10",color: "text-emerald-500",border: "border-emerald-500/20" },
  contract: { label: "عقود",     icon: FileText, bg: "bg-amber-500/10",  color: "text-amber-600",  border: "border-amber-500/20" },
  document: { label: "مستندات",  icon: FolderOpen,bg:"bg-purple-500/10", color: "text-purple-500", border: "border-purple-500/20" },
};

const SORT_OPTIONS = [
  { key: "date",  label: "الأحدث أرشفةً" },
  { key: "alpha", label: "أبجدياً" },
  { key: "kind",  label: "بالنوع" },
] as const;

type SortKey = typeof SORT_OPTIONS[number]["key"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UnifiedArchivePage() {
  const { isDark } = useTheme();

  const [search,     setSearch]     = useState("");
  const [kindFilter, setKindFilter] = useState<EntityKind | "all">("all");
  const [sortKey,    setSortKey]    = useState<SortKey>("date");
  const [restored,   setRestored]   = useState<Set<string>>(new Set());
  const [toast,      setToast]      = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const handleRestore = (entry: ArchiveEntry) => {
    setRestored(prev => new Set([...prev, entry.id]));
    showToast(`✅ تم استعادة "${entry.title}" — ستجده في قسمه المعني`);
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ARCHIVE_DATA
      .filter(e => !restored.has(e.id))
      .filter(e => kindFilter === "all" || e.kind === kindFilter)
      .filter(e => !q ||
        e.title.toLowerCase().includes(q) ||
        e.subtitle.toLowerCase().includes(q) ||
        e.reason.toLowerCase().includes(q) ||
        e.meta?.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (sortKey === "alpha") return a.title.localeCompare(b.title, "ar");
        if (sortKey === "kind")  return a.kind.localeCompare(b.kind);
        return 0; // date — original order (mock)
      });
  }, [search, kindFilter, sortKey, restored]);

  const counts = useMemo(() => ({
    all:      ARCHIVE_DATA.filter(e => !restored.has(e.id)).length,
    case:     ARCHIVE_DATA.filter(e => e.kind === "case"     && !restored.has(e.id)).length,
    client:   ARCHIVE_DATA.filter(e => e.kind === "client"   && !restored.has(e.id)).length,
    contract: ARCHIVE_DATA.filter(e => e.kind === "contract" && !restored.has(e.id)).length,
    document: ARCHIVE_DATA.filter(e => e.kind === "document" && !restored.has(e.id)).length,
  }), [restored]);

  return (
    <div className="max-w-[1000px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              isDark ? "bg-purple-500/15" : "bg-purple-500/10"
            }`}>
              <Archive size={20} weight="duotone" className="text-purple-500" />
            </div>
            <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}
              style={{ fontFamily: "var(--font-brand)" }}>
              الأرشيف القانوني
            </h1>
          </div>
          <p className={`text-sm pr-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {counts.all} عنصر مؤرشف · مستودع استرجاع دائم — لا يُحذف تلقائياً
          </p>
        </div>

        {/* Sort */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] flex-shrink-0 ${
          isDark ? "border-white/[0.06] bg-zinc-900/60 text-zinc-400" : "border-slate-200 bg-white text-slate-500"
        }`}>
          <CalendarBlank size={13} />
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="bg-transparent outline-none text-[12px] cursor-pointer">
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </motion.div>

      {/* Info banner */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-[12px] ${
          isDark ? "border-purple-500/15 bg-purple-500/5 text-purple-300" : "border-purple-100 bg-purple-50 text-purple-700"
        }`}>
        <Archive size={15} className="flex-shrink-0 mt-0.5" />
        <p>
          <strong>الأرشيف القانوني الموحّد</strong> — يجمع القضايا المغلقة، الموكلين غير النشطين، العقود المنتهية، والمستندات المؤرشفة في مكان واحد.
          العناصر هنا للعرض والاسترجاع فقط — لا يتم تعديلها من هنا. يمكنك استعادة أي عنصر بضغطة واحدة.
        </p>
      </motion.div>

      {/* Search */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
        isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"
      }`}>
        <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث في الأرشيف (اسم قضية، موكل، عقد، مستند، رقم، تاريخ...)"
          className={`flex-1 bg-transparent text-sm outline-none ${
            isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"
          }`}
        />
        {search && (
          <button onClick={() => setSearch("")}
            className={`text-[11px] px-2 py-0.5 rounded-lg ${
              isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
            }`}>مسح</button>
        )}
      </div>

      {/* Kind filter tabs */}
      <div className={`flex items-center gap-1 p-1 rounded-2xl w-fit ${
        isDark ? "bg-zinc-800/70 border border-white/[0.05]" : "bg-slate-100 border border-slate-200/60"
      }`}>
        {/* All */}
        <button onClick={() => setKindFilter("all")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${
            kindFilter === "all"
              ? isDark ? "bg-zinc-700 text-white shadow-sm" : "bg-white text-[#0B3D2E] shadow-sm"
              : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
          }`}>
          الكل
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
            kindFilter === "all"
              ? isDark ? "bg-white/15 text-white" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
              : isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-200 text-slate-400"
          }`}>{counts.all}</span>
        </button>

        {(Object.entries(KIND_CONFIG) as [EntityKind, typeof KIND_CONFIG[EntityKind]][]).map(([kind, conf]) => {
          const Icon = conf.icon;
          const count = counts[kind];
          if (count === 0) return null;
          return (
            <button key={kind} onClick={() => setKindFilter(kind)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${
                kindFilter === kind
                  ? isDark ? "bg-zinc-700 text-white shadow-sm" : "bg-white text-[#0B3D2E] shadow-sm"
                  : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
              }`}>
              <Icon size={12} />
              {conf.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                kindFilter === kind
                  ? isDark ? "bg-white/15 text-white" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                  : isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-200 text-slate-400"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`${card} p-14 text-center`}>
            <Archive size={36} weight="duotone" className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-[14px] font-semibold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              {search ? "لم يُعثر على نتائج في الأرشيف" : "الأرشيف فارغ"}
            </p>
            {search && (
              <button onClick={() => setSearch("")}
                className={`mt-2 text-[12px] underline ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
                عرض الكل
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-2">
            {filtered.map((entry, i) => {
              const conf = KIND_CONFIG[entry.kind];
              const Icon = conf.icon;
              return (
                <motion.div key={entry.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`group ${card} p-4 flex items-center gap-4 hover:border-purple-500/20 transition-all`}>

                  {/* Kind icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${conf.bg}`}>
                    <Icon size={18} weight="duotone" className={conf.color} />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                        {entry.title}
                      </p>
                      {/* Kind badge */}
                      <span className={`flex-shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full border ${conf.bg} ${conf.color} ${conf.border}`}>
                        {conf.label.slice(0, -1) /* قضية / موكل / عقد / مستند */}
                      </span>
                      {/* Reason */}
                      <span className={`flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${entry.reasonColor}`}>
                        {entry.reason}
                      </span>
                    </div>
                    <div className={`flex items-center gap-3 text-[11px] flex-wrap ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      <span className="flex items-center gap-1">
                        <Tag size={9} />{entry.subtitle}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={9} />{entry.date}
                      </span>
                      {entry.meta && (
                        <span className={`font-mono text-[10px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                          {entry.meta}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* View */}
                    <Link href={entry.href}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                        isDark
                          ? "border-white/[0.07] text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200"
                          : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      }`}>
                      <Eye size={12} />
                      <span className="hidden sm:block">عرض</span>
                    </Link>

                    {/* Restore */}
                    {entry.canRestore && (
                      <button onClick={() => handleRestore(entry)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                          isDark
                            ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15"
                            : "border-emerald-500/20 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        }`}>
                        <ArrowCounterClockwise size={12} />
                        <span className="hidden sm:block">استعادة</span>
                      </button>
                    )}

                    {/* Arrow */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                      isDark ? "text-zinc-700 group-hover:bg-white/[0.05] group-hover:text-zinc-400"
                             : "text-slate-200 group-hover:bg-purple-500/8 group-hover:text-purple-500"
                    }`}>
                      <CaretLeft size={14} />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats footer */}
      {filtered.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className={`${card} p-4 flex flex-wrap items-center gap-5`}>
          {(Object.entries(KIND_CONFIG) as [EntityKind, typeof KIND_CONFIG[EntityKind]][]).map(([kind, conf]) => {
            const count = counts[kind];
            if (!count) return null;
            const Icon = conf.icon;
            return (
              <div key={kind} className="flex items-center gap-1.5">
                <Icon size={12} className={conf.color} />
                <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {conf.label}: <strong className={conf.color}>{count}</strong>
                </span>
              </div>
            );
          })}
          <div className="mr-auto">
            <Link href="/dashboard/lawyer/cases"
              className={`flex items-center gap-1 text-[11px] text-purple-500 hover:underline`}>
              <ArrowUpRight size={12} />
              عرض القضايا
            </Link>
          </div>
        </motion.div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-5 py-2.5 rounded-2xl text-[13px] font-bold text-white bg-[#0B3D2E] shadow-xl whitespace-nowrap">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
