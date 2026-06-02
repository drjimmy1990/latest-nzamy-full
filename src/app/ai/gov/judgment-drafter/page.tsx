"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PencilSimple, Robot, Copy, DownloadSimple, Warning, ArrowLeft, ArrowRight, Sparkle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { createWorkflowId, saveWorkflowRequest } from "@/lib/workflowStore";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "drafting" | "result";
export default function JudgmentDrafterPage() {
  const { isDark, isRTL } = useTheme();
  const user = useUser();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [form, setForm] = useState({ caseType: "تجاري", facts: "", legalBasis: "", decision: "" });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"}`;
  const isValid = form.facts.length > 20 && form.decision.length > 10;
  const DRAFT = `بسم الله الرحمن الرحيم\n\nالحكم رقم: …/…/١٤٤٦\n\nبعد الاطلاع على أوراق القضية وملفاتها، وبعد المداولة القانونية؛\n\nحيث إن المدّعي تقدّم بدعواه مستنداً إلى ما ذكره من وقائع، وحيث إن المدّعى عليه أبدى دفاعه كاملاً،\n\nوحيث إن المحكمة قد استعرضت الأدلة والمستندات المقدّمة من الطرفين،\n\nوبناءً على المادة … من نظام …، وبعد التحقق من الاختصاص القضائي؛\n\n**لذا حكمت المحكمة:**\n\n${form.decision}\n\nصدر هذا الحكم وأُفهم به علناً في جلسة اليوم …`;
  function draftJudgment() {
    setSavedDraftId(null);
    setStep("drafting");
    setTimeout(() => {
      const id = createWorkflowId("GOV-DRAFT");
      saveWorkflowRequest({
        id,
        type: "ai_draft",
        title: `مسودة حكم - ${form.caseType}`,
        description: DRAFT,
        requester: {
          name: user.name,
          role: user.userType,
          tier: user.tier,
        },
        receiver: "government_reviewer",
        status: "completed",
        payment: {
          amount: 0,
          status: "not_required",
        },
        sourcePath: "/ai/gov/judgment-drafter",
        metadata: {
          caseType: form.caseType,
          legalBasis: form.legalBasis,
        },
        auditEvent: "government_judgment_draft_saved",
      });
      setSavedDraftId(id);
      setStep("result");
    }, 2000);
  }

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-indigo-500/10" : "bg-indigo-50"}`}>
            <PencilSimple size={22} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} />
          </div>
          <div>
            <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>صائغ الأحكام القضائية</h1>
            <p className={`text-xs ${muted}`}>يُنشئ هيكل الحكم القضائي استناداً للوقائع والسند النظامي</p>
          </div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-100 text-indigo-600"}`}>أداة قاضي</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>نوع القضية</label>
                  <div className="flex flex-wrap gap-2">
                    {["تجاري","مدني","عمالي","إداري","جزائي"].map(t => (
                      <button key={t} onClick={() => setForm({...form, caseType: t})}
                        className={`text-xs px-3 py-1.5 rounded-full font-bold transition ${form.caseType === t ? isDark ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40" : "bg-indigo-600 text-white" : isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>وقائع القضية الموجزة</label>
                  <textarea rows={4} value={form.facts} onChange={e => setForm({...form, facts: e.target.value})} placeholder="أدخل وقائع القضية ومجريات المحاكمة..." className={inp} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>السند النظامي</label>
                  <textarea rows={2} value={form.legalBasis} onChange={e => setForm({...form, legalBasis: e.target.value})} placeholder="المادة والنظام المنطبق..." className={inp} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>منطوق الحكم</label>
                  <textarea rows={2} value={form.decision} onChange={e => setForm({...form, decision: e.target.value})} placeholder="القبول/الرفض/الإلزام بمبلغ/..." className={inp} />
                </div>
              </div>
              <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isDark ? "bg-amber-500/5 border border-amber-500/15" : "bg-amber-50 border border-amber-200"}`}>
                <Warning size={14} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
                <span className={isDark ? "text-amber-400/80" : "text-amber-700"}>المسودة أداة مساعدة — المراجعة القانونية وتوقيع القاضي إلزامي قبل الإصدار الرسمي.</span>
              </div>
              <button onClick={draftJudgment} disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${isValid ? "bg-indigo-600 text-white hover:bg-indigo-700" : "opacity-40 cursor-not-allowed bg-indigo-600 text-white"}`}>
                <PencilSimple size={16} /> صياغة الحكم <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "drafting" && (
            <motion.div key="dr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4">
                <Robot size={36} className={isDark ? "text-indigo-400" : "text-indigo-600"} weight="duotone" />
              </motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>جارٍ صياغة الحكم...</p>
            </motion.div>
          )}
          {step === "result" && (
            <BetaReviewGate toolId="gov.judgment-drafter" toolName="مسودة الحكم القضائي" reviewScope="legal-data">
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm`}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkle size={14} className="text-indigo-500" weight="fill" />
                  <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>مسودة الحكم</h3>
                </div>
                {savedDraftId && (
                  <div className={`mb-3 rounded-xl px-3 py-2 text-xs font-semibold ${isDark ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>
                    {`تم حفظ المسودة برقم: ${savedDraftId}`}
                  </div>
                )}
                <pre className={`text-xs leading-7 whitespace-pre-wrap font-sans ${isDark ? "text-gray-300" : "text-gray-700"}`}>{DRAFT}</pre>
              </div>
              <AiResultActions text={DRAFT} filename="gov-judgment-draft" showShare />
              <div className="flex gap-3">
                <button onClick={() => { setSavedDraftId(null); setStep("input"); }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>بدء جديد</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${isDark ? "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}><Copy size={14} /> نسخ</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}><DownloadSimple size={14} /> تحميل</button>
              </div>
            </motion.div>
            </BetaReviewGate>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
