"use client";

import { Dispatch, SetStateAction, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloudArrowUp, ImageSquare, Warning, CheckCircle, Circle } from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";
import {
  MEMO_MAIN_TYPES, MEMO_SUB_TYPES_REGULAR, MEMO_SUB_TYPES_COMMITTEES,
  LEGAL_BRANCHES_REGULAR, LEGAL_BRANCHES_COMMITTEES, COMMITTEE_BRANCH_IDS,
  REQUIRES_PRIOR_DOCS_TYPES,
  PRE_FILING_CHECKLIST, PRE_FILING_DEFAULT,
} from "@/components/draft/draftConstants";

// TODO: إعادة إضافة "المستشار المسبق" (PreFilingChecklist) في مرحلة الإنتاج عند ربطه بقاعدة البيانات

interface StepIdentifyProps {
  isDark: boolean;
  clientRole: "plaintiff" | "defendant" | "";
  setClientRole: (v: "plaintiff" | "defendant" | "") => void;
  memoType: string;
  setMemoType: (v: string) => void;
  memoSubType: string;
  setMemoSubType: (v: string) => void;
  legalBranch: string;
  setLegalBranch: (v: string) => void;
  notesText: string;
  setNotesText: (v: string) => void;
  showPreFiling: boolean;
  setShowPreFiling: Dispatch<SetStateAction<boolean>>;
}

// Maps each memoSubType → which LEGAL_BRANCHES_REGULAR entries are relevant.
// null means "show all". Keeps legalBranch picker focused, removes duplication.
const SUBTYPE_BRANCH_FILTER: Record<string, string[] | null> = {
  "حقوقية (مدني/تجاري/عائلي)": [
    "عمالي", "تجاري", "مدني", "أسرة (أحوال شخصية)", "عقاري", "تنفيذ",
    "إفلاس", "مالي / مصرفي", "تأمين", "ملكية فكرية", "طبي",
    "بيئي", "اتصالات وتقنية", "بحري", "نقل وطيران", "رياضي",
    "تحكيم", "حقوق إنسان", "أمن سيبراني",
  ],
  "إدارية أمام ديوان المظالم": ["إداري"],
  "جزائية خاصة (تعويض ضرر)": ["جزائي"],
  // null = show all branches (reply/appeal can span any legal area)
  "مذكرة رد أساسية": null,
  "مذكرة إلحاقية (إضافة أدلة)": null,
  "مذكرة ختامية قبل الحكم": null,
  "استئناف (درجة ثانية)": null,
  "نقض (المحكمة العليا)": null,
  "التماس إعادة النظر": null,
};

export function StepIdentify({
  isDark, clientRole, setClientRole, memoType, setMemoType,
  memoSubType, setMemoSubType, legalBranch, setLegalBranch,
  notesText, setNotesText, showPreFiling, setShowPreFiling,
}: StepIdentifyProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const isDraftType     = memoType === "case";
  const needsPriorDocs  = REQUIRES_PRIOR_DOCS_TYPES.has(memoType);

  // Other/Custom branch detection & state sync
  const isCustom = legalBranch !== "" && !LEGAL_BRANCHES_REGULAR.includes(legalBranch) && !LEGAL_BRANCHES_COMMITTEES.includes(legalBranch);
  const [isOther, setIsOther] = useState(isCustom || legalBranch === "أخرى");

  useEffect(() => {
    const isCustom = legalBranch !== "" && !LEGAL_BRANCHES_REGULAR.includes(legalBranch) && !LEGAL_BRANCHES_COMMITTEES.includes(legalBranch);
    setIsOther(isCustom || legalBranch === "أخرى");
  }, [legalBranch]);

  // Compute filtered branches from selected subtype
  // filterRule === null → show all; filterRule === string[] → show only those
  const filterRule      = memoSubType ? (SUBTYPE_BRANCH_FILTER[memoSubType] ?? null) : null;
  const filteredRegular = filterRule === null
    ? LEGAL_BRANCHES_REGULAR
    : LEGAL_BRANCHES_REGULAR.filter(b => filterRule.includes(b));

  // Auto-select branch when filter resolves to a single option (via useEffect)
  const autoSelectedBranch = filteredRegular.length === 1 ? filteredRegular[0] : null;
  useEffect(() => {
    if (autoSelectedBranch && legalBranch !== autoSelectedBranch) {
      setLegalBranch(autoSelectedBranch);
    }
  }, [autoSelectedBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide the legalBranch picker when auto-selected (single option)
  const showBranchPicker = filteredRegular.length > 1;

  // Show committees section only when memoSubType doesn't restrict to regular courts
  const isCommitteeSubtype = COMMITTEE_BRANCH_IDS.has(legalBranch);
  const activeSubTypes = memoType
    ? (isCommitteeSubtype ? MEMO_SUB_TYPES_COMMITTEES : MEMO_SUB_TYPES_REGULAR)[memoType] ?? []
    : [];

  function handleBranchChange(branch: string) {
    if (branch !== "أخرى") {
      setIsOther(false);
    }
    const willBeCommittee = COMMITTEE_BRANCH_IDS.has(branch);
    const nextSubTypes = memoType
      ? (willBeCommittee ? MEMO_SUB_TYPES_COMMITTEES : MEMO_SUB_TYPES_REGULAR)[memoType] ?? []
      : [];
    if (memoSubType && !nextSubTypes.includes(memoSubType)) setMemoSubType("");
    setLegalBranch(branch);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* صفة الموكل — مخفي في الأوضاع المتخصصة */}
      {!["arbitration", "notary", "report", "minutes"].includes(memoType) && (
        <div className={`${card} p-5 shadow-sm`}>
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>صفة الموكل</p>
          <div className="grid grid-cols-2 gap-3">
            {([["plaintiff", "مُدَّعِي", "أنت تقم برفع الدعوى"], ["defendant", "مُدَّعَى عليه", "ترد على دعوى مرفوعة ضدك"]] as const).map(([key, label, desc]) => (
              <motion.button key={key} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => setClientRole(key)}
                className={`rounded-xl border p-4 text-start transition-all ${
                  clientRole === key
                    ? isDark ? "border-[#0B3D2E]/50 bg-[#0B3D2E]/20" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5"
                    : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-zinc-200 hover:border-zinc-300"
                }`}>
                <p className={`font-bold text-[14px] mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{label}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{desc}</p>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* نوع المذكرة */}
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>نوع المذكرة</p>
        <div className="grid grid-cols-2 gap-3">
          {MEMO_MAIN_TYPES.map(mt => (
            <motion.button key={mt.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { setMemoType(mt.id); setMemoSubType(""); }}
              className={`rounded-xl border p-3.5 text-start transition-all ${
                memoType === mt.id
                  ? isDark ? "border-[#0B3D2E]/50 bg-[#0B3D2E]/20" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5"
                  : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-zinc-200 hover:border-zinc-300"
              }`}>
              <p className={`font-bold text-[13px] mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{mt.label}</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{mt.desc}</p>
            </motion.button>
          ))}
        </div>



        <AnimatePresence>
          {memoType && activeSubTypes.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 overflow-hidden">
              <p className={`text-[11px] font-semibold mb-2 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                {memoType === "case" ? "نوع الدعوى" : memoType === "reply" ? "نوع المذكرة" : "نوع الطعن"}
                {isCommitteeSubtype && <span className="ms-2 text-[9px] text-amber-500 font-bold">(⚠️ لجان شبه قضائية — ❌ لا نقض)</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {activeSubTypes.map((sub: string) => (
                  <button key={sub} onClick={() => setMemoSubType(sub)}
                    className={`rounded-lg px-4 py-2 text-[12px] font-medium border transition-all ${
                      memoSubType === sub
                        ? "bg-[#0B3D2E] border-[#0B3D2E] text-white"
                        : isDark ? "border-white/[0.08] text-zinc-400 hover:border-white/[0.15]" : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                    }`}>
                    {sub}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ملاحظات */}
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>ملاحظات ومرئيات (اختياري)</p>
        <div className="relative">
          <textarea value={notesText} onChange={e => setNotesText(e.target.value)}
            placeholder="أضف ملاحظاتك هنا: نقاط تريد التركيز عليها، تعليمات للـ AI، أو أي تفاصيل إضافية..." rows={3}
            className={`w-full resize-none rounded-xl border p-4 pe-12 text-[13px] outline-none leading-relaxed ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"}`} />
          <div className="absolute start-3 top-3">
            <VoiceInput onTranscript={(t) => setNotesText(notesText ? `${notesText} ${t}` : t)} compact />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-white text-zinc-500"}`}>
            <ImageSquare size={13} /> أضف صور
          </button>
          <button className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-white text-zinc-500"}`}>
            <CloudArrowUp size={13} /> أضف ملف
          </button>
        </div>
        {/* Reminder for reply/appeal — no upload here, handled in StepCase */}
        {needsPriorDocs && (
          <p className={`mt-3 text-[10px] flex items-center gap-1.5 ${
            isDark ? "text-amber-600" : "text-amber-700"
          }`}>
            <Warning size={11} />
            ستحتاج لرفع المستندات السابقة (ضبوط جلسات / أحكام) في الخطوة التالية
          </p>
        )}
      </div>

      {/* المستشار المسبق — استيفاء الشكل قبل التقديم */}
      <AnimatePresence>

      </AnimatePresence>

      {/* تصنيف القضية — مفلتر بناءً على نوع الدعوى المختار */}
      <AnimatePresence>
        {showBranchPicker ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className={`${card} p-5 shadow-sm`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>تصنيف القضية</p>
                {memoSubType && filteredRegular.length < LEGAL_BRANCHES_REGULAR.length && (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-600"
                  }`}>مفلتر حسب نوع الدعوى</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredRegular.map((branch: string) => (
                  <button key={branch} onClick={() => handleBranchChange(branch)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-medium border transition-all ${
                      legalBranch === branch && !isOther ? "bg-[#C8A762] border-[#C8A762] text-white"
                      : isDark ? "border-white/[0.08] text-zinc-400 hover:border-[#C8A762]/30" : "border-zinc-200 text-zinc-500 hover:border-[#C8A762]/30"
                    }`}>
                    {branch}
                  </button>
                ))}
                
                {/* زر "أخرى" لإدخال تصنيف مخصص */}
                <button onClick={() => { setIsOther(true); handleBranchChange("أخرى"); }}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-medium border transition-all ${
                    isOther ? "bg-[#C8A762] border-[#C8A762] text-white"
                    : isDark ? "border-white/[0.08] text-zinc-400 hover:border-[#C8A762]/30" : "border-zinc-200 text-zinc-500 hover:border-[#C8A762]/30"
                  }`}>
                  أخرى
                </button>
              </div>

              {/* حقل نصي مخصص للـ "أخرى" مع تأثير تمدد أنيق */}
              <AnimatePresence>
                {isOther && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0, marginTop: 0 }} 
                    animate={{ opacity: 1, height: "auto", marginTop: 12 }} 
                    exit={{ opacity: 0, height: 0, marginTop: 0 }} 
                    className="overflow-hidden"
                  >
                    <p className={`text-[10px] font-bold mb-1.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>يرجى تحديد تصنيف القضية الآخر:</p>
                    <input
                      type="text"
                      value={legalBranch === "أخرى" ? "" : legalBranch}
                      onChange={(e) => setLegalBranch(e.target.value || "أخرى")}
                      placeholder="مثال: بحري دولي، منافسة، احتكار، قضاء رياضي خاص..."
                      className={`w-full rounded-xl border px-4 py-2.5 text-[12px] outline-none leading-relaxed transition-all ${
                        isDark 
                          ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40" 
                          : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"
                      }`}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Show committees only when no subtype-filter is active (show-all mode) */}
              {filterRule === null ? (
                <div className={`mt-4 pt-4 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5 ${isDark ? "text-amber-600" : "text-amber-700"}`}>
                    <span>🆕</span> لجان شبه قضائية
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {LEGAL_BRANCHES_COMMITTEES.map((branch: string) => (
                      <button key={branch} onClick={() => handleBranchChange(branch)}
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-medium border transition-all ${
                          legalBranch === branch && !isOther ? "bg-amber-500 border-amber-500 text-white"
                          : isDark ? "border-amber-700/30 text-amber-500 hover:border-amber-500/50" : "border-amber-200 text-amber-700 hover:border-amber-400"
                        }`}>
                        {branch}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : autoSelectedBranch ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`${card} px-4 py-3 flex items-center gap-2`}>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C8A762] text-white`}>{autoSelectedBranch}</span>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>تصنيف القضية — محدد تلقائياً</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
