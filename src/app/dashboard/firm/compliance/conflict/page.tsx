"use client";

/**
 * فحص تعارض المصالح — /dashboard/firm/compliance/conflict.
 *
 * Rebuilt on `runConflictCheck()` (Phase 2, item 193). The previous version
 * held `MOCK_DB` — three invented hits (a company, a holding group, an
 * opposing party, complete with fabricated lawyer names and dates) that
 * appeared for any query containing «الأفق» and an empty list for every other
 * name on earth, behind a 1.5s `setTimeout` "simulation".
 *
 * What replaces it searches ONLY what the caller may already read under
 * RLS — their own `lawyer_clients` cards and their `service_requests`, plus
 * their firm's through active membership (`can_access_case_row`). That is
 * necessarily a small, incomplete slice of "everyone this firm has ever
 * dealt with" — nowhere near a real conflicts database — so the screen never
 * claims a clean result means no conflict exists. It says the narrower, true
 * thing: no match *in these records*. The disclaimer line stays on screen at
 * all times, not just beside an empty result, because a lawyer who only
 * reads it once (when there IS a match) never reads the caveat that matters
 * most — the case where there is not.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  WarningCircle, MagnifyingGlass, User, Info,
  IdentificationCard, Buildings, DeviceMobile, Warning,
  ArrowClockwise, ArrowSquareOut,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import {
  runConflictCheck,
  type ConflictQuery,
  type ConflictMatch,
} from "@/lib/services/conflictCheckService";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import {
  isValidNationalId,
  isValidCommercialRegister,
  normalizeDigits,
} from "@/lib/services/clientIdentityRules";

// ─── Search modes ─────────────────────────────────────────────────────────────

type SearchMode = "name" | "nationalId" | "phone" | "commercialRegister";

const MODE_LABEL: Record<SearchMode, string> = {
  name: "الاسم",
  nationalId: "رقم الهوية",
  phone: "رقم الجوال",
  commercialRegister: "السجل التجاري",
};

const MODE_PLACEHOLDER: Record<SearchMode, string> = {
  name: "اكتب اسم الموكّل أو الطرف المقابل...",
  nationalId: "أدخل رقم الهوية الوطنية...",
  phone: "أدخل رقم الجوال...",
  commercialRegister: "أدخل رقم السجل التجاري...",
};

const MODE_ICON: Record<SearchMode, typeof User> = {
  name: User,
  nationalId: IdentificationCard,
  phone: DeviceMobile,
  commercialRegister: Buildings,
};

function toQuery(mode: SearchMode, term: string): ConflictQuery {
  if (mode === "nationalId") return { nationalId: term };
  if (mode === "phone") return { phone: term };
  if (mode === "commercialRegister") return { commercialRegister: term };
  return { q: term };
}

// The API route (route.ts) silently runs zero queries — and returns a real
// {data:[],total:0} — for a term that doesn't clear its own per-field bar:
// name < 2 chars (or one that sanitizes to nothing), a national ID that
// doesn't reduce to any digits, a commercial register the same way. That
// 200 then renders as «لا تطابق في سجلاتك», which is false for a search
// that never actually ran. These mirror the route's exact gates so the
// button (and Enter-to-search) can never reach that state.
const MIN_NAME_LEN = 2;

function sanitizeNameTerm(term: string): string {
  return term.replace(/[,()\\%]/g, "").trim();
}

function isSearchable(mode: SearchMode, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  if (mode === "name") return t.length >= MIN_NAME_LEN && sanitizeNameTerm(t).length > 0;
  if (mode === "nationalId") return isValidNationalId(t);
  if (mode === "commercialRegister") return isValidCommercialRegister(t);
  // phone: the route accepts any non-empty digit string
  const digits = normalizeDigits(t);
  return digits.length > 0 && /^\d+$/.test(digits);
}

const MODE_HINT: Record<SearchMode, string> = {
  name: "حرفان على الأقل.",
  nationalId: "10 أرقام تبدأ بـ1 (مواطن) أو 2 (مقيم).",
  phone: "أرقام فقط.",
  commercialRegister: "10 أرقام.",
};

// ─── Result chips ─────────────────────────────────────────────────────────────

const KIND_LABEL: Record<ConflictMatch["kind"], string> = {
  client: "موكّل",
  case_party: "طرف في قضية",
};

const MATCH_ON_LABEL: Record<ConflictMatch["matchOn"], string> = {
  name: "تطابق بالاسم",
  phone: "تطابق بالجوال",
  national_id: "تطابق برقم الهوية",
  commercial_register: "تطابق بالسجل التجاري",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConflictCheckPage() {
  const { isDark } = useTheme();
  const [mode, setMode] = useState<SearchMode>("name");
  const [term, setTerm] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [read, setRead] = useState<ListRead<ConflictMatch> | null>(null);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const runSearch = async () => {
    if (!isSearchable(mode, term)) return;
    setSearched(true);
    setLoading(true);
    const result = await runConflictCheck(toQuery(mode, term.trim()));
    setRead(result);
    setLoading(false);
  };

  // Real states only after a search has actually run — before that there is
  // nothing to call "empty" or "unreadable" yet.
  const view = searched ? listViewState(loading, read) : null;
  const matches = itemsOf(read);
  const Icon = MODE_ICON[mode];

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
          ابحث عن اسم أو رقم قبل قبول قضية جديدة، للتأكد من عدم وجوده في موكّليك أو قضاياك المسجّلة على نظامي.
        </p>
      </motion.div>

      {/* Always-visible scope disclaimer — this is the whole point of the page. */}
      <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-[12px] leading-relaxed ${
        isDark ? "bg-amber-500/[0.06] border-amber-500/20 text-amber-200/80" : "bg-amber-50 border-amber-200 text-amber-800"
      }`}>
        <Info size={16} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
        <span>يبحث في سجلاتك وسجلات مكتبك على نظامي فقط — لا يغني عن الفحص المهني الكامل.</span>
      </div>

      {/* Search Box */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className={`${card} p-6`}>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className={`block text-[11px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>نوع البحث</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(MODE_LABEL) as SearchMode[]).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`py-2.5 rounded-xl text-[12px] font-bold transition-all border ${
                    mode === m ? "bg-[#0B3D2E] border-[#0B3D2E] text-[#C8A762]" : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                  }`}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 w-full">
            <label className={`block text-[11px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>كلمة البحث</label>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${isDark ? "bg-white/[0.04] border-white/[0.06] focus-within:border-royal/40" : "bg-zinc-50 border-zinc-200 focus-within:border-emerald-300"}`}>
              <Icon size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
              <input type="text" value={term} onChange={e => setTerm(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()}
                placeholder={MODE_PLACEHOLDER[mode]}
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500" dir="rtl" />
            </div>
            <p className={`mt-1.5 text-[11px] ${
              term.trim() && !isSearchable(mode, term)
                ? (isDark ? "text-amber-400" : "text-amber-600")
                : (isDark ? "text-zinc-500" : "text-slate-400")
            }`}>
              {MODE_HINT[mode]}
            </p>
          </div>
          <button onClick={runSearch} disabled={loading || !isSearchable(mode, term)}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40 hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2 h-[42px] shrink-0">
            {loading ? "جاري الفحص..." : <><MagnifyingGlass size={16} weight="bold" /> ابحث في السجلات</>}
          </button>
        </div>
      </motion.div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {view && view !== "loading" && (
          <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="space-y-4">

            {/* Unreadable — a failed query, not a fact about the world. */}
            {view === "unreadable" && (
              <div className={`p-4 rounded-2xl flex items-start gap-3 border ${isDark ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-200"}`}>
                <Warning size={22} weight="fill" className="text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[14px] font-bold text-red-500">تعذّرت قراءة السجلات — هذه ليست نتيجة فحص</p>
                  <p className={`text-[12px] mt-0.5 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                    لم نتمكن من الاتصال بالخادم، ولا يمكننا القول ما إذا كان هناك تطابق أو لا.
                  </p>
                </div>
                <button onClick={runSearch}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                    isDark ? "border-red-700/40 hover:bg-red-900/20 text-red-300" : "border-red-300 hover:bg-red-100 text-red-700"
                  }`}>
                  <ArrowClockwise size={12} weight="bold" />
                  إعادة المحاولة
                </button>
              </div>
            )}

            {/* Empty — «لا تطابق في سجلاتك», never «آمن». */}
            {view === "empty" && (
              <div className={`p-4 rounded-2xl flex items-center gap-3 border ${isDark ? "bg-white/[0.03] border-white/[0.06]" : "bg-slate-50 border-slate-200"}`}>
                <Info size={22} weight="fill" className={isDark ? "text-zinc-400" : "text-slate-400"} />
                <div>
                  <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>لا تطابق في سجلاتك</p>
                  <p className={`text-[12px] mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                    لم نجد أي تطابق لهذا البحث في موكّليك أو قضاياك المسجّلة — هذا لا يحل محل الفحص المهني الكامل.
                  </p>
                </div>
              </div>
            )}

            {/* Ready — real matches, presented as leads to review, not verdicts. */}
            {view === "ready" && (
              <>
                <div className={`p-4 rounded-2xl flex items-center gap-3 border ${isDark ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200"}`}>
                  <Warning size={22} weight="fill" className="text-amber-500 shrink-0" />
                  <div>
                    <p className="text-[14px] font-bold text-amber-500">
                      {matches.length} تطابق محتمل في سجلاتك
                    </p>
                    <p className={`text-[12px] mt-0.5 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                      راجع كل نتيجة قبل قبول القضية — التطابق لا يعني بالضرورة تعارضًا فعليًا.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {matches.map((m, i) => (
                    <motion.div key={`${m.kind}-${m.clientId ?? m.caseRequestId ?? i}`}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className={`${card} p-5`}>
                      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{m.label}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isDark ? "bg-white/[0.05] text-zinc-300 border-white/10" : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}>{KIND_LABEL[m.kind]}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}>{MATCH_ON_LABEL[m.matchOn]}</span>
                            {m.viaFirm && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isDark ? "bg-royal/10 text-royal border-royal/20" : "bg-emerald-50 text-[#0B3D2E] border-emerald-200"
                              }`}>عبر المكتب</span>
                            )}
                          </div>
                          {m.detail && (
                            <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{m.detail}</p>
                          )}
                        </div>
                        {m.href && (
                          <Link href={m.href}
                            className={`shrink-0 inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-xl transition-colors ${
                              isDark ? "bg-[#0B3D2E]/20 text-emerald-400 hover:bg-[#0B3D2E]/40" : "bg-[#0B3D2E]/10 text-[#0B3D2E] hover:bg-[#0B3D2E]/20"
                            }`}>
                            <ArrowSquareOut size={14} weight="bold" />
                            فتح
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
