"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  WarningCircle, MagnifyingGlass, User, ShieldCheck,
  XCircle, CheckCircle, Warning, IdentificationCard,
  Briefcase, FolderOpen, MapPin,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ────────────────────────────────────────────────────────

type MatchLevel = "خطر (تطابق تام)" | "تحذير (تطابق جزئي)" | "آمن";

interface ConflictResult {
  id: string;
  name: string;
  type: "عميل حالي" | "عميل سابق" | "خصم حالي" | "خصم سابق" | "شاهد" | "شريك تجاري";
  matchLevel: MatchLevel;
  relatedCase: string;
  assignedLawyers: string[];
  lastInteraction: string;
  details: string;
}

const MOCK_DB: ConflictResult[] = [
  { id: "1", name: "شركة الأفق الحديثة", type: "عميل حالي", matchLevel: "خطر (تطابق تام)", relatedCase: "دعوى عمالية ضد أحمد المرزوقي", assignedLawyers: ["سلمان العتيبي", "فهد الدوسري"], lastInteraction: "قبل يومين", details: "عميل نشط بعقد سنوي حتى ٢٠٢٧" },
  { id: "2", name: "مجموعة الأفق القابضة", type: "عميل سابق", matchLevel: "تحذير (تطابق جزئي)", relatedCase: "استشارة تجارية - استحواذ", assignedLawyers: ["نورة الزهراني"], lastInteraction: "٢٠٢٤/٠١/١٥", details: "تم إغلاق الملف، لكن يوجد التزام سرية ممتد" },
  { id: "3", name: "خالد بن محمد الأفق", type: "خصم سابق", matchLevel: "تحذير (تطابق جزئي)", relatedCase: "نزاع ملكية فكرية", assignedLawyers: ["سلمان العتيبي"], lastInteraction: "٢٠٢٢/٠٨/١٠", details: "انتهت القضية بالصلح" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConflictCheckPage() {
  const { isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"name" | "id" | "phone">("name");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<ConflictResult[] | null>(null);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    // Simulate DB search
    setTimeout(() => {
      if (searchQuery.includes("الأفق") || searchQuery.includes("الافق")) {
        setResults(MOCK_DB);
      } else {
        setResults([]);
      }
      setIsSearching(false);
    }, 1500);
  };

  return (
    <div className="max-w-[1000px] mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
          style={{ fontFamily: "var(--font-brand)" }}>
          <WarningCircle className="text-royal" weight="duotone" />
          فحص تعارض المصالح (Conflict Check)
        </h1>
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          ابحث في قاعدة بيانات المكتب (العملاء، الخصوم، القضايا السابقة) للتأكد من عدم وجود تعارض قبل قبول أي قضية جديدة.
        </p>
      </motion.div>

      {/* Search Box */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className={`${card} p-6`}>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className={`block text-[11px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>نوع البحث</label>
            <div className="flex gap-2">
              {(["name", "id", "phone"] as const).map(type => (
                <button key={type} onClick={() => setSearchType(type)}
                  className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold transition-all border ${
                    searchType === type ? "bg-[#0B3D2E] border-[#0B3D2E] text-[#C8A762]" : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                  }`}>
                  {type === "name" ? "الاسم التجاري/الشخصي" : type === "id" ? "رقم الهوية/السجل" : "رقم الجوال"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 w-full">
            <label className={`block text-[11px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>كلمة البحث</label>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${isDark ? "bg-white/[0.04] border-white/[0.06] focus-within:border-royal/40" : "bg-zinc-50 border-zinc-200 focus-within:border-emerald-300"}`}>
              {searchType === "name" ? <User size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} /> : searchType === "id" ? <IdentificationCard size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} /> : <MapPin size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />}
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder={searchType === "name" ? "اكتب اسم العميل أو الخصم..." : searchType === "id" ? "أدخل رقم الهوية أو السجل التجاري..." : "أدخل رقم الجوال..."}
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500" dir="rtl" />
            </div>
          </div>
          <button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40 hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2 h-[42px] shrink-0">
            {isSearching ? "جاري الفحص..." : <><MagnifyingGlass size={16} weight="bold" /> ابحث في السجلات</>}
          </button>
        </div>
      </motion.div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {results !== null && !isSearching && (
          <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="space-y-4">
            
            {/* Status Banner */}
            <div className={`p-4 rounded-2xl flex items-center gap-3 border ${
              results.length > 0 
                ? isDark ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-200"
                : isDark ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"
            }`}>
              {results.length > 0 ? (
                <XCircle size={24} weight="fill" className="text-red-500 shrink-0" />
              ) : (
                <CheckCircle size={24} weight="fill" className="text-emerald-500 shrink-0" />
              )}
              <div>
                <p className={`text-[14px] font-bold ${results.length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {results.length > 0 ? "يوجد احتمال تعارض مصالح!" : "السجل آمن - لا يوجد تعارض مصالح"}
                </p>
                <p className={`text-[12px] mt-0.5 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  {results.length > 0 ? `وجدنا ${results.length} تطابق في قاعدة بيانات المكتب` : "لم نجد أي تطابق لاسم أو بيانات العميل/الخصم في قضايانا الحالية أو السابقة"}
                </p>
              </div>
            </div>

            {/* Results List */}
            {results.length > 0 && (
              <div className="grid gap-3">
                {results.map((res, i) => (
                  <motion.div key={res.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    className={`${card} p-5`}>
                    <div className="flex flex-col sm:flex-row gap-4 justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{res.name}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            res.matchLevel.includes("خطر") ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          }`}>{res.matchLevel}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <User size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                            <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{res.type}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <FolderOpen size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                            <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{res.relatedCase}</span>
                          </div>
                        </div>
                      </div>
                      <div className={`sm:text-left p-3 rounded-xl ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                        <p className={`text-[10px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المحامون المسؤولون</p>
                        <p className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{res.assignedLawyers.join("، ")}</p>
                        <p className={`text-[10px] mt-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>آخر تفاعل: {res.lastInteraction}</p>
                      </div>
                    </div>
                    <div className={`mt-4 p-3 rounded-xl border flex items-start gap-2 ${isDark ? "bg-amber-500/5 border-amber-500/10" : "bg-amber-50 border-amber-100"}`}>
                      <Warning size={14} className="text-amber-500 mt-0.5 shrink-0" weight="fill" />
                      <p className={`text-[12px] leading-relaxed ${isDark ? "text-amber-200/70" : "text-amber-700"}`}>{res.details}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
