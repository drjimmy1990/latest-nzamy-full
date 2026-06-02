"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, Check, DownloadSimple,
  Microphone, PencilSimple, Sparkle, X,
  Stop, Play,
} from "@phosphor-icons/react";
import ClientSharePanel from "@/components/contracts/ClientSharePanel";
import { useUser } from "@/hooks/useUser";
import AiResultActions from "@/components/AiResultActions";

interface StepApprovalProps {
  isDark: boolean;
  shareLink: string | null;
  sharePasscode: string | null;
  linkCopied: boolean;
  setLinkCopied: (v: boolean) => void;
  clientEmail: string;
  setClientEmail: (v: string) => void;
  clientPhone: string;
  setClientPhone: (v: string) => void;
  generateShareLink: () => void;
  setShareLink: (v: string | null) => void;
  setSharePasscode: (v: string | null) => void;
}

// ─── AI simplified summary (mock) ────────────────────────────────────────────
const AI_SUMMARY_POINTS = [
  "هذا العقد يُحدد العلاقة القانونية بينك وبين المحامي بشكل رسمي وملزم.",
  "مدة العقد محددة — تنتهي تلقائياً ما لم يُجدَّد بموافقة الطرفين.",
  "الأتعاب المتفق عليها يجب سدادها في المواعيد المحددة وفق البند الثالث.",
  "السرية إلزامية على الطرفين — لا يُفصح بأي معلومات دون إذن كتابي.",
  "في حال أي نزاع، يُلجأ أولاً للوساطة قبل التقاضي — وفق بند حل النزاعات.",
];

type ExplainMode = "none" | "voice" | "text" | "ai";

export function StepApproval({
  isDark, shareLink, sharePasscode, linkCopied, setLinkCopied, clientEmail,
  setClientEmail, clientPhone, setClientPhone, generateShareLink, setShareLink, setSharePasscode
}: StepApprovalProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const { userType } = useUser();
  const isLawyer = userType === "lawyer" || userType === "firm";

  const [explainMode, setExplainMode] = useState<ExplainMode>("none");
  const [textNote,    setTextNote]    = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiLoading,   setAiLoading]   = useState(false);
  const [recording,   setRecording]   = useState(false);
  const [recorded,    setRecorded]    = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);

  function startRecording() {
    setRecording(true);
    setRecSeconds(0);
    timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
  }
  function stopRecording() {
    setRecording(false);
    setRecorded(true);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function generateAI() {
    setAiLoading(true);
    setTimeout(() => { setAiLoading(false); setAiGenerated(true); }, 1800);
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* ── Ready banner (replaces duplicate checklist) ── */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 flex-shrink-0">
            <CheckCircle size={20} weight="fill" className="text-emerald-500" />
          </div>
          <div className="flex-1">
            <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
              العقد اجتاز المراجعة — جاهز للاعتماد والمشاركة
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              تم فحص البنود والتوافق التشريعي في الخطوة السابقة — يمكنك تنزيل العقد أو مشاركته مع العميل الآن
            </p>
          </div>
        </div>
      </div>


      {/* ── Download ── */}
      <div className="flex gap-3">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-3 text-[13px] font-bold text-white shadow-md">
          <DownloadSimple size={15} /> تنزيل Word
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-[13px] font-semibold ${
            isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"
          }`}>
          <DownloadSimple size={15} /> تنزيل PDF
        </motion.button>
      </div>

      {/* Unified Result Actions */}
      <div className={`pt-2 border-t ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
        <AiResultActions
          text={AI_SUMMARY_POINTS.join("\n")}
          filename="contract-approval"
          showVault
          showHumanReview
          className="justify-start"
        />
      </div>

      {/* ── Explain to client ── */}
      <div className={`${card} p-5 shadow-sm space-y-4`}>
        <div>
          <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
            💬 شرح للعميل <span className={`text-[10px] font-normal px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>اختياري</span>
          </p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            يُرفق مع رابط المشاركة — يظهر للعميل جانب العقد عند فتح الرابط
          </p>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { key: "none",  label: "لا شيء",      icon: X,            color: "" },
            { key: "voice", label: "تسجيل صوتي",  icon: Microphone,   color: "text-red-500" },
            { key: "text",  label: "ملاحظة كتابية",icon: PencilSimple, color: "text-blue-500" },
            { key: "ai",    label: "ملخص بالAI",   icon: Sparkle,      color: "text-royal" },
          ] as const).map(opt => {
            const Icon = opt.icon;
            const isActive = explainMode === opt.key;
            return (
              <button key={opt.key} onClick={() => setExplainMode(opt.key)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-[11px] font-bold transition-all ${
                  isActive
                    ? isDark ? "border-royal/40 bg-royal/10 text-royal" : "border-royal/30 bg-royal/8 text-royal"
                    : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}>
                <Icon size={15} className={isActive ? "text-royal" : opt.color} weight={isActive ? "fill" : "regular"} />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Voice recorder */}
        <AnimatePresence>
          {explainMode === "voice" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className={`rounded-2xl border p-4 text-center space-y-3 ${isDark ? "border-white/[0.06] bg-zinc-800/50" : "border-slate-100 bg-slate-50"}`}>
                {recorded ? (
                  <>
                    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl ${isDark ? "bg-white/[0.04]" : "bg-white border border-slate-100"}`}>
                      <Play size={14} className="text-royal" weight="fill" />
                      <div className={`flex-1 h-1.5 rounded-full ${isDark ? "bg-zinc-700" : "bg-slate-200"}`}>
                        <div className="h-full w-2/3 rounded-full bg-royal" />
                      </div>
                      <span className={`text-[11px] font-mono ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{fmt(recSeconds)}</span>
                    </div>
                    <button onClick={() => { setRecorded(false); setRecSeconds(0); }}
                      className={`text-[11px] underline ${isDark ? "text-zinc-500" : "text-slate-400"}`}>إعادة التسجيل</button>
                  </>
                ) : recording ? (
                  <>
                    <div className="flex items-center justify-center gap-3">
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Infinity }}
                        className="w-3 h-3 rounded-full bg-red-500" />
                      <span className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>جارٍ التسجيل... {fmt(recSeconds)}</span>
                    </div>
                    <button onClick={stopRecording}
                      className="flex items-center gap-2 mx-auto px-5 py-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-[12px] font-bold hover:bg-red-500/20 transition-colors">
                      <Stop size={14} weight="fill" /> إيقاف التسجيل
                    </button>
                  </>
                ) : (
                  <>
                    <Microphone size={28} weight="duotone" className={`mx-auto ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
                    <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>سجّل ملاحظة صوتية تشرح فيها أهم بنود العقد للعميل</p>
                    <button onClick={startRecording}
                      className="flex items-center gap-2 mx-auto px-5 py-2 rounded-xl bg-red-500 text-white text-[12px] font-bold hover:bg-red-600 transition-colors">
                      <Microphone size={14} weight="fill" /> بدء التسجيل
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text note */}
        <AnimatePresence>
          {explainMode === "text" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <textarea
                value={textNote} onChange={e => setTextNote(e.target.value)}
                rows={4}
                placeholder="اكتب ملاحظتك للعميل هنا — مثلاً: 'هذا العقد يضمن حقوقك في... يرجى الانتباه إلى البند الثالث المتعلق بـ...'"
                className={`w-full rounded-xl border px-4 py-3 text-[13px] outline-none resize-none leading-relaxed ${
                  isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-royal/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-royal/40"
                }`}
              />
              <p className={`text-[10px] mt-1.5 text-left ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{textNote.length} حرف</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI summary */}
        <AnimatePresence>
          {explainMode === "ai" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              {!aiGenerated ? (
                <div className={`rounded-2xl border p-4 text-center space-y-3 ${isDark ? "border-royal/20 bg-royal/5" : "border-royal/20 bg-royal/[0.03]"}`}>
                  <Sparkle size={24} weight="duotone" className="mx-auto text-royal" />
                  <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                    الذكاء الاصطناعي سيولّد ملخصاً مبسّطاً بلغة يفهمها العميل — نقاط واضحة بدون مصطلحات قانونية معقدة
                  </p>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={generateAI} disabled={aiLoading}
                    className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold hover:bg-[#0a3328] transition-colors disabled:opacity-60">
                    {aiLoading
                      ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 rounded-full border-2 border-[#C8A762]/30 border-t-[#C8A762]" />يولّد الملخص...</>
                      : <><Sparkle size={13} weight="fill" />توليد الملخص</>
                    }
                  </motion.button>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl border p-4 space-y-2 ${isDark ? "border-royal/20 bg-royal/5" : "border-royal/20 bg-royal/[0.03]"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkle size={13} weight="fill" className="text-royal" />
                    <p className={`text-[11px] font-bold ${isDark ? "text-royal" : "text-royal"}`}>ملخص مبسّط للعميل — تم توليده بالذكاء الاصطناعي</p>
                  </div>
                  <ul className="space-y-2">
                    {AI_SUMMARY_POINTS.map((pt, i) => (
                      <motion.li key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                        className={`flex items-start gap-2 text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                        <span className="text-royal font-bold flex-shrink-0 mt-0.5">{i + 1}.</span>
                        {pt}
                      </motion.li>
                    ))}
                  </ul>
                  <button onClick={() => setAiGenerated(false)}
                    className={`text-[10px] underline mt-2 ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
                    إعادة التوليد
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Lawyer Refinement CTA — hide for lawyers (they ARE the lawyer) ── */}
      {!isLawyer && (
        <div className={`${card} p-5 shadow-sm`}>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
              <span className="text-2xl">⚖️</span>
            </div>
            <div className="flex-1">
              <p className={`text-[14px] font-bold mb-0.5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                اطلب تنقيح العقد من محامٍ متخصص
              </p>
              <p className={`text-[11px] leading-relaxed mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                الذكاء الاصطناعي صاغ هيكل العقد — المحامي يُدقق البنود القانونية الدقيقة ويعزّز حمايتك ويضيف أي استثناءات مخصصة لحالتك.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {["تدقيق قانوني كامل", "تخصيص حسب حالتك", "ضمان المطابقة النظامية"].map((f) => (
                  <span key={f} className={`text-[10px] px-2.5 py-1 rounded-full border font-medium ${isDark ? "border-[#C8A762]/20 text-[#C8A762] bg-[#C8A762]/5" : "border-amber-200 text-amber-700 bg-amber-50"}`}>
                    ✓ {f}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <a
                  href="/dashboard/client/find-lawyer?specialty=contract-review"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#C8A762] text-white text-[12px] font-bold hover:bg-[#b8973a] transition-colors shadow-sm"
                >
                  <span>ابحث عن محامٍ الآن</span>
                  <span>←</span>
                </a>
                <a
                  href="/marketplace?tab=post-request"
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[12px] font-semibold transition-colors ${isDark ? "border-white/[0.07] text-zinc-300 hover:bg-white/[0.04]" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
                >
                  انشر طلب تنقيح
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Client sharing ── */}
      <ClientSharePanel
        isDark={isDark}
        shareLink={shareLink}
        sharePasscode={sharePasscode}
        linkCopied={linkCopied}
        clientEmail={clientEmail}
        clientPhone={clientPhone}
        onEmailChange={setClientEmail}
        onPhoneChange={setClientPhone}
        onGenerate={generateShareLink}
        onCopy={() => { navigator.clipboard.writeText(shareLink!); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
        onReset={() => { setShareLink(null); setSharePasscode(null); }}
      />
    </motion.div>
  );
}
