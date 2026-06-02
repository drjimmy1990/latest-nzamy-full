"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Gavel, MagnifyingGlass, UserPlus, CheckCircle,
  ArrowLeft, Star, SealCheck, Clock, Briefcase,
  FunnelSimple, Warning, Student, Key,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const UNASSIGNED_CASES = [
  { id: "C-F-001", title: "نزاع تجاري — شركة الأفق",        type: "تجاري",        urgency: "high",   openedDate: "١ أبريل ٢٠٢٦" },
  { id: "C-F-002", title: "قضية فصل تعسفي — موظف مطار",     type: "عمالي",        urgency: "medium", openedDate: "١٠ أبريل ٢٠٢٦" },
  { id: "C-F-003", title: "نزاع إيجار صناعي — العليا",       type: "عقاري",        urgency: "low",    openedDate: "٢٠ أبريل ٢٠٢٦" },
  { id: "C-F-004", title: "طعن إداري — قرار ترخيص",          type: "إداري",        urgency: "high",   openedDate: "٢٥ أبريل ٢٠٢٦" },
];

const TEAM = [
  { id: "1", name: "سارة المنصور",  role: "partner",   spec: "التجاري والعقاري", load: 8,  maxLoad: 15, rating: 4.9, available: true  },
  { id: "2", name: "تركي العمر",    role: "associate", spec: "العمالي والمدني",  load: 6,  maxLoad: 12, rating: 4.7, available: false },
  { id: "3", name: "نورة الشمري",   role: "associate", spec: "الأحوال الشخصية", load: 7,  maxLoad: 12, rating: 4.8, available: true  },
  { id: "4", name: "خالد الحربي",   role: "associate", spec: "الإداري",          load: 5,  maxLoad: 12, rating: 4.6, available: true  },
  { id: "5", name: "موضي القرشي",   role: "trainee",   spec: "متدربة — عام",    load: 2,  maxLoad: 5,  rating: 4.4, available: true  },
];

const ROLE_LABELS: Record<string, string> = {
  partner: "شريك", associate: "محامي", trainee: "متدرب", admin: "إداري",
};
const URGENCY_STYLE: Record<string, { label: string; cls: string }> = {
  high:   { label: "عاجل",   cls: "bg-red-50 text-red-500 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700/30" },
  medium: { label: "متوسط",  cls: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/30" },
  low:    { label: "عادي",   cls: "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.3 } }),
};

export default function FirmCasesAssignPage() {
  const { isDark } = useTheme();
  const [caseSearch, setCaseSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState<typeof UNASSIGNED_CASES[0] | null>(null);
  const [selectedMember, setSelectedMember] = useState<typeof TEAM[0] | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const filteredCases = UNASSIGNED_CASES.filter(c =>
    c.title.includes(caseSearch) || c.id.includes(caseSearch)
  );
  const filteredTeam = TEAM.filter(m => !onlyAvailable || m.available);

  const handleAssign = () => {
    if (!selectedCase || !selectedMember) return;
    setSubmitted(true);
  };

  if (submitted && selectedCase && selectedMember) {
    return (
      <div className={`p-8 max-w-[700px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`${card} p-10 text-center`}
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <CheckCircle size={40} weight="fill" className="text-emerald-500" />
          </motion.div>
          <h2 className={`text-[20px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-800"}`}>تم تعيين القضية بنجاح</h2>
          <p className={`text-[14px] mb-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <strong className="text-[#0B3D2E] dark:text-emerald-400">{selectedMember.name}</strong> مسؤول الآن عن:
          </p>
          <p className={`text-[16px] font-bold mb-6 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{selectedCase.title}</p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard/firm/cases">
              <motion.div whileHover={{ scale: 1.03 }}
                className="flex items-center gap-2 bg-[#0B3D2E] text-white font-bold px-5 py-2.5 rounded-xl text-sm cursor-pointer"
              >
                <Gavel size={15} /> عرض القضايا
              </motion.div>
            </Link>
            <button
              onClick={() => { setSubmitted(false); setSelectedCase(null); setSelectedMember(null); }}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-colors ${isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
            >
              تعيين أخرى
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`p-5 md:p-8 max-w-[1000px] mx-auto space-y-6 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="flex items-center justify-between">
        <div>
          <h1 className={`text-[22px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>تعيين قضية لمحامٍ</h1>
          <p className={`text-[13px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            اختر القضية ثم حدد المحامي المناسب
          </p>
        </div>
        <Link href="/dashboard/firm/cases">
          <motion.div whileHover={{ scale: 1.04 }}
            className={`flex items-center gap-2 text-[12px] font-bold px-3 py-2 rounded-xl cursor-pointer transition-colors ${isDark ? "bg-zinc-800 text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}
          >
            <ArrowLeft size={13} /> القضايا
          </motion.div>
        </Link>
      </motion.div>

      {/* Progress Indicator */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}
        className="flex items-center gap-3">
        {[
          { n: 1, label: "اختر القضية",  done: !!selectedCase },
          { n: 2, label: "اختر المحامي", done: !!selectedMember },
          { n: 3, label: "تأكيد التعيين", done: false },
        ].map((step, i) => (
          <div key={step.n} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold border-2 transition-all ${
              step.done
                ? "bg-emerald-500 border-emerald-500 text-white"
                : (i === 0 && !selectedCase) || (i === 1 && selectedCase && !selectedMember) || (i === 2 && selectedCase && selectedMember)
                  ? "border-[#0B3D2E] text-[#0B3D2E] dark:border-emerald-500 dark:text-emerald-400"
                  : isDark ? "border-zinc-700 text-zinc-600" : "border-zinc-200 text-zinc-400"
            }`}>
              {step.done ? <CheckCircle size={13} weight="fill" /> : step.n}
            </div>
            <span className={`text-[12px] font-medium hidden sm:block ${
              step.done ? "text-emerald-500" : isDark ? "text-zinc-500" : "text-zinc-400"
            }`}>{step.label}</span>
            {i < 2 && <div className={`w-8 h-px ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`} />}
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Step 1: Cases ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2} className={`${card} overflow-hidden`}>
          <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
            <p className={`text-[13px] font-bold mb-3 flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-800"}`}>
              <Gavel size={14} className="text-[#0B3D2E]" weight="duotone" />
              القضايا غير المعيّنة ({filteredCases.length})
            </p>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "bg-zinc-800 border-white/[0.07]" : "bg-zinc-50 border-zinc-200"}`}>
              <MagnifyingGlass size={13} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
              <input
                value={caseSearch}
                onChange={e => setCaseSearch(e.target.value)}
                placeholder="بحث..."
                className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-zinc-400"
              />
            </div>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.04] max-h-[400px] overflow-y-auto">
            {filteredCases.map((c, i) => {
              const urg = URGENCY_STYLE[c.urgency];
              const isSelected = selectedCase?.id === c.id;
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  onClick={() => setSelectedCase(isSelected ? null : c)}
                  className={`px-5 py-3.5 cursor-pointer transition-all ${
                    isSelected
                      ? isDark ? "bg-[#0B3D2E]/20 border-r-2 border-emerald-500" : "bg-[#0B3D2E]/5 border-r-2 border-[#0B3D2E]"
                      : isDark ? "hover:bg-white/[0.03]" : "hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className={`text-[13px] font-bold leading-snug flex-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{c.title}</p>
                    {isSelected && <CheckCircle size={16} weight="fill" className="text-emerald-500 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urg.cls}`}>{urg.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>{c.type}</span>
                    <span className={`text-[10px] flex items-center gap-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      <Clock size={9} /> {c.openedDate}
                    </span>
                    <span className={`text-[10px] font-mono ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>{c.id}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* ── Step 2: Team ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className={`${card} overflow-hidden`}>
          <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-[13px] font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-800"}`}>
                <UserPlus size={14} className="text-[#0B3D2E]" weight="duotone" />
                اختر المحامي ({filteredTeam.length})
              </p>
              <button
                onClick={() => setOnlyAvailable(!onlyAvailable)}
                className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  onlyAvailable
                    ? "bg-[#0B3D2E]/10 text-[#0B3D2E] dark:text-emerald-400"
                    : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"
                }`}
              >
                <FunnelSimple size={11} /> متاحون فقط
              </button>
            </div>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.04] max-h-[400px] overflow-y-auto">
            {filteredTeam.map((m, i) => {
              const isSelected = selectedMember?.id === m.id;
              const loadPct = Math.round((m.load / m.maxLoad) * 100);
              const loadColor = loadPct >= 80 ? "bg-red-400" : loadPct >= 60 ? "bg-amber-400" : "bg-emerald-500";
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  onClick={() => setSelectedMember(isSelected ? null : m)}
                  className={`px-5 py-3.5 cursor-pointer transition-all ${
                    isSelected
                      ? isDark ? "bg-[#0B3D2E]/20 border-r-2 border-emerald-500" : "bg-[#0B3D2E]/5 border-r-2 border-[#0B3D2E]"
                      : !m.available
                        ? "opacity-50 cursor-not-allowed"
                        : isDark ? "hover:bg-white/[0.03]" : "hover:bg-zinc-50"
                  }`}
                  style={{ pointerEvents: m.available ? "auto" : "none" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] flex items-center justify-center text-white text-sm font-bold">
                          {m.name.charAt(0)}
                        </div>
                        <span className={`absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full border border-white dark:border-zinc-900 ${m.available ? "bg-emerald-500" : "bg-zinc-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{m.name}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            m.role === "partner" ? "bg-[#C8A762]/10 text-[#C8A762]" :
                            m.role === "trainee" ? "bg-blue-500/10 text-blue-500" :
                            isDark ? "bg-royal/10 text-emerald-400" : "bg-royal/10 text-[#0B3D2E]"
                          }`}>{ROLE_LABELS[m.role]}</span>
                        </div>
                        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{m.spec}</p>
                      </div>
                    </div>
                    {isSelected && <CheckCircle size={16} weight="fill" className="text-emerald-500 flex-shrink-0 mt-1" />}
                  </div>

                  {/* Load bar */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
                      <motion.div
                        className={`h-full rounded-full ${loadColor}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${loadPct}%` }}
                        transition={{ duration: 0.7, delay: 0.2 + i * 0.04 }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono flex-shrink-0 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      {m.load}/{m.maxLoad}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Star size={9} weight="fill" className="text-[#C8A762]" />
                      <span className={`text-[10px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{m.rating}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* ── Step 3: Confirm ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}>
        <AnimatePresence>
          {selectedCase && selectedMember && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className={`${card} p-5`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <p className={`text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>ملخص التعيين</p>
                  <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                    <span className="text-[#0B3D2E] dark:text-emerald-400">{selectedMember.name}</span>
                    {" ← "}
                    {selectedCase.title}
                  </p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    {selectedMember.spec} · {URGENCY_STYLE[selectedCase.urgency].label} · حمل {selectedMember.load + 1}/{selectedMember.maxLoad}
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  onClick={handleAssign}
                  className="flex items-center gap-2 bg-[#0B3D2E] text-white font-bold px-5 py-3 rounded-xl text-sm cursor-pointer hover:bg-[#0d5238] transition-colors shadow-md flex-shrink-0"
                >
                  <UserPlus size={16} /> تأكيد التعيين
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(!selectedCase || !selectedMember) && (
          <div className={`flex items-center gap-2 text-[12px] px-4 py-3 rounded-xl ${isDark ? "bg-zinc-900 text-zinc-600 border border-white/[0.05]" : "bg-zinc-50 text-zinc-400 border border-zinc-100"}`}>
            <Warning size={13} />
            {!selectedCase ? "اختر القضية أولاً" : "اختر المحامي المناسب للمتابعة"}
          </div>
        )}
      </motion.div>
    </div>
  );
}
