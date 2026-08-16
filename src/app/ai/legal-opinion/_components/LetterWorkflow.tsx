"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, DownloadSimple, PencilSimple, Plus, X,
  User, Buildings, Scroll, PaperPlaneTilt, ArrowRight, ArrowLeft, Paperclip,
  Warning,
} from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";
import { LETTER_TYPES, GOV_ENTITIES } from "../_constants";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useUser } from "@/hooks/useUser";
import { validateLegalOpinionIntake } from "@/lib/services/orderIntake.legalOpinion";
import { createServiceOrder } from "@/lib/services/serviceOrders";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

interface LetterWorkflowProps {
  isDark: boolean;
  card: string;
  onBack: () => void;
}

/**
 * Map a thrown submit error to Arabic user-facing copy. The underlying
 * message (which may be English — "Unauthorized", a raw Postgres error,
 * etc.) is logged for developers via console.error but never shown to the
 * user. Mirrors useDraftState.ts's submitErrorMessageAr.
 */
function submitErrorMessageAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[LetterWorkflow] submitOrder failed:", raw);
  if (raw === "Unauthorized") {
    return "انتهت جلستك — يرجى تسجيل الدخول مجدداً ثم إعادة المحاولة.";
  }
  return "تعذّر إرسال الطلب — حاول مجدداً";
}

// ── Spring physics preset (MOTION_INTENSITY: 6) ──────────────────────────────
const spring = { type: "spring" as const, stiffness: 320, damping: 26 };

export function LetterWorkflow({ isDark, card, onBack }: LetterWorkflowProps) {
  const user = useUser();
  const [letterStep, setLetterStep] = useState(1);
  const [letterType, setLetterType] = useState("");
  const [letterTypeCustom, setLetterTypeCustom] = useState("");
  const [letterPurpose, setLetterPurpose] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderRole, setSenderRole] = useState<"individual" | "company">("individual");
  const [recipientName, setRecipientName] = useState("");
  const [recipientType, setRecipientType] = useState<"individual" | "company" | "government">("individual");
  const [govEntity, setGovEntity] = useState("");
  const [responseDeadline, setResponseDeadline] = useState(false);
  const [deadlineDays, setDeadlineDays] = useState("10");
  const [letterSubject, setLetterSubject] = useState("");
  const [letterAttachments, setLetterAttachments] = useState<string[]>([]);
  const [attachmentInput, setAttachmentInput] = useState("");
  const [letterLegalRef, setLetterLegalRef] = useState("");
  // Kept defined but never set to true any more (Task C4) — letterDone used
  // to gate the fake "AI is drafting" spinner (generateLetter()) before
  // revealing a canned-feeling "ready" view with non-functional PDF/Word/
  // WhatsApp buttons. That view is hidden (not deleted) below; the real
  // replacement is letterStep 4, a genuine review-and-submit screen.
  const [letterDone, setLetterDone] = useState(false);
  const [letterProcessing, setLetterProcessing] = useState(false);
  // Submit-step state (Task C4) — this workflow is self-contained and never
  // touches page.tsx's state machine or its shared submitOrder(), per the
  // controller notes: it needs its own submit path.
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  // Resolves letterType to a display label, "other" included. Previously
  // `LETTER_TYPES.find(l => l.id === letterType)?.label` resolved to
  // `undefined` for "other" (not in LETTER_TYPES) — silently dropping the
  // one piece of information ("خطاب مخصص: <ما وصفه المستخدم>") that made a
  // custom letter type meaningful. Task C4.
  const letterTypeLabel = letterType === "other"
    ? (letterTypeCustom.trim() || "خطاب مخصص")
    : (LETTER_TYPES.find(l => l.id === letterType)?.label ?? "");

  // ── Full letter text for AiResultActions ──────────────────────────────────
  // Previously guarded by `if (!letterDone) return ""`, so this was only
  // ever computed after the fake "AI drafting" step. Computed eagerly now —
  // letterStep 4 needs a live preview before any "done" flag exists, and the
  // submit-order payload needs the same text as the admin's starting draft
  // (controller notes §7/§9: "carry it into the order").
  const fullLetterText = useMemo(() => {
    if (!senderName.trim() || !recipientName.trim() || !letterSubject.trim()) return "";
    const recipientLine = recipientType === "government"
      ? `معالي / سعادة رئيس ${govEntity || recipientName}`
      : `السيد / ${recipientName}`;
    const intro = letterType === "warning"   ? "يُنذركم موكلنا / " :
                  letterType === "complaint" ? "يتقدم بهذه الشكوى / " :
                  letterType === "objection" ? "يتظلم ويعترض / " :
                  "يُحيطكم علماً / ";
    const lines = [
      "بسم الله الرحمن الرحيم",
      "",
      `${recipientLine}`,
      "المحترم،",
      "تحية طيبة وبعد،",
      "",
      `${intro}${senderName} بشأن: ${letterSubject}`,
      letterLegalRef ? `\nاستناداً إلى: ${letterLegalRef}` : "",
      responseDeadline
        ? `\nلذا نطلب منكم اتخاذ الإجراء اللازم خلال (${deadlineDays}) أيام من تاريخ استلام هذا الخطاب، وإلا احتفظنا بحق اتخاذ كافة الإجراءات القانونية الكفيلة بصون الحقوق.`
        : "",
      letterAttachments.length > 0
        ? `\nالمرفقات:\n${letterAttachments.map((a, i) => `${i + 1}. ${a}`).join("\n")}`
        : "",
      "",
      `مقدمه،\n${senderName}`,
    ];
    return lines.filter(Boolean).join("\n");
  }, [recipientType, govEntity, recipientName, letterType, senderName,
      letterSubject, letterLegalRef, responseDeadline, deadlineDays, letterAttachments]);

  // Kept defined but never called any more (Task C4) — see the letterDone
  // comment above. The step-3 "التالي" button now moves straight to
  // letterStep 4 with no artificial delay.
  async function generateLetter() {
    setLetterProcessing(true);
    await new Promise(r => setTimeout(r, 1800));
    setLetterProcessing(false);
    setLetterDone(true);
  }

  // Real submit path (Task C4) — modelled on useDraftState.submitOrder():
  // build the letter intake → validateLegalOpinionIntake → read
  // profiles(display_name, phone, email) → createServiceOrder → redirect.
  // "attachments" here is the real OrderAttachment[] the order needs — the
  // letter flow never collects real files, so it is always []. The client's
  // free-text attachment labels travel inside `letter.attachmentLabels`
  // instead, named so they can never be mistaken for uploaded files.
  async function submitLetterOrder() {
    setSubmitErrors([]);
    const intake = {
      schemaVersion: 1,
      service: "legal_opinion",
      outputType: "letter",
      letter: {
        letterType,
        letterTypeCustom: letterType === "other" ? letterTypeCustom.trim() : undefined,
        letterTypeLabel,
        senderName, senderRole,
        recipientName, recipientType,
        ...(recipientType === "government" ? { govEntity } : {}),
        ...(responseDeadline ? { responseDeadline, deadlineDays } : {}),
        letterSubject, letterLegalRef,
        // Free-text labels the client typed, NOT uploaded files — no
        // <input type="file"> exists in this workflow. Named distinctly
        // from `attachments` (the real OrderAttachment[] below) so an
        // admin reading the order can't mistake one for the other.
        attachmentLabels: letterAttachments,
        fullLetterText,
      },
      attachments: [] as { documentId: string; name: string; size: number }[],
    };
    const check = validateLegalOpinionIntake(intake);
    if (!check.ok) { setSubmitErrors(check.errors); return; }

    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: profile } = authUser
        ? await supabase.from("profiles").select("display_name, phone, email").eq("id", authUser.id).single()
        : { data: null };

      const order = await createServiceOrder({
        service: "legal_opinion",
        title: `خطاب رسمي — ${letterTypeLabel || "خطاب"}`,
        description: letterSubject.slice(0, 200),
        intake: check.value as unknown as Record<string, unknown>,
        attachments: [],
        requester: {
          name: profile?.display_name ?? undefined,
          phone: profile?.phone ?? undefined,
          email: profile?.email ?? undefined,
        },
      });
      window.location.href = `/ai/orders/${order.id}`;
    } catch (err) {
      setSubmitErrors([submitErrorMessageAr(err)]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence mode="wait">
      {/* Step indicator — always shown now (Task C4): the old `!letterDone`
          guard hid it once the fake "ready" view appeared; that view is
          unreachable now, and the real step 4 (review & submit) still wants
          the indicator visible like every other step. */}
      <div className={`${card} p-3 mb-4`}>
        <div className="flex items-center gap-1">
          {["نوع الخطاب", "الأطراف", "الموضوع", "مراجعة وإرسال"].map((l, i) => {
            const n = i + 1;
            const isActive = letterStep === n;
            const isDone = letterStep > n;
            return (
              <div key={n} className="flex items-center gap-1 flex-1">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0 transition-all ${
                  isDone ? "bg-emerald-500 text-white" : isActive ? "bg-blue-600 text-white" : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"
                }`}>
                  {isDone ? <CheckCircle size={12} weight="fill" /> : n}
                </div>
                <span className={`text-[10px] hidden sm:block truncate font-medium ${isActive ? (isDark ? "text-white" : "text-zinc-800") : isDark ? "text-zinc-600" : "text-zinc-400"}`}>{l}</span>
                {i < 3 && <div className={`flex-1 h-px mx-1 ${isDone ? "bg-emerald-500/40" : isDark ? "bg-zinc-800" : "bg-zinc-200"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 1 — نوع الخطاب */}
      {letterStep === 1 && (
        <motion.div key="ls1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          transition={spring} className={`${card} p-5 space-y-4`}>
          <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نوع الخطاب</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[...LETTER_TYPES, { id: "other", label: "أخرى", Icon: PencilSimple }].map((lt, i) => {
              const isSelected = letterType === lt.id;
              const IconComp = lt.Icon as React.ElementType;
              return (
                <motion.button
                  key={lt.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: i * 0.04 }}
                  whileHover={{ scale: 1.025, transition: spring }}
                  whileTap={{ scale: 0.975, transition: spring }}
                  onClick={() => { setLetterType(lt.id); if (lt.id !== "other") setLetterTypeCustom(""); }}
                  className={`rounded-xl border p-3 text-center transition-colors ${
                    isSelected
                      ? isDark
                        ? "border-blue-500/40 bg-blue-900/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                        : "border-blue-400/40 bg-blue-50"
                      : isDark
                        ? "border-white/[0.07] hover:border-white/[0.14]"
                        : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${
                    isSelected
                      ? isDark ? "bg-blue-500/20" : "bg-blue-100"
                      : isDark ? "bg-zinc-800" : "bg-slate-100"
                  }`}>
                    <IconComp
                      size={18}
                      weight="duotone"
                      className={isSelected
                        ? isDark ? "text-blue-300" : "text-blue-700"
                        : isDark ? "text-zinc-400" : "text-slate-500"
                      }
                    />
                  </div>
                  <p className={`text-[11px] font-semibold leading-tight ${
                    isSelected
                      ? isDark ? "text-blue-300" : "text-blue-800"
                      : isDark ? "text-zinc-400" : "text-slate-600"
                  }`}>{lt.label}</p>
                </motion.button>
              );
            })}
          </div>
          {letterType === "other" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={spring}
              className="overflow-hidden"
            >
              <input
                value={letterTypeCustom}
                onChange={e => setLetterTypeCustom(e.target.value)}
                placeholder="صف نوع الخطاب... مثال: خطاب تأييد • خطاب إحاطة بسجل • خطاب تزكية"
                className={`w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none mt-1 ${
                  isDark
                    ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600"
                    : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"
                }`}
              />
            </motion.div>
          )}
          <div className="flex justify-between items-center">
            <button
              onClick={onBack}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[12px] font-semibold transition-colors active:scale-[0.98] ${
                isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-zinc-500 hover:bg-slate-50"
              }`}
            >
              <ArrowRight size={13} /> رجوع
            </button>
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              transition={spring}
              onClick={() => setLetterStep(2)}
              disabled={!letterType || (letterType === "other" && !letterTypeCustom.trim())}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
            >
              التالي <ArrowLeft size={13} />
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Step 2 — الأطراف */}
      {letterStep === 2 && (
        <motion.div key="ls2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className={`${card} p-5 space-y-4`}>

          {/* Sender */}
          <div>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المرسِل</p>
            <div className="flex gap-2 mb-2">
              {(["individual", "company"] as const).map(r => (
                <button key={r} onClick={() => setSenderRole(r)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[12px] font-semibold transition-all ${
                    senderRole === r
                      ? isDark ? "border-blue-500/40 bg-blue-900/15 text-blue-300" : "border-blue-400 bg-blue-50 text-blue-800"
                      : isDark ? "border-white/[0.07] text-zinc-400" : "border-slate-200 text-slate-500"
                  }`}>
                  {r === "individual" ? <User size={13} /> : <Buildings size={13} />}
                  {r === "individual" ? "فرد" : "شركة / مؤسسة"}
                </button>
              ))}
            </div>
            <input value={senderName} onChange={e => setSenderName(e.target.value)}
              placeholder={senderRole === "individual" ? "اسم المرسل الكامل" : "اسم الشركة / المؤسسة"}
              className={`w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"}`} />
          </div>

          {/* Recipient */}
          <div>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المستَلِم</p>
            <div className="flex gap-2 mb-2">
              {([
                { id: "individual" as const, label: "فرد",           Icon: User },
                { id: "company" as const,    label: "شركة / مؤسسة", Icon: Buildings },
                { id: "government" as const, label: "جهة حكومية",   Icon: Scroll },
              ]).map(({ id, label, Icon }) => (
                <button key={id} onClick={() => setRecipientType(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[12px] font-semibold transition-all ${
                    recipientType === id
                      ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#C8A762]/50 bg-amber-50 text-amber-800"
                      : isDark ? "border-white/[0.07] text-zinc-400 hover:border-white/[0.12]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>
            <AnimatePresence>
              {recipientType === "government" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-2">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {GOV_ENTITIES.map(e => (
                      <button key={e} onClick={() => setGovEntity(e)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                          govEntity === e
                            ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-amber-300 bg-amber-50 text-amber-800"
                            : isDark ? "border-white/[0.07] text-zinc-500 hover:border-white/[0.12]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}>{e}</button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <input value={recipientName} onChange={e => setRecipientName(e.target.value)}
              placeholder={recipientType === "government" ? "اسم الجهة / المسؤول المعني" : "اسم المستلِم"}
              className={`w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"}`} />
          </div>

          {/* Response deadline — optional, context-aware label */}
          <AnimatePresence>
            <div className={`rounded-xl border p-3.5 space-y-2 ${
              isDark ? "border-white/[0.07] bg-zinc-800/30" : "border-slate-200 bg-slate-50/60"
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    {recipientType === "government" ? "تحديد مهلة للتعامل مع الطلب" : "تحديد موعد للرد"}
                    <span className={`ms-1.5 text-[9px] font-normal ${isDark ? "text-zinc-600" : "text-slate-400"}`}>(اختياري)</span>
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    {recipientType === "government"
                      ? "مناسب للطلبات التي تستلزم ردّاً رسمياً خلال مدة نظامية"
                      : "سيُدرَج تلقائياً في نص الخطاب"}
                  </p>
                </div>
                <button onClick={() => setResponseDeadline(p => !p)}
                  className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    responseDeadline ? "bg-blue-600" : isDark ? "bg-zinc-700" : "bg-slate-300"
                  }`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    responseDeadline ? "start-[calc(100%-22px)]" : "start-0.5"
                  }`} />
                </button>
              </div>
              {responseDeadline && (
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="overflow-hidden">
                  <div className="flex gap-1 pt-1">
                    {(["5", "10", "15", "30"]).map(d => (
                      <button key={d} onClick={() => setDeadlineDays(d)}
                        className={`flex-1 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
                          deadlineDays === d
                            ? "bg-blue-600 border-blue-600 text-white"
                            : isDark ? "border-white/[0.07] text-zinc-400" : "border-slate-200 text-slate-500"
                        }`}>{d} يوم</button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </AnimatePresence>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setLetterStep(1)}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[12px] font-semibold transition-colors active:scale-[0.98] ${
                isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-zinc-500 hover:bg-slate-50"
              }`}
            >
              <ArrowRight size={13} /> رجوع
            </button>
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              transition={spring}
              onClick={() => setLetterStep(3)}
              disabled={!senderName.trim() || !recipientName.trim() || (recipientType === "government" && !govEntity && !recipientName.trim())}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
            >
              التالي <ArrowLeft size={13} />
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Step 3 — الموضوع */}
      {letterStep === 3 && (
        <motion.div key="ls3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className={`${card} p-5 space-y-4`}>
          <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>الموضوع والمطلوب</p>

          {/* Main subject */}
          <div className="relative">
            <textarea value={letterSubject} onChange={e => setLetterSubject(e.target.value)}
              placeholder="اشرح موضوع الخطاب والمطلوب منه: الوقائع · المطالبة · الموقف القانوني..."
              rows={5} className={`w-full resize-none rounded-xl border px-4 py-3 text-[13px] outline-none leading-relaxed pe-14 ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50/80 text-zinc-800 placeholder:text-zinc-400"}`} />
            <div className="absolute bottom-3 start-3">
              <VoiceInput onTranscript={t => setLetterSubject(prev => prev ? prev + " " + t : t)} compact />
            </div>
          </div>

          {/* Legal reference */}
          <div>
            <p className={`text-[10px] font-bold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              نص نظامي مرجعي <span className="opacity-60 font-normal">(اختياري)</span>
            </p>
            <input value={letterLegalRef} onChange={e => setLetterLegalRef(e.target.value)}
              placeholder="مثال: المادة ٧٧ من نظام العمل — المبدأ ٢٤٣٥ من مجلس القضاء الأعلى"
              className={`w-full rounded-xl border px-4 py-2.5 text-[12px] outline-none ${
                isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"
              }`} />
          </div>

          {/* Attachments — free-text labels, NOT uploaded files. There is no
              file picker in this workflow; these are just names the client
              wants noted (e.g. what they will physically enclose with the
              mailed letter). Copy says so explicitly so this can't be
              mistaken for a real upload control (Task C4). */}
          <div>
            <p className={`text-[10px] font-bold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              أسماء المرفقات المطلوب إرفاقها بالخطاب <span className="opacity-60 font-normal">(اختياري — نص فقط، بدون رفع ملفات هنا)</span>
            </p>
            <div className="flex gap-2">
              <input value={attachmentInput} onChange={e => setAttachmentInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && attachmentInput.trim()) {
                    e.preventDefault();
                    setLetterAttachments(prev => [...prev, attachmentInput.trim()]);
                    setAttachmentInput("");
                  }
                }}
                placeholder="اسم المرفق ثم Enter..."
                className={`flex-1 rounded-xl border px-3.5 py-2 text-[12px] outline-none ${
                  isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"
                }`} />
              <button onClick={() => { if (attachmentInput.trim()) { setLetterAttachments(prev => [...prev, attachmentInput.trim()]); setAttachmentInput(""); } }}
                className={`px-3 rounded-xl border text-[12px] font-bold transition-colors ${
                  isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"
                }`}>
                <Plus size={14} />
              </button>
            </div>
            {letterAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {letterAttachments.map((att, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={spring}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] ${
                      isDark
                        ? "bg-zinc-800 text-zinc-300 border border-white/[0.07]"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    <Paperclip size={10} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                    {att}
                    <button
                      onClick={() => setLetterAttachments(prev => prev.filter((_, fi) => fi !== i))}
                      className="opacity-50 hover:opacity-100 hover:text-red-400 transition-opacity"
                    >
                      <X size={9} />
                    </button>
                  </motion.span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setLetterStep(2)}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[12px] font-semibold transition-colors active:scale-[0.98] ${
                isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-zinc-500 hover:bg-slate-50"
              }`}
            >
              <ArrowRight size={13} /> رجوع
            </button>
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              transition={spring}
              onClick={() => setLetterStep(4)}
              disabled={letterSubject.trim().length < 10}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-500 px-6 py-2.5 text-[13px] font-bold text-white disabled:opacity-40 shadow-[0_4px_12px_-4px_rgba(37,99,235,0.5)]"
            >
              <PaperPlaneTilt size={14} />التالي: مراجعة وإرسال
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Step 4 — مراجعة الطلب وإرساله (Task C4). Real replacement for the
          old letterDone-gated view below, which showed a fake "AI drafting"
          spinner then non-functional PDF/Word/تعديل/واتساب buttons. This
          screen previews the same fullLetterText (genuinely composed from
          steps 1-3, not fabricated) and submits it as a real order — the
          admin's starting draft, per the controller notes. */}
      {letterStep === 4 && (
        <motion.div key="ls4-submit" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 space-y-4`}>
          <div>
            <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مراجعة الطلب وإرساله</h2>
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              سيراجع فريق نظامي بيانات الخطاب يدوياً ويُصدر لك النسخة النهائية الجاهزة للاستخدام، وسيصلك إشعار عند جهوزيتها. النص أدناه مسودة انطلاق مبنية على بياناتك — لن يُرسل كما هو دون مراجعة الفريق.
            </p>
          </div>

          <dl className="space-y-2">
            <div className="flex gap-3 text-[12px]">
              <dt className={isDark ? "text-zinc-500 w-28 shrink-0" : "text-zinc-400 w-28 shrink-0"}>نوع الخطاب</dt>
              <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>{letterTypeLabel || "—"}</dd>
            </div>
            <div className="flex gap-3 text-[12px]">
              <dt className={isDark ? "text-zinc-500 w-28 shrink-0" : "text-zinc-400 w-28 shrink-0"}>المرسِل</dt>
              <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>{senderName} ({senderRole === "individual" ? "فرد" : "شركة / مؤسسة"})</dd>
            </div>
            <div className="flex gap-3 text-[12px]">
              <dt className={isDark ? "text-zinc-500 w-28 shrink-0" : "text-zinc-400 w-28 shrink-0"}>المستلِم</dt>
              <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>
                {recipientType === "government" ? `${govEntity || recipientName} (جهة حكومية)` : `${recipientName} (${recipientType === "individual" ? "فرد" : "شركة / مؤسسة"})`}
              </dd>
            </div>
            {letterLegalRef && (
              <div className="flex gap-3 text-[12px]">
                <dt className={isDark ? "text-zinc-500 w-28 shrink-0" : "text-zinc-400 w-28 shrink-0"}>مرجع نظامي</dt>
                <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>{letterLegalRef}</dd>
              </div>
            )}
            {responseDeadline && (
              <div className="flex gap-3 text-[12px]">
                <dt className={isDark ? "text-zinc-500 w-28 shrink-0" : "text-zinc-400 w-28 shrink-0"}>مهلة الرد</dt>
                <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>{deadlineDays} أيام</dd>
              </div>
            )}
            {letterAttachments.length > 0 && (
              <div className="flex gap-3 text-[12px]">
                <dt className={isDark ? "text-zinc-500 w-28 shrink-0" : "text-zinc-400 w-28 shrink-0"}>أسماء مرفقات (نص فقط)</dt>
                <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>{letterAttachments.join("، ")}</dd>
              </div>
            )}
          </dl>

          <div className={`rounded-xl p-4 font-sans text-[12px] leading-[2] whitespace-pre-line ${isDark ? "bg-zinc-800/50 text-zinc-300" : "bg-zinc-50 text-zinc-700"}`} dir="rtl">
            {fullLetterText || "أكمل بيانات الخطوات السابقة لمعاينة نص الخطاب"}
          </div>

          {submitErrors.length > 0 && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 space-y-1">
              {submitErrors.map(e => (
                <p key={e} className="flex items-center gap-1.5 text-[11px] text-red-500">
                  <Warning size={12} />{e}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => { setSubmitErrors([]); setLetterStep(3); }}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[12px] font-semibold transition-colors active:scale-[0.98] ${
                isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-zinc-500 hover:bg-slate-50"
              }`}
            >
              <ArrowRight size={13} /> رجوع
            </button>
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              transition={spring}
              onClick={submitLetterOrder}
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] px-6 py-2.5 text-[13px] font-bold text-white disabled:opacity-40 shadow-lg"
            >
              <PaperPlaneTilt size={14} />{submitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Step 4 (legacy) — الخطاب الجاهز. HIDDEN, not deleted (Task C4):
          generateLetter() is never called any more, so letterDone stays
          false forever and this block never renders. Kept for when real
          AI letter generation lands — see task-C4-report.md. */}
      {letterDone && (
        <motion.div key="ls4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <BetaReviewGate toolId="legal-opinion.letter" toolName="الخطاب القانوني" reviewScope="legal-data">
          <div className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
            <CheckCircle size={18} weight="fill" className="text-emerald-500 flex-shrink-0" />
            <div>
              <p className={`font-bold text-[13px] ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>الخطاب جاهز للمراجعة والتنزيل</p>
              <p className={`text-[11px] mt-0.5 ${isDark ? "text-emerald-500/70" : "text-emerald-600"}`}>
                {LETTER_TYPES.find(l => l.id === letterType)?.label} — صادر من {senderName}
              </p>
            </div>
          </div>
          <div className={`${card} p-5`}>
            <div className={`rounded-xl p-5 font-sans text-[13px] leading-[2.1] space-y-3 ${isDark ? "bg-zinc-800/50 text-zinc-200" : "bg-zinc-50 text-zinc-800"}`} dir="rtl">
              <p className="text-center font-bold text-[15px]">بسم الله الرحمن الرحيم</p>
              <p className="font-bold">
                {recipientType === "government"
                  ? `معالي / سعادة رئيس ${govEntity || recipientName}`
                  : `السيد / ${recipientName}`}
                <br />المحترم،<br />تحية طيبة وبعد،
              </p>
              <p>
                {letterType === "warning" ? "يُنذركم موكلنا / " :
                 letterType === "complaint" ? "يتقدم بهذه الشكوى / " :
                 letterType === "objection" ? "يتظلم ويعترض / " :
                 "يُحيطكم علماً / "}
                <strong>{senderName}</strong> بشأن: {letterSubject.slice(0, 150)}{letterSubject.length > 150 ? "..." : ""}
              </p>
              {letterLegalRef && (
                <p className={`text-[12px] px-3 py-2 rounded-lg border-r-2 border-[#C8A762] ${
                  isDark ? "bg-[#C8A762]/5 text-zinc-400" : "bg-amber-50 text-zinc-600"
                }`}>
                  استناداً إلى: {letterLegalRef}
                </p>
              )}
              {responseDeadline && (
                <p>لذا نطلب منكم اتخاذ الإجراء اللازم خلال ({deadlineDays}) أيام من تاريخ استلام هذا الخطاب، وإلا احتفظنا بحق اتخاذ كافة الإجراءات القانونية الكفيلة بصون الحقوق.</p>
              )}
              {letterAttachments.length > 0 && (
                <div>
                  <p className="font-bold text-[12px] mb-1">المرفقات:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {letterAttachments.map((att, i) => (
                      <li key={i} className="text-[12px]">{att}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="font-bold">مقدمه،<br />{senderName}</p>
            </div>
            <div className="flex gap-2 mt-4 flex-wrap">
              <button className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white">
                <DownloadSimple size={13} /> PDF
              </button>
              <button className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E]/80 px-4 py-2 text-[12px] font-bold text-white">
                <DownloadSimple size={13} /> Word
              </button>
              <button className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[12px] font-semibold ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-zinc-600"}`}>
                <PencilSimple size={13} /> تعديل
              </button>
              {["lawyer", "firm", "provider"].includes(user?.userType as string) && (
                <button className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-[12px] font-bold text-white">
                  واتساب الموكل
                </button>
              )}
              <button onClick={() => { setLetterStep(1); setLetterType(""); setLetterPurpose(""); setSenderName(""); setRecipientName(""); setRecipientType("individual"); setGovEntity(""); setLetterSubject(""); setLetterLegalRef(""); setLetterAttachments([]); setLetterDone(false); onBack(); }}
                className={`ms-auto flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[12px] font-semibold ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-zinc-600"}`}>
                خطاب جديد
              </button>
            </div>
            <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
              <AiResultActions
                text={fullLetterText}
                filename={`letter-${letterType || "draft"}-${senderName.replace(/\s+/g, "-").toLowerCase() || "unnamed"}`}
                showCollector
                collectorSource="legal-opinion"
                showHumanReview={false}
                showShare
                className="justify-start"
              />
            </div>
          </div>
          </BetaReviewGate>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
