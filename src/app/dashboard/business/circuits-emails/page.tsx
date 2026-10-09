"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Briefcase, MagnifyingGlass, ArrowLeft, ShieldCheck,
  Warning, Check, Copy, Envelope, CaretLeft, CaretRight,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import Link from "next/link";
import circuitsRawData from "@/data/circuits-directory.json";
import { copyToClipboard } from "@/lib/services/publicProfileLink";

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

const ITEMS_PER_PAGE = 25;

export default function BusinessCircuitsEmailsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("الكل");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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
      return matchSearch && matchRegion;
    });
  }, [search, regionFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  const handleCopy = async (id: string, email: string) => {
    const ok = await copyToClipboard(email);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <SubscriptionGuard featureKey="business-litigation">
      <div className={`p-5 md:p-8 space-y-6 max-w-5xl mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/business"
              className={`p-2 rounded-xl transition-colors ${
                isDark ? "bg-white/[0.04] hover:bg-white/[0.08]" : "bg-zinc-100 hover:bg-zinc-200"
              }`}
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <Briefcase className="text-[#C8A762]" weight="duotone" />
                دليل إيميلات الدوائر القضائية
              </h1>
              <p className={isDark ? "text-zinc-400" : "text-zinc-600"}>
                عناوين البريد الإلكتروني الرسمية لـ 2,192 دائرة وجهة قضائية معتمدة بوزارة العدل.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck size={14} weight="fill" />
            2,192 جهة معتمدة
          </span>
        </div>

        {/* Search & Region Filter */}
        <div className={`p-4 rounded-3xl border space-y-3 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-zinc-200 shadow-sm"}`}>
          <div className={`relative flex items-center p-2 rounded-2xl border ${isDark ? "bg-zinc-950/60 border-white/[0.06]" : "bg-zinc-50 border-zinc-200"}`}>
            <MagnifyingGlass size={18} className={`ms-3 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="ابحث باسم المحكمة، المدينة، أو الدائرة، أو البريد..."
              className="flex-1 bg-transparent border-none outline-none py-1.5 px-3 text-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className={`text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>المنطقة:</span>
            {REGIONS.map(r => (
              <button
                key={r}
                onClick={() => { setRegionFilter(r); setCurrentPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                  regionFilter === r
                    ? "bg-[#0B3D2E] text-white"
                    : isDark
                    ? "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Count & Pagination Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
          <p className={isDark ? "text-zinc-400" : "text-zinc-500"}>
            يعرض <strong className={isDark ? "text-zinc-100" : "text-zinc-800"}>{paginated.length}</strong> من أصل{" "}
            <strong className={isDark ? "text-zinc-100" : "text-zinc-800"}>{filtered.length}</strong> نتيجة
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
              >
                <CaretRight size={14} />
              </button>
              <span className="font-mono text-[11px]">
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
              >
                <CaretLeft size={14} />
              </button>
            </div>
          )}
        </div>

        {/* List of Circuits */}
        <div className="grid gap-3">
          {paginated.map(c => {
            const isCopied = copiedId === c.id;
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col p-4 rounded-2xl border overflow-hidden relative ${
                  isDark ? "bg-zinc-900/50 border-white/[0.06]" : "bg-white border-zinc-200 shadow-sm"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-600"}`}>
                        {c.region}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-[#0B3D2E]/20 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                        {c.category}
                      </span>
                      {c.needsVerification ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full border px-2 py-0.5 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Warning size={10} weight="fill" /> يتطلب تحققاً
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full border px-2 py-0.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck size={10} weight="fill" /> معتمد
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-[14px]">{c.name}</h3>

                    {c.needsVerification && (
                      <p className="mt-1 text-[10px] text-amber-500">
                        ⚠️ خطأ bidi طباعي بالمصدر. الصيغة المرجحة: <strong className="font-mono">{c.suggestedEmail}</strong>
                      </p>
                    )}
                  </div>

                  {/* Actions & Email */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${isDark ? "bg-zinc-950/60 border-white/[0.08]" : "bg-zinc-50 border-zinc-200"}`}>
                      <span dir="ltr" className={`font-mono text-[12px] select-all ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                        {c.email}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(c.id, c.email)}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isCopied
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                            : isDark
                            ? "border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                            : "border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        }`}
                        title="نسخ البريد الإلكتروني"
                      >
                        {isCopied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                      </button>
                      <a
                        href={`mailto:${c.email}`}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isDark
                            ? "border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                            : "border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        }`}
                        title="إرسال بريد"
                      >
                        <Envelope size={14} className="text-blue-500" />
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {filtered.length === 0 && (
            <div className={`p-8 rounded-3xl border text-center text-[13px] ${isDark ? "border-white/[0.06] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
              لا توجد نتائج مطابقة لبحثك.
            </div>
          )}
        </div>

        {/* Bottom Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-4">
            <button
              onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 200, behavior: "smooth" }); }}
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
              onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 200, behavior: "smooth" }); }}
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
    </SubscriptionGuard>
  );
}
