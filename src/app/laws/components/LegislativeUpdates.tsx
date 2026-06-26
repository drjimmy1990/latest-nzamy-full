"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  NewspaperClipping,
  X,
  MagnifyingGlass,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Gavel,
  ClockCounterClockwise,
  FunnelSimple,
  Scroll,
  PlusCircle,
  MinusCircle,
  Sparkle,
  CaretRight,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────
type ChangeType = "amendment" | "addition" | "repeal" | "new_law";
type DecreeType = "royal_decree" | "ministerial_decision" | "circular" | "cabinet_decision";
type PeriodFilter = "this_month" | "3_months" | "this_year" | "all";
type TypeFilter   = "all" | ChangeType;

interface LegislativeUpdate {
  id: string;
  lawName: string;
  lawSlug: string;
  changeType: ChangeType;
  articleRef?: string;
  decreeRef: string;
  decreeType: DecreeType;
  date: string; // ISO YYYY-MM-DD
  summary: string;
}

// ─── Demo Data ────────────────────────────────────────────────────────────────
const DEMO_UPDATES: LegislativeUpdate[] = [
  {
    id: "u1",
    lawName: "نظام العمل",
    lawSlug: "labor-law",
    changeType: "amendment",
    articleRef: "المادة 74",
    decreeRef: "مرسوم ملكي م/15 وتاريخ 1446/6/1هـ",
    decreeType: "royal_decree",
    date: "2026-06-12",
    summary: "تعديل أحكام الإنهاء التعسفي وتغليظ التعويض المستحق للموظف",
  },
  {
    id: "u2",
    lawName: "نظام الشركات",
    lawSlug: "companies-law",
    changeType: "addition",
    articleRef: "الباب السابع",
    decreeRef: "مرسوم ملكي م/132 وتاريخ 1446/5/14هـ",
    decreeType: "royal_decree",
    date: "2026-05-18",
    summary: "إضافة أحكام الشركات متعددة الأسهم وشركات المشاريع الناشئة",
  },
  {
    id: "u3",
    lawName: "نظام التحكيم",
    lawSlug: "arbitration-law",
    changeType: "amendment",
    articleRef: "المادة 9 و35",
    decreeRef: "مرسوم ملكي م/8 وتاريخ 1446/4/2هـ",
    decreeType: "royal_decree",
    date: "2026-04-22",
    summary: "تعديل شروط قبول التحكيم الدولي وتسريع إجراءات التنفيذ",
  },
  {
    id: "u4",
    lawName: "نظام المحاكم التجارية",
    lawSlug: "commercial-courts-law",
    changeType: "amendment",
    articleRef: "المادة 18",
    decreeRef: "قرار مجلس الوزراء 647 وتاريخ 1446/3/10هـ",
    decreeType: "cabinet_decision",
    date: "2026-03-05",
    summary: "تعديل حد الاختصاص النوعي للدوائر التجارية الابتدائية",
  },
  {
    id: "u5",
    lawName: "نظام الإثبات",
    lawSlug: "evidence-law",
    changeType: "addition",
    articleRef: "المادة 13 مكرر",
    decreeRef: "مرسوم ملكي م/43 وتاريخ 1446/2/20هـ",
    decreeType: "royal_decree",
    date: "2026-02-14",
    summary: "إضافة أحكام الدليل الرقمي والمستندات الإلكترونية الموثقة",
  },
  {
    id: "u6",
    lawName: "نظام الإجراءات الجزائية",
    lawSlug: "criminal-procedure",
    changeType: "amendment",
    articleRef: "المواد 102-107",
    decreeRef: "مرسوم ملكي م/91 وتاريخ 1446/1/5هـ",
    decreeType: "royal_decree",
    date: "2026-01-08",
    summary: "تعديل آليات التحقيق مع المتهمين وضمانات حقوق الدفاع",
  },
  {
    id: "u7",
    lawName: "نظام حماية البيانات الشخصية (PDPL)",
    lawSlug: "pdpl",
    changeType: "new_law",
    decreeRef: "مرسوم ملكي م/19 وتاريخ 1445/9/9هـ",
    decreeType: "royal_decree",
    date: "2025-12-01",
    summary: "سريان الأحكام التنفيذية الجديدة للحماية والإشعار بالاختراق",
  },
  {
    id: "u8",
    lawName: "نظام العمل",
    lawSlug: "labor-law",
    changeType: "repeal",
    articleRef: "المادة 45",
    decreeRef: "قرار وزير الموارد البشرية 82345",
    decreeType: "ministerial_decision",
    date: "2025-11-17",
    summary: "إلغاء قيد الموافقة المسبقة لنقل الكفالة بين أصحاب العمل",
  },
  {
    id: "u9",
    lawName: "نظام التنفيذ",
    lawSlug: "execution-law",
    changeType: "amendment",
    articleRef: "المادة 5 و14",
    decreeRef: "مرسوم ملكي م/55 وتاريخ 1445/8/1هـ",
    decreeType: "royal_decree",
    date: "2025-10-03",
    summary: "تعديل آليات الحجز الإلكتروني على الأموال المنقولة",
  },
  {
    id: "u10",
    lawName: "نظام مكافحة غسل الأموال",
    lawSlug: "aml-law",
    changeType: "amendment",
    articleRef: "المادة 2",
    decreeRef: "مرسوم ملكي م/3 وتاريخ 1445/6/25هـ",
    decreeType: "royal_decree",
    date: "2025-08-12",
    summary: "توسيع تعريف الأصول الرقمية لتشمل العملات المشفرة والرموز الرقمية",
  },
  {
    id: "u11",
    lawName: "لائحة المحاكم الجزائية المتخصصة",
    lawSlug: "specialized-criminal-courts",
    changeType: "addition",
    decreeRef: "قرار مجلس الوزراء 482",
    decreeType: "cabinet_decision",
    date: "2025-07-20",
    summary: "إضافة دوائر متخصصة لقضايا الجرائم الإلكترونية والمالية",
  },
  {
    id: "u12",
    lawName: "نظام المرافعات الشرعية",
    lawSlug: "procedural-law",
    changeType: "amendment",
    articleRef: "المادة 25 و26",
    decreeRef: "مرسوم ملكي م/36 وتاريخ 1445/4/10هـ",
    decreeType: "royal_decree",
    date: "2025-05-28",
    summary: "تعديل أحكام التقاضي الإلكتروني وإلزامية تقديم المذكرات رقمياً",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<ChangeType, { label: string; color: string; dotColor: string; icon: typeof Gavel }> = {
  amendment: { label: "تعديل",       color: "text-amber-400",   dotColor: "bg-amber-400",   icon: Gavel },
  addition:  { label: "إضافة",       color: "text-emerald-400", dotColor: "bg-emerald-400", icon: PlusCircle },
  repeal:    { label: "إلغاء",       color: "text-rose-400",    dotColor: "bg-rose-400",    icon: MinusCircle },
  new_law:   { label: "نظام جديد",   color: "text-sky-400",     dotColor: "bg-sky-400",     icon: Sparkle },
};

const DECREE_LABELS: Record<DecreeType, string> = {
  royal_decree:          "مرسوم ملكي",
  ministerial_decision:  "قرار وزاري",
  circular:              "تعميم",
  cabinet_decision:      "قرار مجلس الوزراء",
};

const PERIOD_OPTIONS: { id: PeriodFilter; label: string }[] = [
  { id: "this_month",  label: "هذا الشهر" },
  { id: "3_months",    label: "آخر 3 أشهر" },
  { id: "this_year",   label: "هذه السنة" },
  { id: "all",         label: "كل الوقت" },
];

const TYPE_OPTIONS: { id: TypeFilter; label: string }[] = [
  { id: "all",       label: "الكل" },
  { id: "amendment", label: "تعديل" },
  { id: "addition",  label: "إضافة" },
  { id: "repeal",    label: "إلغاء" },
  { id: "new_law",   label: "نظام جديد" },
];

function filterByPeriod(updates: LegislativeUpdate[], period: PeriodFilter): LegislativeUpdate[] {
  const now = new Date();
  return updates.filter(u => {
    const d = new Date(u.date);
    if (period === "all") return true;
    if (period === "this_month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === "3_months")   return (now.getTime() - d.getTime()) <= 90 * 24 * 60 * 60 * 1000;
    if (period === "this_year")  return d.getFullYear() === now.getFullYear();
    return true;
  });
}

function formatDate(iso: string, isRTL: boolean): string {
  const d = new Date(iso);
  if (isRTL) {
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  }
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Full Modal ───────────────────────────────────────────────────────────────
interface ModalProps { isDark: boolean; isRTL: boolean; onClose: () => void; }

function UpdatesModal({ isDark, isRTL, onClose }: ModalProps) {
  const [search, setSearch]         = useState("");
  const [period, setPeriod]         = useState<PeriodFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const filtered = useMemo(() => {
    let items = DEMO_UPDATES;
    items = filterByPeriod(items, period);
    if (typeFilter !== "all") items = items.filter(u => u.changeType === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(u =>
        u.lawName.includes(q) ||
        u.summary.includes(q) ||
        (u.articleRef ?? "").includes(q) ||
        u.decreeRef.toLowerCase().includes(q)
      );
    }
    return items;
  }, [search, period, typeFilter]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          onClick={e => e.stopPropagation()}
          className={`relative w-full max-w-2xl rounded-3xl border shadow-2xl flex flex-col overflow-hidden max-h-[85vh] ${
            isDark ? "bg-[#0f1923] border-white/10" : "bg-white border-gray-200"
          }`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b ${isDark ? "border-white/8" : "border-gray-100"}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${isDark ? "bg-amber-400/10" : "bg-amber-50"}`}>
                <NewspaperClipping size={20} weight="fill" className="text-amber-400" />
              </div>
              <div>
                <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  التحديثات التشريعية
                </h2>
                <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {filtered.length} تحديث
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${isDark ? "hover:bg-white/8 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
            >
              <X size={18} />
            </button>
          </div>

          {/* Filters */}
          <div className={`px-6 pt-4 pb-3 space-y-3 border-b ${isDark ? "border-white/8" : "border-gray-100"}`}>
            {/* Search */}
            <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${
              isDark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"
            }`}>
              <MagnifyingGlass size={16} className={isDark ? "text-gray-500" : "text-gray-400"} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث في التحديثات..."
                className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-white placeholder:text-gray-600" : "text-gray-900 placeholder:text-gray-400"}`}
                dir="rtl"
              />
            </div>

            {/* Period filter */}
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    period === p.id
                      ? "bg-amber-400 text-gray-900"
                      : isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <div className={`w-px mx-1 ${isDark ? "bg-white/10" : "bg-gray-200"}`} />
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTypeFilter(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    typeFilter === t.id
                      ? isDark ? "bg-white/15 text-white" : "bg-gray-200 text-gray-900"
                      : isDark ? "bg-transparent text-gray-500 hover:text-gray-300" : "bg-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filtered.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-16 gap-3 ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                <NewspaperClipping size={36} />
                <p className="text-sm">لا توجد تحديثات في هذه الفترة</p>
              </div>
            ) : filtered.map((u, i) => (
              <ModalUpdateRow key={u.id} update={u} index={i} isDark={isDark} isRTL={isRTL} />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ModalUpdateRow({ update, index, isDark, isRTL }: { update: LegislativeUpdate; index: number; isDark: boolean; isRTL: boolean }) {
  const cfg = TYPE_CONFIG[update.changeType];
  const Icon = cfg.icon;
  return (
    <motion.a
      href={`/laws/${update.lawSlug}`}
      initial={{ opacity: 0, x: isRTL ? 12 : -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`flex items-start gap-3 p-4 rounded-2xl border transition-all group cursor-pointer ${
        isDark
          ? "bg-white/3 border-white/6 hover:bg-white/7 hover:border-white/12"
          : "bg-gray-50 border-gray-100 hover:bg-gray-100 hover:border-gray-200"
      }`}
    >
      {/* Icon */}
      <div className={`mt-0.5 p-2 rounded-xl shrink-0 ${
        update.changeType === "amendment" ? isDark ? "bg-amber-400/10" : "bg-amber-50"
          : update.changeType === "addition" ? isDark ? "bg-emerald-400/10" : "bg-emerald-50"
          : update.changeType === "repeal" ? isDark ? "bg-rose-400/10" : "bg-rose-50"
          : isDark ? "bg-sky-400/10" : "bg-sky-50"
      }`}>
        <Icon size={16} weight="fill" className={cfg.color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            {update.lawName}
          </span>
          {update.articleRef && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-white/8 text-gray-400" : "bg-gray-200 text-gray-600"}`}>
              {update.articleRef}
            </span>
          )}
          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
        </div>
        <p className={`text-xs mt-1 leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>
          {update.summary}
        </p>
        <p className={`text-[11px] mt-1.5 ${isDark ? "text-gray-600" : "text-gray-400"}`}>
          {update.decreeRef} · {formatDate(update.date, isRTL)}
        </p>
      </div>

      {/* Arrow */}
      <div className={`mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? "text-gray-400" : "text-gray-400"}`}>
        {isRTL ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
      </div>
    </motion.a>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────
interface LegislativeUpdatesProps { isDark: boolean; isRTL: boolean; }

export default function LegislativeUpdates({ isDark, isRTL }: LegislativeUpdatesProps) {
  const [showModal, setShowModal] = useState(false);

  // Widget shows latest 4 items
  const widgetItems = useMemo(() =>
    filterByPeriod(DEMO_UPDATES, "all")
      .slice(0, 4),
    []
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 280, damping: 26 }}
        className={`rounded-3xl border overflow-hidden ${
          isDark ? "bg-[#0f1923] border-white/10" : "bg-white border-gray-200"
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/8" : "border-gray-100"}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDark ? "bg-amber-400/10" : "bg-amber-50"}`}>
              <NewspaperClipping size={18} weight="fill" className="text-amber-400" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                التحديثات التشريعية
              </h3>
              <p className={`text-[11px] mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                آخر المراسيم والتعديلات على الأنظمة
              </p>
            </div>
          </div>

          {/* Live badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
            isDark ? "bg-emerald-400/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            محدّث
          </div>
        </div>

        {/* Scrollable list */}
        <div className="overflow-hidden px-3 py-2 space-y-1">
          {widgetItems.map((u, i) => (
            <WidgetUpdateRow key={u.id} update={u} index={i} isDark={isDark} isRTL={isRTL} />
          ))}
        </div>

        {/* Footer CTA */}
        <div className={`px-4 py-2.5 border-t ${isDark ? "border-white/8" : "border-gray-100"}`}>
          <button
            onClick={() => setShowModal(true)}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
              isDark
                ? "bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <ClockCounterClockwise size={14} />
            عرض كل التحديثات والفلترة
            {isRTL ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}
          </button>
        </div>
      </motion.div>

      {/* Modal */}
      {showModal && (
        <UpdatesModal isDark={isDark} isRTL={isRTL} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

function WidgetUpdateRow({ update, index, isDark, isRTL }: { update: LegislativeUpdate; index: number; isDark: boolean; isRTL: boolean }) {
  const cfg = TYPE_CONFIG[update.changeType];
  const Icon = cfg.icon;
  return (
    <motion.a
      href={`/laws/${update.lawSlug}`}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all group cursor-pointer ${
        isDark ? "hover:bg-white/5" : "hover:bg-gray-50"
      }`}
    >
      {/* Colored dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotColor}`} />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs font-bold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>
            {update.lawName}
          </span>
          {update.articleRef && (
            <span className={`text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
              · {update.articleRef}
            </span>
          )}
        </div>
        <p className={`text-[11px] truncate mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
          {update.summary}
        </p>
      </div>

      {/* Type pill + date */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
        <span className={`text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
          {new Date(update.date).toLocaleDateString("ar-SA", { month: "short", year: "numeric" })}
        </span>
      </div>
    </motion.a>
  );
}
