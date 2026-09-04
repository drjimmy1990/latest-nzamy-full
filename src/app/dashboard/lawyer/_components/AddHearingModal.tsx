"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { createWorkflowRequest } from "@/lib/services/workflowService";
import { isSupabaseMode } from "@/lib/services/api";
import { createLawyerHearing } from "@/lib/services/lawyerHearingsService";
import { createWorkflowId } from "@/lib/workflowStore";
import type { UserType, UserTier } from "@/hooks/useUser";
import { describeDateAr, toArabicDigits } from "@/lib/services/hijri";

interface Props {
  onClose: () => void;
  isDark: boolean;
  /**
   * Current user context from the parent page (useUser()). REQUIRED — the
   * Phase 1 write path (POST /api/v1/lawyer/hearings) resolves the owner from
   * the session itself, but `user.userId` still gates the save client-side so
   * a not-yet-resolved session cannot submit a request that would 401.
   */
  user: { userId?: string; name: string; userType: UserType; tier: UserTier };
  /**
   * When opened from a case file, the case this hearing belongs to. Passed
   * straight through as `caseRequestId` — the case-name text field is hidden
   * in that mode since the case is already known, not asked for twice.
   */
  caseRequestId?: string;
  /** Prefills the case-name field for the general diary (unlinked) flow. */
  defaultCaseName?: string;
  /**
   * Prefills the date field, e.g. when opened by double-clicking a day on the
   * calendar grid. Expected as "YYYY-MM-DD" — the same shape the date input
   * and the hearings rows use. The lawyer can still change it before saving.
   */
  initialDate?: string;
}

type Urgency = "critical" | "high" | "normal";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "hearing",      label: "جلسة قضائية" },
  { value: "deadline",     label: "موعد طعن / نهائي" },
  { value: "gov_review",   label: "مراجعة جهة حكومية" },
  { value: "client_meet",  label: "اجتماع موكل" },
  { value: "internal",     label: "أخرى" },
];

export default function AddHearingModal({ onClose, isDark, user, caseRequestId, defaultCaseName, initialDate }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controlled inputs
  const [type, setType] = useState("");
  const [caseName, setCaseName] = useState(defaultCaseName ?? "");
  const [date, setDate] = useState(initialDate ?? "");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [location, setLocation] = useState("");

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  const urgencyBtn = (key: Urgency, label: string, activeCls: string) => (
    <button
      type="button"
      onClick={() => setUrgency(key)}
      className={`rounded-xl border py-2 text-[12px] font-bold transition-all focus:ring-2 focus:ring-offset-0 ${urgency === key ? activeCls : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"}`}
    >
      {label}
    </button>
  );

  async function handleSave() {
    // A hearing with no date is not a diary entry — the calendar has nowhere to
    // put it, and the old code defaulted it to "today, forever". The date input
    // is now gated in step 1 as well; this is the backstop.
    if (!date) {
      setError("حدِّد تاريخ الموعد قبل الحفظ — لا يمكن إدراج موعد بلا تاريخ في الجدول.");
      setStep(1);
      return;
    }
    // Refuse to write a row nobody owns. `assigned_to = null` on a
    // receiver="lawyer" row is exactly the shape the marketplace browse policy
    // opens to every verified lawyer, so an unowned hearing is both invisible
    // to its author's own filters and visible to strangers.
    if (!user.userId) {
      setError("تعذّر تحديد حسابك. أعد تحميل الصفحة ثم حاول مرة أخرى.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const typeLabel = TYPE_OPTIONS.find(t => t.value === type)?.label ?? "جلسة";
      // The case-name branch used to hardcode a title regardless of which type
      // was picked, so «موعد طعن / نهائي» was saved with a title reading
      // «جلسة — قضية الأفق» and read as a court sitting everywhere a title is
      // shown, while the type beneath it still said deadline. typeLabel is
      // the label the lawyer actually chose, already in hand one line up.
      const title = caseName.trim() ? typeLabel + " — " + caseName.trim() : typeLabel;

      // Phase 1: hearings live in their own table now (public.hearings), not
      // a metadata-flagged service_requests row. NOT createWorkflowRequest()
      // in supabase mode — that helper catches a failed POST and writes to
      // localStorage instead, so it resolves successfully on a 401/500/RLS
      // refusal and the lawyer reads «تم إضافة الموعد بنجاح» over a hearing
      // that existed only in this browser and never appeared in any list
      // again. apiMutate throws on any non-2xx and the error reaches the
      // lawyer instead.
      //
      // Demo mode still uses the old local-store path below: there it is the
      // real backend and genuinely round-trips. The lie was supabase-only.
      if (isSupabaseMode) {
        await createLawyerHearing({ type, date, time, caseName, caseRequestId, urgency, location, notes, title });
      } else {
        const id = createWorkflowId();
        await createWorkflowRequest({
          id,
          type: "service" as const,
          title,
          description: notes.trim(),
          receiver: "lawyer" as const,
          status: "pending_assignment" as const,
          requester: {
            userId: user.userId,
            name: user.name || "محامي نظامي",
            role: user.userType ?? "lawyer",
            tier: user.tier ?? "free",
          },
          payment: { amount: 0, status: "not_required" as const },
          sourcePath: "",
          metadata: { hearing: true, date, time, type, urgency, location, notes, caseName },
          assignedTo: user.userId,
        });
      }
      setDone(true);
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
    } catch (err) {
      console.error("[AddHearingModal] save failed:", err);
      setError(
        err instanceof Error && err.message
          ? `تعذّر إضافة الموعد: ${err.message}`
          : "تعذّر إضافة الموعد. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>إضافة موعد / جلسة جديدة</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] flex-col ${isDark ? "text-white" : "text-zinc-900"}`}>تم إضافة الموعد بنجاح!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              تم حفظ الموعد في جدول أعمالك. يمكنك إضافته إلى تقويم Google يدوياً من بطاقة الموعد.
            </p>
            <button onClick={onClose} className="rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition">
              إغلاق
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {error}
              </div>
            )}
            {/* «الخطوة ١ من ٢».
                The primary button reads «الخطوة التالية», which promises a
                multi-step flow, and nothing on screen said how many steps there
                were or which one you were on (shot 25). The add-client modal in
                this same product already shows «الخطوة N من ٣»; this one showed
                nothing, so the two dialogs taught the lawyer two different
                things about how dialogs behave here. */}
            <div className="mb-4 flex items-center gap-2">
              {[1, 2].map(n => (
                <div key={n} className="flex flex-1 flex-col gap-1.5">
                  <div className={`h-1 rounded-full ${n <= step ? "bg-[#0B3D2E] dark:bg-emerald-500" : isDark ? "bg-white/[0.08]" : "bg-slate-200"}`} />
                </div>
              ))}
              <span className={`shrink-0 text-[11px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {`الخطوة ${toArabicDigits(step)} من ٢`}
              </span>
            </div>

            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>نوع الموعد</label>
                    <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
                      {/* Was «اختر التصنيف...» under a label reading «نوع الموعد» —
                          two different words for one field, in one control. */}
                      <option value="" disabled>اختر نوع الموعد...</option>
                      {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {/* Hidden when opened from a case file: `caseRequestId` already
                      names the case, so asking for its name again in free text
                      would let the two disagree. The general diary (no case in
                      context) keeps the free-text field — an appointment can
                      exist before it belongs to a case. */}
                  {!caseRequestId && (
                    <div>
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>القضية / الموكل (اختياري)</label>
                      <input type="text" value={caseName} onChange={e => setCaseName(e.target.value)} placeholder="مثال: قضية الأفق" className={inputCls} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>التاريخ <span className="text-red-500">*</span></label>
                      <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      {/* «(اختياري)» because it IS optional and was not saying so.
                          A hearing saved with a date and no time is a real state
                          this form allows; the read-back below names it rather
                          than letting the lawyer find out on the calendar. */}
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الوقت <span className={isDark ? "text-zinc-500" : "text-slate-400"}>(اختياري)</span></label>
                      <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
                    </div>
                  </div>

                  {/* The date read back in words, directly under the field that
                      produced it — see describeDateAr for why this is a safety
                      control and not a nicety. */}
                  {date && describeDateAr(date) && (
                    <div className={`rounded-xl px-3 py-2 border ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                      <p className={`text-[11px] font-semibold leading-relaxed ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>
                        {describeDateAr(date)}
                        {time ? ` — الساعة ${toArabicDigits(time)}` : " — بدون وقت محدد"}
                      </p>
                    </div>
                  )}

                  {/* The required-field message used to sit BELOW the submit
                      button, so a disabled button gave no clue which field was
                      blocking it (shot 25). It sits under its own fields now and
                      names the one that is missing instead of assuming the date. */}
                  {(!type || !date) && (
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                      {!type && !date
                        ? "اختر نوع الموعد وحدّد التاريخ للمتابعة."
                        : !type
                          ? "اختر نوع الموعد للمتابعة."
                          : "التاريخ مطلوب — بدونه لن يظهر الموعد في جدول أعمالك."}
                    </p>
                  )}

                  {/* Both gates are real: a typeless row renders under the wrong
                      badge, and a dateless row has nowhere to sit on a calendar. */}
                  {/* A DISABLED PALETTE, not `disabled:opacity-40`.
                      Fading the button fades its LABEL with it: dark green at
                      40% is a washed sage and «#C8A762» on top of it is barely
                      readable, which is what shot 20 shows. Opacity is the
                      wrong tool for "off" — it makes the control quieter AND
                      less legible, when the whole job of a disabled control is
                      to stay readable while refusing the click.
                      A flat neutral surface with mid-grey text reads as off and
                      stays legible. `cursor-not-allowed` says the same thing to
                      the pointer. */}
                  <button onClick={() => setStep(2)} disabled={!type || !date}
                    className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition mt-2 ${
                      (!type || !date)
                        ? isDark
                          ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                          : "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
                    }`}>
                    الخطوة التالية
                  </button>
                </motion.div>
              )}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الموقع</label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="مثال: المحكمة التجارية - الرياض" className={inputCls} />
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ملاحظات والتزامات</label>
                    <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي مستندات مطلوبة للصياغة؟" className={`${inputCls} resize-none`} />
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مستوى الأهمية / الاستعجال</label>
                    <div className="grid grid-cols-3 gap-2">
                      {urgencyBtn("critical", "حرجة", isDark ? "border-red-500/30 bg-red-500/10 text-red-400 focus:ring-red-500/50" : "border-red-200 bg-red-50 text-red-600 focus:ring-red-500/50")}
                      {urgencyBtn("high", "عاجلة", isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-400 focus:ring-amber-500/50" : "border-amber-200 bg-amber-50 text-amber-600 focus:ring-amber-500/50")}
                      {urgencyBtn("normal", "طبيعية", isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300 focus:ring-blue-500/50" : "border-slate-200 bg-white text-slate-600 focus:ring-blue-500/50")}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button onClick={() => setStep(1)} className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold transition ${isDark ? "bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      رجوع
                    </button>
                    <button onClick={handleSave} disabled={saving} className="flex-[2] rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold hover:bg-[#092e22] shadow-[0_4px_12px_rgba(11,61,46,0.3)] transition disabled:opacity-50">
                      {saving ? "جارٍ الحفظ..." : "حفظ الموعد"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}