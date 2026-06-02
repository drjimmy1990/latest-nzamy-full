"use client";

import { CheckCircle } from "@phosphor-icons/react";
import type { OutputType, SearchDepth } from "../_types";
import type { AGENTS_DEEP } from "../_constants";

interface SettingsStepProps {
  isDark: boolean;
  card: string;
  selectedType: OutputType | "";
  agents: typeof AGENTS_DEEP;
  searchDepth: SearchDepth;
  setSearchDepth: (d: SearchDepth) => void;
  studyGoal: string; // receives the goal from ContextStudy
  litigationStage: "first" | "appeal" | "cassation";
  setLitigationStage: (s: "first" | "appeal" | "cassation") => void;
  memoStructure: { facts: boolean; legal: boolean; recommendation: boolean; attachments: boolean };
  setMemoStructure: (fn: (prev: { facts: boolean; legal: boolean; recommendation: boolean; attachments: boolean }) => { facts: boolean; legal: boolean; recommendation: boolean; attachments: boolean }) => void;
  memoDetailLevel: "brief" | "detailed" | "comprehensive";
  setMemoDetailLevel: (l: "brief" | "detailed" | "comprehensive") => void;
  researchSources: { nzamy: boolean; laws: boolean; judgments: boolean; decrees: boolean };
  setResearchSources: (fn: (prev: { nzamy: boolean; laws: boolean; judgments: boolean; decrees: boolean }) => { nzamy: boolean; laws: boolean; judgments: boolean; decrees: boolean }) => void;
  researchLimit: "5" | "10" | "unlimited";
  setResearchLimit: (l: "5" | "10" | "unlimited") => void;
}

export function SettingsStep({
  isDark, card, selectedType, agents,
  searchDepth, setSearchDepth,
  studyGoal,
  litigationStage, setLitigationStage,
  memoStructure, setMemoStructure,
  memoDetailLevel, setMemoDetailLevel,
  researchSources, setResearchSources,
  researchLimit, setResearchLimit,
}: SettingsStepProps) {
  return (
    <div className="space-y-4">
      {/* Depth - shown for study/memo */}
      {(selectedType === "study" || selectedType === "legal-memo") && (
        <div className={`${card} p-4`}>
          <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>عمق البحث</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "quick" as SearchDepth, label: "سريع", desc: "نظامي DB فقط", time: "~١ دقيقة", agents: 2 },
              { key: "deep" as SearchDepth, label: "عميق", desc: "متعدد المصادر", time: "~٤ دقائق", agents: 5 },
              { key: "comprehensive" as SearchDepth, label: "شامل", desc: "كل المصادر + تحليل", time: "~٨ دقائق", agents: 6 },
            ] as const).map(d => (
              <button key={d.key} onClick={() => setSearchDepth(d.key)}
                className={`rounded-xl border p-3 text-center transition-all ${searchDepth === d.key
                  ? "border-[#0B3D2E]/40 bg-[#0B3D2E]/10"
                  : isDark ? "border-white/[0.06] hover:border-white/[0.10]" : "border-slate-200 hover:border-slate-300"
                }`}>
                <p className={`text-[12px] font-bold ${searchDepth === d.key ? "text-[#0B3D2E] dark:text-emerald-400" : isDark ? "text-zinc-300" : "text-slate-700"}`}>{d.label}</p>
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{d.desc}</p>
                <p className={`text-[9px] mt-1 font-mono ${isDark ? "text-zinc-700" : "text-slate-400"}`}>{d.time} · {d.agents} وكلاء</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Study-specific: Litigation stage — only for disputes */}
      {selectedType === "study" && studyGoal === "dispute" && (
        <div className={`${card} p-4`}>
          <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مرحلة التقاضي</p>
          <p className={`text-[10px] mb-3 ${isDark ? "text-zinc-700" : "text-slate-400"}`}>حدد الدرجة التي تنظر فيها القضية حالياً</p>
          <div className="flex gap-2">
            {([{ id: "first" as const, label: "ابتدائية", sub: "محكمة أول درجة" },
               { id: "appeal" as const, label: "استئناف",  sub: "محكمة استئناف" },
               { id: "cassation" as const, label: "نقض / تمييز", sub: "المحكمة العليا" },
            ]).map(opt => (
              <button key={opt.id} onClick={() => setLitigationStage(opt.id)}
                className={`flex-1 py-3 px-2 rounded-xl border text-center transition-all ${
                  litigationStage === opt.id
                    ? isDark ? "border-blue-500/40 bg-blue-900/15" : "border-blue-400/50 bg-blue-50"
                    : isDark ? "border-white/[0.07] text-zinc-400 hover:border-blue-500/30" : "border-slate-200 text-slate-500 hover:border-blue-300"
                }`}>
                <p className={`text-[12px] font-bold ${litigationStage === opt.id ? isDark ? "text-blue-300" : "text-blue-700" : ""}`}>{opt.label}</p>
                <p className={`text-[9px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{opt.sub}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Memo-specific: Structure checkboxes */}
      {selectedType === "legal-memo" && (
        <div className={`${card} p-4`}>
          <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>هيكل المذكرة</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "facts" as const,           label: "الوقائع" },
              { key: "legal" as const,           label: "الأساس النظامي" },
              { key: "recommendation" as const,  label: "التوصية" },
              { key: "attachments" as const,     label: "الملاحق" },
            ]).map(({ key, label }) => {
              const active = memoStructure[key];
              return (
                <button key={key} onClick={() => setMemoStructure(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[12px] transition-all ${
                    active
                      ? isDark ? "border-emerald-700/30 bg-emerald-900/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : isDark ? "border-white/[0.07] text-zinc-400 hover:border-white/[0.12]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}>
                  <CheckCircle size={13} weight={active ? "fill" : "regular"} className={active ? "text-emerald-500" : isDark ? "text-zinc-600" : "text-slate-400"} />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>درجة التفصيل</p>
            <div className="flex gap-2">
              {([
                { key: "brief" as const,         label: "موجز" },
                { key: "detailed" as const,      label: "مفصّل" },
                { key: "comprehensive" as const, label: "شامل" },
              ]).map(({ key, label }) => (
                <button key={key} onClick={() => setMemoDetailLevel(key)}
                  className={`flex-1 py-2 rounded-xl border text-[12px] font-medium transition-all ${
                    memoDetailLevel === key
                      ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#C8A762]/50 bg-[#C8A762]/8 text-[#0B3D2E] font-semibold"
                      : isDark ? "border-white/[0.07] text-zinc-400 hover:border-[#C8A762]/20" : "border-slate-200 text-slate-500 hover:border-[#C8A762]/30"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Research-specific: Sources filter */}
      {selectedType === "research" && (
        <div className={`${card} p-4`}>
          <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مصادر البحث</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "nzamy" as const,    label: "قاعدة نظامي" },
              { key: "laws" as const,     label: "الأنظمة واللوائح" },
              { key: "judgments" as const, label: "الأحكام القضائية" },
              { key: "decrees" as const,  label: "المراسيم الملكية" },
            ]).map(({ key, label }) => {
              const active = researchSources[key];
              return (
                <button key={key} onClick={() => setResearchSources(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[11px] transition-all ${
                    active
                      ? isDark ? "border-purple-700/30 bg-purple-900/10 text-purple-400" : "border-purple-200 bg-purple-50 text-purple-700"
                      : isDark ? "border-white/[0.07] text-zinc-400 hover:border-purple-500/20" : "border-slate-200 text-slate-500 hover:border-purple-200"
                  }`}>
                  <CheckCircle size={12} weight={active ? "fill" : "regular"} className={active ? "text-purple-500" : isDark ? "text-zinc-600" : "text-slate-400"} />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2 items-center">
            <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-500"}`}>حد النتائج:</p>
            {([
              { key: "5" as const,         label: "٥" },
              { key: "10" as const,        label: "١٠" },
              { key: "unlimited" as const, label: "غير محدود" },
            ]).map(({ key, label }) => (
              <button key={key} onClick={() => setResearchLimit(key)}
                className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                  researchLimit === key
                    ? isDark ? "border-purple-500/40 bg-purple-900/15 text-purple-400" : "border-purple-300 bg-purple-50 text-purple-700"
                    : isDark ? "border-white/[0.07] text-zinc-400 hover:border-purple-500/20" : "border-slate-200 text-slate-500 hover:border-purple-200"
                }`}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Agent preview (always shown) */}
      <div className={`${card} p-4`}>
        <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الوكلاء الذين سيعملون</p>
        <div className={`grid gap-2 ${agents.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <div key={agent.key} className={`rounded-xl border p-2.5 flex items-center gap-2 ${agent.border} ${agent.bg}`}>
                <Icon size={13} className={agent.color} />
                <div className="min-w-0">
                  <p className={`text-[10px] font-bold truncate ${agent.color}`}>{agent.label}</p>
                  <p className={`text-[9px] truncate ${isDark ? "text-zinc-700" : "text-slate-400"}`}>{agent.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
