"use client";

import { useState, RefObject, MutableRefObject, Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import { CloudArrowUp, PaperclipHorizontal, BookOpen, UploadSimple, FileArrowUp, X, Plus, MagnifyingGlass, FolderOpen, ArrowRight } from "@phosphor-icons/react";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { VoiceInput } from "@/components/ui/VoiceInput";
import { DraftPartyForm } from "@/components/draft/DraftPartyForm";
import { JudgmentHeader } from "@/components/draft/JudgmentHeader";
import { COMMITTEE_BRANCH_IDS, PartyData, SupportDoc, REQUIRES_JUDGMENT_HEADER } from "@/components/draft/draftConstants";

interface StepCaseProps {
  isDark: boolean;
  clientRole: "plaintiff" | "defendant" | "";
  memoType: string;
  legalBranch: string;
  caseText: string;
  setCaseText: (v: string) => void;
  caseFile: string | null;
  setCaseFile: (v: string | null) => void;
  supportDocs: SupportDoc[];
  addDoc: () => void;
  removeDoc: (id: number) => void;
  updateDoc: (id: number, field: "description" | "file" | "isLargeFile", val: string | boolean | null) => void;
  lawyerNotes: string;
  setLawyerNotes: (v: string) => void;
  useFirmMemory: boolean;
  setUseFirmMemory: Dispatch<SetStateAction<boolean>>;
  bulkUpload: boolean;
  setBulkUpload: Dispatch<SetStateAction<boolean>>;
  partyOne: PartyData;
  setPartyOne: (fn: (p: PartyData) => PartyData) => void;
  partyTwo: PartyData;
  setPartyTwo: (fn: (p: PartyData) => PartyData) => void;
  caseFileRef: RefObject<HTMLInputElement | null>;
  attachRefs: MutableRefObject<(HTMLInputElement | null)[]>;
  // judgment header props
  plaintiffName: string;    setPlaintiffName: (v: string) => void;
  defendantName: string;    setDefendantName: (v: string) => void;
  judgmentCourt: string;    setJudgmentCourt: (v: string) => void;
  judgmentNumber: string;   setJudgmentNumber: (v: string) => void;
  judgmentDate: string;     setJudgmentDate: (v: string) => void;
  judgmentText: string;     setJudgmentText: (v: string) => void;
  judgmentReasons: string;  setJudgmentReasons: (v: string) => void;
}

export function StepCase({
  isDark, clientRole, memoType, legalBranch,
  caseText, setCaseText, caseFile, setCaseFile,
  supportDocs, addDoc, removeDoc, updateDoc,
  lawyerNotes, setLawyerNotes, useFirmMemory, setUseFirmMemory,
  bulkUpload, setBulkUpload, partyOne, setPartyOne, partyTwo, setPartyTwo,
  caseFileRef, attachRefs,
  plaintiffName, setPlaintiffName, defendantName, setDefendantName,
  judgmentCourt, setJudgmentCourt, judgmentNumber, setJudgmentNumber,
  judgmentDate, setJudgmentDate, judgmentText, setJudgmentText,
  judgmentReasons, setJudgmentReasons,
}: StepCaseProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const isCommittee  = COMMITTEE_BRANCH_IDS.has(legalBranch);
  const isDraftType  = memoType === "case";
  const needsJudgment = REQUIRES_JUDGMENT_HEADER.has(memoType);

  const [showFirmModal, setShowFirmModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [firmModalStep, setFirmModalStep] = useState<"departments" | "templates">("departments");
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">


      {/* بيانات الأطراف */}
      {isDraftType ? (
        <div className={`${card} p-5 shadow-sm`}>
          <div className="flex items-center gap-2 mb-4">
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>بيانات الأطراف</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${isDark ? "border-emerald-700/30 bg-emerald-900/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>تحرير دعوى</span>
          </div>
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            {clientRole === "plaintiff" ? "المدعي (الطرف الأول)" : "المدعى عليه (الطرف الأول)"}
          </p>
          <DraftPartyForm data={partyOne} onChange={(f, v) => setPartyOne(p => ({ ...p, [f]: v }))} isCommittee={isCommittee} isDark={isDark} />
          <div className={`my-4 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`} />
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            {clientRole === "plaintiff" ? "المدعى عليه (الطرف الثاني)" : "المدعي (الطرف الثاني)"}
          </p>
          {isCommittee ? (
            <div className={`rounded-xl p-3 ${isDark ? "bg-zinc-800/50 text-zinc-400" : "bg-zinc-50 text-zinc-500"} text-[12px]`}>
              🏛️ المستأنف ضدها: <strong>هيئة الزكاة والضريبة والجمارك</strong> (ثابت)
            </div>
          ) : (
            <DraftPartyForm data={partyTwo} onChange={(f, v) => setPartyTwo(p => ({ ...p, [f]: v }))} isCommittee={false} isDark={isDark} />
          )}
        </div>
      ) : (
        <div className={`${card} p-4 shadow-sm`}>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 text-lg">🤖</span>
            <div>
              <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>AI سيستخرج بيانات الأطراف تلقائياً</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>من الملفات التي سترفعها أسفله — ستظهر في Step 3 للتأكيد</p>
            </div>
          </div>
        </div>
      )}

      {/* رفع ملف القضية */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center gap-2 mb-1">
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
            {isDraftType ? "المستند الأساسي / المرفقات" : "ملفات القضية الكاملة (مطلوب)"}
          </p>
          {!isDraftType && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${isDark ? "border-orange-500/30 bg-orange-900/15 text-orange-400" : "border-orange-300 bg-orange-50 text-orange-700"}`}>
              ارفع كافة المذكرات السابقة + ضبوط الجلسات
            </span>
          )}
        </div>
        <div className={`rounded-xl border-2 border-dashed p-5 text-center mt-3 cursor-pointer transition-colors ${caseFile ? isDark ? "border-emerald-700/30 bg-emerald-900/8" : "border-emerald-200 bg-emerald-50" : isDark ? "border-white/[0.08] hover:border-[#C8A762]/30" : "border-zinc-200 hover:border-[#C8A762]/40"}`}
          onClick={() => caseFileRef.current?.click()}>
          <input ref={caseFileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png"
            onChange={e => { const f = e.target.files?.[0]; if (f) setCaseFile(f.name); }} />
          {caseFile ? (
            <div className="flex items-center justify-center gap-2">
              <UploadSimple size={14} className="text-emerald-500" />
              <span className={`text-[12px] font-medium truncate ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{caseFile}</span>
              <button onClick={e => { e.stopPropagation(); setCaseFile(null); }}><X size={13} className="text-emerald-500" /></button>
            </div>
          ) : (
            <>
              <CloudArrowUp size={22} className={`mx-auto mb-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`} />
              <p className={`text-[12px] font-semibold mb-0.5 ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>ارفع ملف القضية</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>PDF · Word · صور — اسحب وأفلت أو اضغط</p>
            </>
          )}
        </div>
        <p className={`text-center text-[11px] my-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`}>أو</p>
        <div className="relative">
          <textarea value={caseText} onChange={e => setCaseText(e.target.value)}
            placeholder={caseFile ? "أضف ملاحظات إضافية على الملف (اختياري)..." : "اكتب ملخص القضية: الأطراف · الواقعة · التسلسل الزمني · الأدلة..."}
            rows={5}
            className={`w-full resize-none rounded-xl border p-4 pe-14 text-[13px] outline-none leading-relaxed ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"}`} />
          <div className="absolute bottom-3 start-3">
            <VoiceInput onTranscript={(t) => setCaseText(caseText ? `${caseText} ${t}` : t)} compact />
          </div>
        </div>
      </div>

      {/* المرفقات */}
      <div className={`${card} p-5 shadow-sm space-y-4`}>
        <div className="flex items-center gap-2">
          <PaperclipHorizontal size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>هل لديك مرفقات تدعم موقفك؟</p>
        </div>
        {!bulkUpload ? (
          <div className="space-y-3">
            {supportDocs.length === 0 && (
              <div className={`rounded-xl p-4 flex items-center gap-3 ${isDark ? "bg-white/[0.02] border border-white/[0.05]" : "bg-zinc-50 border border-zinc-100"}`}>
                <Plus size={14} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
                <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>لا توجد مرفقات — اضغط "إضافة مرفق" لإضافة أول مرفق</p>
              </div>
            )}
            {supportDocs.map((doc, idx) => (
              <motion.div key={doc.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border p-4 space-y-3 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/50"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-amber-200 text-amber-800"}`}>{idx + 1}</span>
                    <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>المرفق رقم {idx + 1}</p>
                  </div>
                  <button onClick={() => removeDoc(doc.id)}><X size={14} className={isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"} /></button>
                </div>
                <div className="relative">
                  <textarea value={doc.description} onChange={e => updateDoc(doc.id, "description", e.target.value)}
                    placeholder="اشرح هذا المرفق وما الذي تعوّل عليه فيه..." rows={2}
                    className={`w-full resize-none rounded-xl border px-3 py-2 pe-14 text-[12px] outline-none leading-relaxed ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
                  <div className="absolute bottom-2 start-2">
                    <VoiceInput onTranscript={(t) => updateDoc(doc.id, "description", doc.description ? `${doc.description} ${t}` : t)} compact />
                  </div>
                </div>
                {doc.file ? (
                  <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] ${isDark ? "bg-emerald-900/15 border border-emerald-700/25" : "bg-emerald-50 border border-emerald-200"}`}>
                    <UploadSimple size={11} className="text-emerald-500" />
                    <span className={`flex-1 truncate ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{doc.file}</span>
                    <button onClick={() => updateDoc(doc.id, "file", null)}><X size={11} /></button>
                  </div>
                ) : (
                  <button onClick={() => attachRefs.current[idx]?.click()}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold border transition-colors ${isDark ? "border-white/[0.08] text-zinc-500 hover:border-[#C8A762]/30 hover:text-[#C8A762]" : "border-zinc-200 text-zinc-400 hover:border-amber-400 hover:text-amber-600"}`}>
                    <PaperclipHorizontal size={13} /> 📎 ارفع الملف المرتبط
                  </button>
                )}
                <input ref={el => { attachRefs.current[idx] = el; }} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png"
                  onChange={e => { 
                    const f = e.target.files?.[0]; 
                    if (f) {
                      updateDoc(doc.id, "file", f.name);
                      // Simulate large files (> 500KB = roughly > 8 pages of PDF)
                      if (f.size > 500 * 1024) {
                        updateDoc(doc.id, "isLargeFile", true);
                      }
                    } 
                  }} />
              </motion.div>
            ))}
            <div className="flex items-center gap-3 flex-wrap">
              <motion.button whileTap={{ scale: 0.96 }} onClick={addDoc}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-bold transition-colors ${isDark ? "border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-amber-300 text-amber-700 hover:bg-amber-100"}`}>
                <Plus size={13} /> إضافة مرفق
              </motion.button>
              <button onClick={() => setBulkUpload(true)}
                className={`text-[11px] underline transition-colors ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"}`}>
                أو ارفع كافة المرفقات دفعةً واحدة
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`rounded-xl border-2 border-dashed p-4 text-center ${isDark ? "border-white/[0.08]" : "border-zinc-200"}`}>
              <FileArrowUp size={18} className={`mx-auto mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`} />
              <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>ارفع جميع المرفقات — AI سيحللها تلقائياً</p>
              <p className={`text-[10px] mt-0.5 ${isDark ? "text-amber-600" : "text-amber-500"}`}>⚠ هذا الخيار قد يستغرق وقتاً أطول للتحليل</p>
            </div>
            <button onClick={() => setBulkUpload(false)} className={`text-[11px] underline ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>عودة للإضافة الفردية</button>
          </div>
        )}

        {/* Attachment Analyzer CTA Banner */}
        <AnimatePresence>
          {(bulkUpload || supportDocs.length > 1 || supportDocs.some(d => d.isLargeFile)) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className={`mt-3 p-3 rounded-xl border flex items-center justify-between gap-4 ${isDark ? "border-[#C8A762]/30 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/20" : "bg-amber-200"}`}>
                    <MagnifyingGlass size={16} weight="duotone" className="text-[#C8A762]" />
                  </div>
                  <div>
                    <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-amber-900"}`}>ملف ثقيل ومعقد؟ استعن بـ "عصارة المرفقات"</p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-400" : "text-amber-700"}`}>أداة متخصصة لتحليل وفرز مئات الصفحات والمستندات قبل بدء الصياغة.</p>
                  </div>
                </div>
                <Link href="/ai/analyze" className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${isDark ? "bg-[#C8A762] text-zinc-900 hover:bg-[#d4b574]" : "bg-amber-600 text-white hover:bg-amber-700"}`}>
                  الانتقال للعصارة <ArrowRight size={12} className="rotate-180" />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ذاكرة المكتب */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <BookOpen size={17} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>استخدم ذاكرة مكتبك</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>AI يجمع بين قاعدة نظامي + نماذج مكتبك لاقتراح دفوع أقوى</p>
          </div>
          <button onClick={() => {
            if (!useFirmMemory) setShowFirmModal(true);
            else { setUseFirmMemory(false); setSelectedTemplate(null); }
          }}
            className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ${useFirmMemory ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-zinc-300"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${useFirmMemory ? "start-5" : "start-0.5"}`} />
          </button>
        </div>
        {useFirmMemory && selectedTemplate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 overflow-hidden">
            <div className={`p-3 rounded-xl border flex items-center justify-between ${isDark ? "border-[#C8A762]/30 bg-[#C8A762]/10" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-[#C8A762]" weight="duotone" />
                <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>{selectedTemplate}</p>
              </div>
              <button onClick={() => setShowFirmModal(true)} className={`text-[10px] underline font-semibold ${isDark ? "text-zinc-400 hover:text-white" : "text-amber-600 hover:text-amber-800"}`}>تغيير</button>
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showFirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowFirmModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className={`relative w-full max-w-lg rounded-2xl border shadow-xl ${isDark ? "border-white/[0.1] bg-zinc-900" : "border-slate-200 bg-white"} overflow-hidden flex flex-col max-h-[80vh]`}>
              <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <div className="flex items-center gap-2">
                  {firmModalStep === "templates" && (
                    <button onClick={() => setFirmModalStep("departments")} className={`me-1 rounded p-1 transition-colors ${isDark ? "hover:bg-white/5 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
                      <ArrowRight size={14} />
                    </button>
                  )}
                  <BookOpen size={18} className="text-[#C8A762]" />
                  <h3 className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {firmModalStep === "departments" ? "اختر القسم" : `نماذج ${selectedDept}`}
                  </h3>
                </div>
                <button onClick={() => setShowFirmModal(false)} className={`rounded-lg p-1.5 transition-colors ${isDark ? "hover:bg-white/5 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {firmModalStep === "departments" ? (
                  <div className="grid grid-cols-2 gap-3">
                    {["القسم العمالي", "القسم التجاري والشركات", "القسم الإداري", "القسم الجزائي", "القسم العقاري", "قسم الأحوال الشخصية"].map(dept => (
                      <button key={dept} onClick={() => { setSelectedDept(dept); setFirmModalStep("templates"); }} className={`flex flex-col items-center justify-center gap-3 rounded-xl border p-4 transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.06] bg-zinc-800/30 hover:border-[#C8A762]/40" : "border-slate-100 bg-white hover:border-amber-300 shadow-sm"}`}>
                        <div className={`rounded-xl p-2.5 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                           <FolderOpen size={22} className="text-[#C8A762]" weight="duotone" />
                        </div>
                        <p className={`text-[12px] font-bold text-center ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{dept}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 mb-4 ${isDark ? "border-white/[0.08] bg-zinc-800/50" : "border-slate-200 bg-slate-50"}`}>
                      <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                      <input type="text" placeholder="ابحث في النماذج..." className={`w-full bg-transparent text-[12px] outline-none ${isDark ? "text-white placeholder:text-zinc-500" : "text-zinc-900 placeholder:text-slate-400"}`} />
                    </div>
                    {[
                      { id: "1", title: "قالب الدعوى العمالية القياسي", desc: "القالب المعتمد ٢٠٢٥", type: "template" },
                      { id: "2", title: "مذكرة قضية فصل تعسفي مشابهة", desc: "القضية رقم ١٤٤٢ - لصالح المدعي", type: "case" },
                      { id: "3", title: "صيغة دفاع سابقة ناجحة", desc: "نفس الخصم - شركة المقاولات", type: "case" },
                    ].map(t => (
                      <button key={t.id} onClick={() => { setSelectedTemplate(t.title); setUseFirmMemory(true); setShowFirmModal(false); setFirmModalStep("departments"); }} className={`w-full flex items-start gap-3 rounded-xl border p-3 text-start transition-all hover:scale-[1.01] ${isDark ? "border-white/[0.06] bg-zinc-800/30 hover:border-[#C8A762]/40" : "border-slate-100 bg-white hover:border-amber-300 shadow-sm"}`}>
                        <div className={`mt-0.5 rounded-lg p-1.5 flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                          <FolderOpen size={16} className="text-[#C8A762]" weight="duotone" />
                        </div>
                        <div>
                          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{t.title}</p>
                          <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{t.desc}</p>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ملاحظات المحامي */}
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ملاحظات المحامي (اختياري)</p>
        <div className="relative">
          <textarea value={lawyerNotes} onChange={e => setLawyerNotes(e.target.value)}
            placeholder="أي توجيهات خاصة للـ AI: ركّز على نقطة معينة، تجنب دفع معين..." rows={3}
            className={`w-full resize-none rounded-xl border p-3 pe-14 text-[13px] outline-none leading-relaxed ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`} />
          <div className="absolute bottom-3 start-3">
            <VoiceInput onTranscript={(t) => setLawyerNotes(lawyerNotes ? `${lawyerNotes} ${t}` : t)} compact />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
