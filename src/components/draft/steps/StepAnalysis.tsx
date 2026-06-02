"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Warning, Sparkle, ChatCircleDots, Gavel, Shield,
  Target, Minus, FileText, User, Buildings, Calendar,
  Hash, CheckCircle, WarningCircle, Brain, Circle, ArrowClockwise,
} from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";
import { MOCK_ANALYSIS, PRE_FILING_CHECKLIST, PRE_FILING_DEFAULT } from "@/components/draft/draftConstants";

interface StepAnalysisProps {
  isDark: boolean;
  memoType: string;
  memoSubType?: string;
  disputeSummary: string;
  setDisputeSummary: (v: string) => void;
  // judgment data from step 2
  plaintiffName?: string;
  defendantName?: string;
  judgmentCourt?: string;
  judgmentNumber?: string;
  judgmentDate?: string;
  judgmentText?: string;
  judgmentReasons?: string;
  partyOne?: { fullName?: string; companyName?: string } | null;
  preFilingAnswers: string[];
  setPreFilingAnswers: (v: string[]) => void;
  legalBranch: string;
}

// ─── Judgment Summary Card ─────────────────────────────────────────────────────
function JudgmentSummaryCard({
  isDark,
  plaintiffName, defendantName,
  judgmentCourt, judgmentNumber, judgmentDate,
  judgmentText, judgmentReasons, partyOne,
}: Omit<StepAnalysisProps, "memoType" | "disputeSummary" | "setDisputeSummary" | "legalBranch" | "preFilingAnswers" | "setPreFilingAnswers">) {
  const clientName = partyOne?.fullName || partyOne?.companyName || "موكلك";
  const hasAll = !!(plaintiffName && defendantName && judgmentCourt && judgmentNumber && judgmentDate && judgmentText);
  const hasPartial = !!(judgmentNumber || judgmentText);

  const borderClass = hasAll
    ? isDark ? "border-emerald-700/30 bg-emerald-900/5" : "border-emerald-200 bg-emerald-50/50"
    : hasPartial
    ? isDark ? "border-amber-700/30 bg-amber-900/5" : "border-amber-200 bg-amber-50/50"
    : isDark ? "border-red-700/30 bg-red-900/5" : "border-red-200 bg-red-50";

  const StatusIcon = hasAll ? CheckCircle : WarningCircle;
  const statusColor = hasAll ? "text-emerald-500" : hasPartial ? "text-amber-500" : "text-red-500";
  const statusText = hasAll
    ? "بيانات الحكم مكتملة"
    : hasPartial
    ? "بيانات جزئية — أكمل ما هو ناقص"
    : "بيانات الحكم مفقودة — ارجع للخطوة السابقة";

  const excerpt = (text?: string, chars = 130) =>
    text ? text.slice(0, chars) + (text.length > chars ? "..." : "") : null;

  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${borderClass}`}>
      {/* header */}
      <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${isDark ? "border-white/[0.06]" : "border-white/60"}`}>
        <FileText size={15} weight="duotone" className="text-[#C8A762] flex-shrink-0" />
        <p className={`flex-1 text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
          ملخص الحكم المطعون فيه — مستخرج تلقائياً من الصك
        </p>
        <div className="flex items-center gap-1.5">
          <StatusIcon size={13} weight="fill" className={statusColor} />
          <span className={`text-[10px] font-bold ${statusColor}`}>{statusText}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Parties */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "الطاعن / المدعي",          icon: User,      value: plaintiffName },
            { label: "المطعون ضده / المدعى عليه", icon: Buildings, value: defendantName },
          ].map(({ label, icon: Icon, value }) => (
            <div key={label} className={`p-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-white"}`}>
              <p className={`text-[9px] font-bold uppercase mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{label}</p>
              <div className="flex items-center gap-1.5">
                <Icon size={11} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <p className={`text-[11px] font-semibold ${value ? (isDark ? "text-zinc-300" : "text-zinc-700") : "text-red-400 italic"}`}>
                  {value || "غير محدد"}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          {[
            { icon: Hash,     label: "رقم الحكم",  value: judgmentNumber },
            { icon: Calendar, label: "تاريخ الحكم", value: judgmentDate },
            { icon: Gavel,    label: "المحكمة",     value: judgmentCourt },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] ${
              value
                ? isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"
                : "border-red-400/30 text-red-400 italic"
            }`}>
              <Icon size={9} />
              <span className={isDark ? "text-zinc-600" : "text-slate-400"}>{label}:</span>
              <span className="font-semibold">{value || "مفقود"}</span>
            </div>
          ))}
        </div>

        {/* Verdict */}
        {judgmentText ? (
          <div className={`p-3 rounded-xl border-r-2 border-[#C8A762] ${isDark ? "bg-white/[0.02]" : "bg-white"}`}>
            <p className="text-[9px] font-bold uppercase mb-1 text-[#C8A762]">منطوق الحكم</p>
            <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{excerpt(judgmentText)}</p>
          </div>
        ) : (
          <div className={`p-2.5 rounded-xl border-dashed border ${isDark ? "border-red-700/30" : "border-red-200"}`}>
            <p className="text-[11px] text-red-400 italic">منطوق الحكم غير مُدخَل — يُضعف مذكرة الطعن</p>
          </div>
        )}

        {/* Reasons */}
        {judgmentReasons && (
          <div className={`p-3 rounded-xl border-r-2 border-blue-400 ${isDark ? "bg-white/[0.02]" : "bg-blue-50/40"}`}>
            <p className="text-[9px] font-bold uppercase mb-1 text-blue-400">موجز أسباب الحكم</p>
            <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{excerpt(judgmentReasons)}</p>
          </div>
        )}

        {/* Client note */}
        {hasAll && (
          <div className={`flex items-center gap-2 p-2.5 rounded-xl border ${isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
            <CheckCircle size={12} weight="fill" className="text-emerald-500 flex-shrink-0" />
            <p className={`text-[11px] ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
              موكلك <strong>{clientName}</strong> يتخذ صفة الطاعن — سيُبنى الطعن ردًّا على المنطوق أعلاه
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI Pre-Filing Checklist ─────────────────────────────────────────────────
function AiPreFilingCheck({
  isDark,
  memoType,
  memoSubType,
  legalBranch,
  checked,
  toggle,
}: {
  isDark: boolean;
  memoType: string;
  memoSubType: string;
  legalBranch: string;
  checked: Set<string>;
  toggle: (id: string) => void;
}) {
  let resolvedSub = memoSubType;
  if (memoType === "reply") {
    if (legalBranch === "إداري") {
      resolvedSub = "إدارية أمام ديوان المظالم";
    } else if (legalBranch === "جزائي") {
      resolvedSub = "جزائية خاصة (تعويض ضرر)";
    } else if (["جمركية", "ضريبية", "زكوية"].includes(legalBranch)) {
      resolvedSub = "تحرير مطالبة أمام لجنة";
    } else {
      resolvedSub = "حقوقية (مدني/تجاري/عائلي)";
    }
  }

  const items = PRE_FILING_CHECKLIST[resolvedSub] ?? PRE_FILING_DEFAULT;
  const [expanded, setExpanded] = useState(true);

  const required   = items.filter(i => i.required);
  const done       = required.filter(i => checked.has(i.id)).length;
  const allDone    = done === required.length && required.length > 0;
  const pct        = required.length > 0 ? Math.round((done / required.length) * 100) : 100;

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-colors ${
      allDone
        ? isDark ? "border-emerald-700/40 bg-emerald-900/5" : "border-emerald-200 bg-emerald-50/40"
        : isDark ? "border-[#C8A762]/25 bg-[#C8A762]/[0.03]" : "border-amber-200 bg-amber-50/40"
    }`}>

      {/* Header */}
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-right">
        <div className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl ${
          allDone ? "bg-emerald-500" : isDark ? "bg-[#C8A762]/15" : "bg-amber-100"
        }`}>
          <Brain size={17} weight="duotone" className={allDone ? "text-white" : "text-[#C8A762]"} />
        </div>
        <div className="flex-1 text-right">
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
            🧠 المستشار المسبق — تحقق AI من الشكل
          </p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            بناءً على بيانات القضية، رصد AI هذه الاشتراطات الشكلية الواجب استيفاؤها قبل البت في الموضوع
          </p>
        </div>
        {/* Progress pill */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
            allDone
              ? isDark ? "border-emerald-700/30 bg-emerald-900/20 text-emerald-400" : "border-emerald-300 bg-emerald-50 text-emerald-700"
              : isDark ? "border-[#C8A762]/30 bg-[#C8A762]/10 text-[#C8A762]" : "border-amber-300 bg-amber-50 text-amber-700"
          }`}>
            {allDone ? "✓ مستوفٍ" : `${done}/${required.length} شرط`}
          </div>
          <motion.span animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: 0.2 }}
            className={isDark ? "text-zinc-600" : "text-zinc-400"}>⌄</motion.span>
        </div>
      </button>

      {/* Progress bar */}
      <div className={`h-0.5 mx-4 mb-1 rounded-full ${isDark ? "bg-white/[0.04]" : "bg-zinc-100"}`}>
        <motion.div className={`h-full rounded-full ${
          allDone ? "bg-emerald-500" : "bg-[#C8A762]"
        }`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
      </div>

      {/* Body */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className={`px-4 pb-4 pt-2 space-y-2 border-t ${
              isDark ? "border-white/[0.05]" : "border-zinc-100"
            }`}>

              {/* AI tag */}
              <div className={`flex items-center gap-1.5 mb-1`}>
                <ArrowClockwise size={10} className="text-[#C8A762] animate-spin" style={{ animationDuration: "3s" }} />
                <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-[#C8A762]/60" : "text-amber-600/70"}`}>
                  تحليل AI للمتطلبات الشكلية — خاص بـ {memoSubType}
                </span>
              </div>

              {items.map(item => {
                const isChecked = checked.has(item.id);
                return (
                  <button key={item.id} onClick={() => toggle(item.id)}
                    className={`w-full text-right rounded-xl border p-3.5 transition-all flex items-start gap-3 ${
                      isChecked
                        ? isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"
                        : isDark ? "border-white/[0.07] hover:border-white/[0.14] bg-white/[0.01]" : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}>
                    {isChecked
                      ? <CheckCircle size={15} weight="fill" className="flex-shrink-0 mt-0.5 text-emerald-500" />
                      : <Circle size={15} className={`flex-shrink-0 mt-0.5 ${item.required ? "text-amber-500" : isDark ? "text-zinc-600" : "text-zinc-300"}`} />
                    }
                    <div className="flex-1">
                      <p className={`text-[12px] font-semibold leading-snug ${
                        isChecked
                          ? isDark ? "text-emerald-400" : "text-emerald-700"
                          : isDark ? "text-zinc-200" : "text-zinc-700"
                      }`}>{item.text}</p>
                      {item.hint && (
                        <p className={`text-[10px] mt-0.5 leading-relaxed ${
                          isDark ? "text-zinc-600" : "text-zinc-400"
                        }`}>{item.hint}</p>
                      )}
                    </div>
                    {item.required && !isChecked && (
                      <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
                        isDark ? "bg-amber-500/10 text-amber-500" : "bg-amber-50 text-amber-600 border border-amber-200"
                      }`}>إلزامي</span>
                    )}
                  </button>
                );
              })}

              {allDone && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex items-center gap-2 rounded-xl px-4 py-3 ${
                    isDark ? "bg-emerald-900/15 border border-emerald-700/20" : "bg-emerald-50 border border-emerald-200/60"
                  }`}>
                  <CheckCircle size={14} weight="fill" className="text-emerald-500" />
                  <p className={`text-[12px] font-semibold ${
                    isDark ? "text-emerald-400" : "text-emerald-700"
                  }`}>الدعوى مستوفية شكلاً — AI جاهز للمتابعة في الموضوع ✓</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main StepAnalysis ─────────────────────────────────────────────────────────
export function StepAnalysis({
  isDark, memoType, memoSubType, disputeSummary, setDisputeSummary,
  plaintiffName, defendantName, judgmentCourt, judgmentNumber,
  judgmentDate, judgmentText, judgmentReasons, partyOne,
  preFilingAnswers, setPreFilingAnswers, legalBranch,
}: StepAnalysisProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const isAppeal = memoType === "appeal" || memoType === "reply";

  const sections = [
    { title: "الاتهامات / المطالب", items: MOCK_ANALYSIS.charges,        icon: Gavel,   color: "text-red-500",     bg: isDark ? "border-red-700/20 bg-red-900/10"         : "border-red-200 bg-red-50" },
    { title: "الأدلة المتاحة",      items: MOCK_ANALYSIS.evidence,        icon: Shield,  color: "text-emerald-500", bg: isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50" },
    { title: "التناقضات المكتشفة",  items: MOCK_ANALYSIS.contradictions,  icon: Target,  color: "text-[#C8A762]",   bg: isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5"     : "border-amber-200 bg-amber-50" },
    { title: "نقاط الضعف",          items: MOCK_ANALYSIS.weaknesses,      icon: Warning, color: "text-orange-500",  bg: isDark ? "border-orange-700/20 bg-orange-900/10"   : "border-orange-200 bg-orange-50" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* ── AI Pre-Filing Checklist (case and reply) ── */}
      {(memoType === "case" || memoType === "reply") && (
        <AiPreFilingCheck
          isDark={isDark}
          memoType={memoType}
          memoSubType={memoSubType || ""}
          legalBranch={legalBranch}
          checked={new Set(preFilingAnswers)}
          toggle={(id) => {
            const next = new Set(preFilingAnswers);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setPreFilingAnswers(Array.from(next));
          }}
        />
      )}

      {/* ── Judgment summary card (appeal / reply only) ── */}
      {isAppeal && (
        <JudgmentSummaryCard
          isDark={isDark}
          plaintiffName={plaintiffName}
          defendantName={defendantName}
          judgmentCourt={judgmentCourt}
          judgmentNumber={judgmentNumber}
          judgmentDate={judgmentDate}
          judgmentText={judgmentText}
          judgmentReasons={judgmentReasons}
          partyOne={partyOne}
        />
      )}

      {/* موجز النزاع (case only) */}
      {memoType === "case" && (
        <div className={`${card} p-5 shadow-sm border-2 ${isDark ? "border-[#0B3D2E]/30" : "border-emerald-200"}`}>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} className="text-emerald-500" weight="duotone" />
            <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>ملخص وقائع الدعوى (AI)</h3>
          </div>
          <div className="relative">
            <textarea value={disputeSummary} onChange={e => setDisputeSummary(e.target.value)}
              placeholder="بناءً على المعطيات، قام AI بصياغة هذا الموجز للنزاع. يمكنك تعديله إذا لزم الأمر..." rows={3}
              className={`w-full resize-none rounded-xl border p-3 pe-12 text-[12px] outline-none leading-relaxed ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`} />
            <div className="absolute bottom-2 start-2">
              <VoiceInput onTranscript={(t) => setDisputeSummary(disputeSummary ? `${disputeSummary} ${t}` : t)} compact />
            </div>
          </div>
        </div>
      )}

      {/* Analysis sections */}
      {sections.map(({ title, items, icon: Icon, color, bg }) => (
        <div key={title} className={`rounded-2xl p-4 border ${bg}`}>
          <div className="flex items-center gap-2 mb-2">
            <Icon size={15} className={color} weight="duotone" />
            <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>{title}</h3>
          </div>
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className={`flex items-start gap-2 text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                <Minus size={10} className={`flex-shrink-0 mt-1 ${color}`} /> {item}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* الاستراتيجية */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkle size={15} className="text-[#C8A762]" weight="fill" />
          <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>الاستراتيجية المقترحة</h3>
        </div>
        <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{MOCK_ANALYSIS.strategy}</p>
      </div>

      {/* أسئلة AI */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center gap-2 mb-3">
          <ChatCircleDots size={16} className="text-[#C8A762]" weight="duotone" />
          <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>أسئلة لتحسين المذكرة</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${isDark ? "border-zinc-600 text-zinc-500" : "border-zinc-300 text-zinc-400"}`}>اختياري</span>
        </div>
        <div className="space-y-3">
          {[
            { q: "هل صدر إشعار خطي للموكل قبل الفصل؟ وما مدته؟", key: "notice" },
            { q: "هل تقدّم الموكل بشكوى لوزارة الموارد البشرية مسبقاً؟", key: "complaint" },
            { q: "هل لديك شاهد يثبت وقائع الفصل؟ وهل وافق على الإدلاء؟", key: "witness" },
          ].map(({ q, key }) => (
            <div key={key} className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-zinc-800/40" : "border-zinc-100 bg-zinc-50"}`}>
              <p className={`text-[12px] font-medium mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{q}</p>
              <div className="relative">
                <textarea rows={2} placeholder="اكتب إجابتك هنا أو اضغط صوت... (اختياري)"
                  className={`w-full resize-none rounded-lg border px-3 py-2 pe-12 text-[12px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
                <div className="absolute bottom-2 start-2">
                  <VoiceInput onTranscript={() => {}} compact />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
