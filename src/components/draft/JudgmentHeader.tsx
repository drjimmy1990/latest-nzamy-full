"use client";

import { motion } from "framer-motion";
import { Gavel, Buildings, Hash, CalendarBlank, Article, FileText } from "@phosphor-icons/react";

interface JudgmentHeaderProps {
  isDark: boolean;
  plaintiffName: string;   setPlaintiffName: (v: string) => void;
  defendantName: string;   setDefendantName: (v: string) => void;
  judgmentCourt: string;   setJudgmentCourt: (v: string) => void;
  judgmentNumber: string;  setJudgmentNumber: (v: string) => void;
  judgmentDate: string;    setJudgmentDate: (v: string) => void;
  judgmentText: string;    setJudgmentText: (v: string) => void;
  judgmentReasons: string; setJudgmentReasons: (v: string) => void;
}

const COURTS = [
  "المحكمة الإدارية",
  "المحكمة العمالية",
  "المحكمة التجارية",
  "المحكمة الجزائية",
  "المحكمة العامة",
  "المحكمة المدنية",
  "محكمة الاستئناف الإدارية",
  "ديوان المظالم",
  "هيئة الزكاة والضريبة والجمارك",
  "لجنة التسوية الودية",
];

export function JudgmentHeader({
  isDark,
  plaintiffName, setPlaintiffName,
  defendantName, setDefendantName,
  judgmentCourt, setJudgmentCourt,
  judgmentNumber, setJudgmentNumber,
  judgmentDate, setJudgmentDate,
  judgmentText, setJudgmentText,
  judgmentReasons, setJudgmentReasons,
}: JudgmentHeaderProps) {
  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const input = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition-colors ${
    isDark
      ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 focus:border-royal/40"
      : "border-zinc-200 bg-zinc-50/80 text-zinc-800 placeholder:text-zinc-400 focus:border-royal/40"
  }`;

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className={`${card} shadow-sm overflow-hidden`}>

      {/* Header bar */}
      <div className={`flex items-center gap-2.5 px-5 py-3.5 border-b ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-zinc-100 bg-zinc-50/60"}`}>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${isDark ? "bg-red-500/10" : "bg-red-50"}`}>
          <Gavel size={15} weight="duotone" className="text-red-500" />
        </div>
        <div>
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
            بيانات الحكم المطعون فيه
          </p>
          <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            بيانات الحكم الصادر الذي يتم الطعن فيه / الرد عليه
          </p>
        </div>
        {/* VS Badge */}
        {(plaintiffName || defendantName) && (
          <div className={`mr-auto flex items-center gap-2 rounded-xl px-3 py-1.5 border text-[11px] font-bold ${
            isDark ? "border-zinc-700 bg-zinc-800/60 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"
          }`}>
            <span className={isDark ? "text-emerald-400" : "text-emerald-600"}>{plaintiffName || "المدعي"}</span>
            <span className="text-zinc-400">ضـد</span>
            <span className={isDark ? "text-red-400" : "text-red-600"}>{defendantName || "المدعى عليه"}</span>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">

        {/* Parties row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-emerald-500" : "text-emerald-600"}`}>
              ✦ المدعي / الطاعن
            </label>
            <input value={plaintiffName} onChange={e => setPlaintiffName(e.target.value)}
              placeholder="اسم المدعي أو الطاعن..." className={input} />
          </div>
          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-red-500" : "text-red-600"}`}>
              ✦ المدعى عليه / المطعون ضده
            </label>
            <input value={defendantName} onChange={e => setDefendantName(e.target.value)}
              placeholder="اسم المدعى عليه أو الجهة..." className={input} />
          </div>
        </div>

        {/* Court + number + date */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              <Hash size={10} /> رقم الحكم
            </label>
            <input value={judgmentNumber} onChange={e => setJudgmentNumber(e.target.value)}
              placeholder="٢٠٢٤/... " className={input} />
          </div>
          <div className="col-span-1">
            <label className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              <CalendarBlank size={10} /> تاريخ الحكم
            </label>
            <input type="date" value={judgmentDate} onChange={e => setJudgmentDate(e.target.value)}
              className={input} />
          </div>
          <div className="col-span-1">
            <label className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              <Buildings size={10} /> المحكمة المختصة
            </label>
            <select value={judgmentCourt} onChange={e => setJudgmentCourt(e.target.value)}
              className={input}>
              <option value="">اختر أو اكتب...</option>
              {COURTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Judgment text */}
        <div>
          <label className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <Article size={10} /> منطوق الحكم
          </label>
          <textarea value={judgmentText} onChange={e => setJudgmentText(e.target.value)}
            rows={2}
            placeholder='مثال: "حكمت المحكمة بإلزام المدعى عليه بأداء مبلغ..."'
            className={`${input.replace("py-2.5", "py-3")} resize-none leading-relaxed`} />
        </div>

        {/* Reasons */}
        <div>
          <label className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <FileText size={10} /> موجز الأسباب التي عوّل عليها الحكم
          </label>
          <textarea value={judgmentReasons} onChange={e => setJudgmentReasons(e.target.value)}
            rows={3}
            placeholder='اذكر الأسباب الرئيسية التي بنى عليها الحكم... مثال: "عوّلت المحكمة على كون العقد مكتوباً، وأن المدعي لم يُثبت..."'
            className={`${input.replace("py-2.5", "py-3")} resize-none leading-relaxed`} />
        </div>

        {/* AI hint */}
        <p className={`text-[10px] rounded-lg px-3 py-2 border ${
          isDark ? "border-royal/20 bg-royal/5 text-zinc-500" : "border-royal/15 bg-royal/[0.03] text-slate-400"
        }`}>
          💡 هذه البيانات ستُدمج تلقائياً في رأس المذكرة — وسيستخدمها AI لتحديد مواطن الطعن وبناء الدفوع
        </p>
      </div>
    </motion.div>
  );
}
