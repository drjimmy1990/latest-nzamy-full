"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Bank, MagnifyingGlass, Scales, Buildings,
  FileText, ShieldCheck, Warning, Check, Copy, Envelope,
  CaretLeft, CaretRight,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import circuitsRawData from "@/data/circuits-directory.json";
import { copyToClipboard } from "@/lib/services/publicProfileLink";

// ─── Types & Definitions ──────────────────────────────────────────────────────

interface CircuitRecord {
  id: string;
  page: number;
  name: string;
  category: string;
  region: string;
  city: string;
  email: string;
  rawEmail: string;
  needsVerification: boolean;
  suggestedEmail: string | null;
  verificationStatus: string;
}

const ALL_CIRCUITS: CircuitRecord[] = (circuitsRawData as { circuits: CircuitRecord[] }).circuits;

const REGIONS = [
  "الكل",
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

const CATEGORIES = [
  "الكل",
  "محكمة عامة",
  "محكمة جزائية",
  "محكمة تنفيذ",
  "كتابة عدل",
  "استئناف",
  "إدارة وفروع الوزارة",
  "محاكم ودوائر قضائية",
  "محكمة تجارية"
];

const CATEGORY_COLORS: Record<string, string> = {
  "محكمة عامة": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "محكمة جزائية": "bg-purple-500/10 text-purple-500 border-purple-500/20",
  "محكمة تنفيذ": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "كتابة عدل": "bg-teal-500/10 text-teal-500 border-teal-500/20",
  "استئناف": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  "إدارة وفروع الوزارة": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "محاكم ودوائر قضائية": "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  "محكمة تجارية": "bg-[#C8A762]/10 text-[#C8A762] border-[#C8A762]/30",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "محكمة عامة": Scales,
  "محكمة جزائية": Scales,
  "محكمة تنفيذ": FileText,
  "كتابة عدل": Buildings,
  "استئناف": Bank,
  "إدارة وفروع الوزارة": Buildings,
  "محكمة تجارية": Scales,
};

const ITEMS_PER_PAGE = 30;

// ─── Single Circuit Card ──────────────────────────────────────────────────────

function CircuitItemCard({ circuit, isDark, card }: { circuit: CircuitRecord; isDark: boolean; card: string }) {
  const [copied, setCopied] = useState(false);
  const Icon = CATEGORY_ICONS[circuit.category] ?? Buildings;
  const isVerified = !circuit.needsVerification;

  const handleCopy = async () => {
    const ok = await copyToClipboard(circuit.email);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`${card} p-5 transition-all`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Entity Info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isDark ? "bg-white/[0.05]" : "bg-slate-50"}`}>
            <Icon size={20} className="text-royal" weight="duotone" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                {circuit.name}
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[circuit.category] || "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"}`}>
                {circuit.category}
              </span>
              {circuit.needsVerification ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full border px-2 py-0.5 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Warning size={11} weight="fill" /> يتطلب تحققاً
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full border px-2 py-0.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={11} weight="fill" /> رسمي معتمد
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>{circuit.region}</span>
              {circuit.city && circuit.city !== circuit.region && (
                <>
                  <span>•</span>
                  <span>{circuit.city}</span>
                </>
              )}
              <span>•</span>
              <span>صفحة {circuit.page} بالدليل الرسمي</span>
            </div>

            {/* Email verification notice if applicable */}
            {circuit.needsVerification && (
              <div className="mt-2 text-[11px] p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Warning size={13} weight="fill" />
                  <span>تنبيه خطأ طباعي (bidi) في المصدر الرسمي:</span>
                </div>
                <div className="font-mono text-[11px] flex flex-wrap gap-2 text-zinc-600 dark:text-zinc-300">
                  <span>الصيغة في المصدر: <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">{circuit.rawEmail}</code></span>
                  <span>الصيغة المرجحة: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{circuit.suggestedEmail}</strong></span>
                </div>
                {circuit.verificationStatus && (
                  <p className="text-[10px] opacity-80">{circuit.verificationStatus}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Email Copy & Actions */}
        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${isDark ? "bg-zinc-950/60 border-white/[0.08]" : "bg-slate-50 border-slate-200"}`}>
            <span dir="ltr" className={`font-mono text-[12px] select-all ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              {circuit.email}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className={`p-1.5 rounded-lg border transition-colors ${
                copied
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                  : isDark
                  ? "border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                  : "border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              }`}
              title="نسخ البريد الإلكتروني"
              aria-label="نسخ البريد"
            >
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
            </button>
            <a
              href={`mailto:${circuit.email}`}
              className={`p-1.5 rounded-lg border transition-colors ${
                isDark
                  ? "border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                  : "border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              }`}
              title="إرسال بريد"
              aria-label="إرسال بريد"
            >
              <Envelope size={14} className="text-blue-500" />
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function CircuitsEmailsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("الكل");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [verificationFilter, setVerificationFilter] = useState<"all" | "verified" | "needsVerification">("all");
  const [currentPage, setCurrentPage] = useState(1);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // Filtered dataset
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_CIRCUITS.filter(c => {
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q);

      const matchRegion = regionFilter === "الكل" || c.region === regionFilter;
      const matchCategory = categoryFilter === "الكل" || c.category === categoryFilter;

      let matchVerify = true;
      if (verificationFilter === "verified") matchVerify = !c.needsVerification;
      if (verificationFilter === "needsVerification") matchVerify = c.needsVerification;

      return matchSearch && matchRegion && matchCategory && matchVerify;
    });
  }, [search, regionFilter, categoryFilter, verificationFilter]);

  // Reset page when filter changes
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

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
          <p className="text-lg font-bold text-royal font-mono">2,192</p>
        </div>
        <div className={`${card} p-3.5 text-center`}>
          <p className="text-[11px] text-zinc-500">المعتمدة مباشرة</p>
          <p className="text-lg font-bold text-emerald-500 font-mono">2,156</p>
        </div>
        <div className={`${card} p-3.5 text-center`}>
          <p className="text-[11px] text-zinc-500">تدقيق يدوي (أخطاء bidi بالطباعة)</p>
          <p className="text-lg font-bold text-amber-500 font-mono">36</p>
        </div>
        <div className={`${card} p-3.5 text-center`}>
          <p className="text-[11px] text-zinc-500">المناطق المغطاة</p>
          <p className="text-lg font-bold text-blue-500 font-mono">13 منطقة</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className={`${card} p-5 space-y-4`}>
        {/* Search Input */}
        <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border ${isDark ? "bg-white/[0.04] border-white/[0.08]" : "bg-zinc-50 border-zinc-200"}`}>
          <MagnifyingGlass size={18} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="ابحث باسم المحكمة، الدائرة، المدينة، أو البريد الإلكتروني..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500"
            dir="rtl"
          />
        </div>

        {/* Region Filter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>المنطقة:</span>
            {regionFilter !== "الكل" && (
              <button onClick={() => { setRegionFilter("الكل"); setCurrentPage(1); }} className="text-[10px] text-royal underline">
                إعادة ضبط
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap max-h-24 overflow-y-auto pr-1">
            {REGIONS.map(r => (
              <button
                key={r}
                onClick={() => { setRegionFilter(r); setCurrentPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  regionFilter === r
                    ? "bg-[#0B3D2E] text-white"
                    : isDark
                    ? "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Category & Status Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-zinc-500/10">
          <div>
            <span className={`text-[11px] font-bold block mb-1.5 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>تصنيف الجهة:</span>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => { setCategoryFilter(cat); setCurrentPage(1); }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                    categoryFilter === cat
                      ? "bg-[#0B3D2E] text-white"
                      : isDark
                      ? "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={`text-[11px] font-bold block mb-1.5 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>حالة الاعتماد:</span>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setVerificationFilter("all"); setCurrentPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                  verificationFilter === "all"
                    ? "bg-[#0B3D2E] text-white"
                    : isDark
                    ? "bg-zinc-800/80 text-zinc-400"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                الكل (2,192)
              </button>
              <button
                onClick={() => { setVerificationFilter("verified"); setCurrentPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                  verificationFilter === "verified"
                    ? "bg-emerald-600 text-white"
                    : isDark
                    ? "bg-zinc-800/80 text-zinc-400"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                معتمد رسمي (2,156)
              </button>
              <button
                onClick={() => { setVerificationFilter("needsVerification"); setCurrentPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                  verificationFilter === "needsVerification"
                    ? "bg-amber-600 text-white"
                    : isDark
                    ? "bg-zinc-800/80 text-zinc-400"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                يتطلب تحققاً (36)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Header with Count & Pagination Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          يعرض <strong className={isDark ? "text-zinc-100" : "text-slate-800"}>{paginated.length}</strong> من أصل{" "}
          <strong className={isDark ? "text-zinc-100" : "text-slate-800"}>{filtered.length}</strong> نتيجة مطابقة
        </p>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className={`p-1.5 rounded-lg border text-sm transition-colors ${
                safePage <= 1
                  ? "opacity-40 cursor-not-allowed border-transparent"
                  : isDark
                  ? "border-white/[0.08] hover:bg-white/[0.05]"
                  : "border-slate-200 hover:bg-slate-100"
              }`}
              title="الصفحة السابقة"
            >
              <CaretRight size={16} />
            </button>
            <span className={`text-[11px] font-mono ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className={`p-1.5 rounded-lg border text-sm transition-colors ${
                safePage >= totalPages
                  ? "opacity-40 cursor-not-allowed border-transparent"
                  : isDark
                  ? "border-white/[0.08] hover:bg-white/[0.05]"
                  : "border-slate-200 hover:bg-slate-100"
              }`}
              title="الصفحة التالية"
            >
              <CaretLeft size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Results Cards List */}
      <div className="space-y-3">
        {paginated.map(circuit => (
          <CircuitItemCard key={circuit.id} circuit={circuit} isDark={isDark} card={card} />
        ))}

        {filtered.length === 0 && (
          <div className={`${card} p-12 text-center`}>
            <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              لا توجد جهات أو دوائر مطابقة لبحثك في الدليل القضائي.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <button
            onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 300, behavior: "smooth" }); }}
            disabled={safePage <= 1}
            className={`px-3 py-1.5 rounded-xl border text-[12px] font-medium transition-colors ${
              safePage <= 1
                ? "opacity-40 cursor-not-allowed border-transparent"
                : isDark
                ? "border-white/[0.08] hover:bg-white/[0.05]"
                : "border-slate-200 hover:bg-slate-100"
            }`}
          >
            السابق
          </button>
          <span className={`text-[12px] font-mono px-3 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
            صفحة {safePage} من {totalPages}
          </span>
          <button
            onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 300, behavior: "smooth" }); }}
            disabled={safePage >= totalPages}
            className={`px-3 py-1.5 rounded-xl border text-[12px] font-medium transition-colors ${
              safePage >= totalPages
                ? "opacity-40 cursor-not-allowed border-transparent"
                : isDark
                ? "border-white/[0.08] hover:bg-white/[0.05]"
                : "border-slate-200 hover:bg-slate-100"
            }`}
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
