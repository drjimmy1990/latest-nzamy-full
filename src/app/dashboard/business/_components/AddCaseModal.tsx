"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { createWorkflowId, createWorkflowRequest } from "@/lib/clientWorkflowRepository";

/**
 * AddCaseModal — «تسجيل قضية / طلب قانوني جديد» on the corporate dashboard.
 *
 * THE DEFECT THIS FILE USED TO CARRY, twice over:
 *
 *  1. THE REQUEST WENT NOWHERE. handleSave called saveWorkflowRequest()
 *     (src/lib/workflowStore.ts), which is a thin wrapper over
 *     createWorkflowRequestLocal() — the browser's own localStorage, and
 *     nothing else. The screen then told the client «تم تسجيل الطلب وإرساله
 *     للقسم القانوني لاتخاذ اللازم» over a row that never left their laptop.
 *     It now POSTs through createWorkflowRequest(), the same repository call
 *     the client form uses, which reaches /api/v1/service-requests in Supabase
 *     mode and re-throws on failure so the failure is shown instead of
 *     swallowed.
 *
 *  2. IT WAS ADDRESSED TO NOBODY. The row was written with
 *     `receiver: "business_legal"`, and no reader of that value exists
 *     anywhere in this codebase. The admin fulfilment queue hard-filters
 *     `.eq("receiver", "ai_workspace")` (src/app/api/v1/admin/service-orders/
 *     route.ts) — that one predicate is the whole of "a human will see this".
 *     Any other receiver means the row is saved where nobody looks, which is
 *     the exact bug the client form was fixed for; see the header of
 *     src/app/dashboard/client/requests/new/page.tsx, which is this file's
 *     reference. The name is historical and no AI is involved: it means
 *     "fulfilled by the نظامي team".
 *
 * Everything the two form steps collect is carried into `metadata.intake` so
 * the fulfilment card and buildOrderPrompt() can render it — each key has an
 * Arabic label in src/lib/services/intakeValues.ts, without which the team
 * reads the raw English key.
 *
 * No payment is taken and none is implied: intake is free and the team quotes
 * afterwards, so the row is born `amount: 0 / not_required`, which is also
 * what keeps the route's 402 gate (it fires on `Number(payment.amount) > 0`,
 * and no gateway exists) from refusing the submission outright.
 */

interface Props {
  onClose: () => void;
  isDark: boolean;
  /** Called after successful save so parent can append to Kanban/list */
  onCaseAdded?: (newCase: { id: string; title: string; type: string; dept: string; urgency: string }) => void;
}

const CASE_TYPES = [
  "مراجعة عقد مورد (تجاري)",
  "صياغة خطاب إنذار (عمالي)",
  "شكوى أو نزاع مستمر",
  "استشارة بخصوص الامتثال (PDPL)",
  "أخرى",
];

const DEPARTMENTS = [
  "المشتريات والعقود",
  "الموارد البشرية (HR)",
  "المالية",
  "الإدارة التنفيذية",
  "تقنية المعلومات",
];

type Urgency = "حرجة" | "عاجلة" | "طبيعية" | "";

export default function AddCaseModal({ onClose, isDark, onCaseAdded }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);

  // ── Controlled form state ──────────────────────────────────────────────────
  const [caseType, setCaseType] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [details, setDetails] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /**
   * The reference the server actually stored, not the one this file generated.
   * They agree today (the route inserts `requestData.id` when given one), but
   * quoting the response is what keeps the number on the client's screen and
   * the number in the queue the same if that ever stops being true.
   */
  const [savedId, setSavedId] = useState<string | null>(null);

  const canProceedStep1 = caseType !== "" && caseTitle.trim() !== "";
  const canFinish = urgency !== "";

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  const user = useUser();

  const handleSave = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const request = await createWorkflowRequest({
        id: createWorkflowId("BIZ"),
        type: "business_case",
        title: caseTitle,
        description: details.trim(),
        requester: {
          userId: user.userId,
          name: user.name,
          role: user.userType,
          tier: user.tier,
          businessRole: user.businessRole,
        },
        // See the file header: this literal, and only this literal, is what
        // puts the request in front of a human.
        receiver: "ai_workspace",
        status: "pending_assignment",
        payment: { amount: 0, status: "not_required" },
        sourcePath: "/dashboard/business",
        // The cast mirrors the client form's (see its comment): the declared
        // `Record<string, string | number | boolean | null>` on
        // WorkflowRequest.metadata is stale rather than load-bearing — the
        // route already reads `metadata.intake` as an object — and widening
        // that declaration is a change in src/lib/workflowStore.ts, not here.
        metadata: {
          // NEVER one of the four AI ServiceKeys (draft / contracts /
          // wargaming / legal_opinion): checkOrderIntake() resolves the
          // service off this field and would then run that wizard's validator
          // over a corporate intake it can never satisfy, answering 400 and
          // rejecting the whole request.
          service: "business_case",
          // buildOrderPrompt() heads the team's brief with this. Without it
          // every corporate request is titled «طلب خدمة».
          serviceTitleAr: "طلب قانوني من حساب منشأة",
          intake: {
            service: "business_case",
            caseType,
            department,
            urgency,
            details,
          },
        } as unknown as Record<string, string | number | boolean | null>,
        auditEvent: "business_case_created",
      });
      setSavedId(request.id);
      setDone(true);
    } catch (err) {
      console.error("[business case] submit failed:", err);
      setSubmitError("تعذّر إرسال الطلب — تحقّق من اتصالك وحاول مجدداً. لم يُسجَّل أي طلب.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Why the Kanban/list update waits for this button instead of firing inside
   * handleSave: the parent's onCaseAdded ends with setShowAddCase(false)
   * (src/app/dashboard/business/page.tsx), so calling it at save time
   * unmounted this modal the instant the row was written — the client never
   * saw the confirmation, never saw the reference number, and on a failed
   * submit would have seen the request appear in the list anyway.
   */
  const handleDoneClose = () => {
    // Guarded on the reference rather than on `done`: the parent renders the
    // id it is handed as `NZ-${id}` with no fallback of its own, so handing it
    // an empty one would put a row reading «NZ-» on the dashboard for a
    // request nobody could then look up. No row at all is the honest failure.
    if (savedId) {
      onCaseAdded?.({ id: savedId, title: caseTitle, type: caseType, dept: department, urgency });
    }
    onClose();
  };

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
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
            تسجيل قضية / طلب قانوني جديد
          </h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            {/* Says only what happened: a row now exists in فريق نظامي's
                fulfilment queue with status «بانتظار المراجعة». It does NOT
                claim the company's own legal department was notified — the
                old copy said «وإرساله للقسم القانوني» over a localStorage
                write, and no such routing exists even now. */}
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تم استلام الطلب</p>
            <p className={`text-[12px] mt-1 leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              وصل طلبك إلى فريق نظامي القانوني وهو الآن ضمن قائمة الطلبات بانتظار المراجعة. لم يُطلب منك أي دفع.
            </p>
            {savedId && (
              <p className={`text-[12px] mt-3 mb-4 font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                رقم الطلب: <span className="font-mono" dir="ltr">{savedId}</span>
              </p>
            )}
            <button onClick={handleDoneClose} className="rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition">
              العودة للوحة القيادة
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>نوع الطلب / القضية *</label>
                    <select className={inputCls} value={caseType} onChange={e => setCaseType(e.target.value)}>
                      {/* Was «اختر التصنيف...» under a label reading «نوع الطلب / القضية»
                          — one field named two ways, the same mismatch already
                          fixed in the lawyer's add-hearing modal. The
                          placeholder repeats the label's word. */}
                      <option value="" disabled>اختر نوع الطلب...</option>
                      {CASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>عنوان مختصر للطلب *</label>
                    <input
                      type="text"
                      placeholder="مثال: عقد توريد معدات شركة الساطع"
                      className={inputCls}
                      value={caseTitle}
                      onChange={e => setCaseTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>القسم الطالب</label>
                    <select className={inputCls} value={department} onChange={e => setDepartment(e.target.value)}>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!canProceedStep1}
                    className="w-full rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold hover:bg-[#092e22] transition mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    الخطوة التالية
                  </button>
                </motion.div>
              )}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                  <div>
                    {/* «فريق نظامي القانوني», not «القسم القانوني»: inside a
                        corporate dashboard the second reads as the company's
                        own in-house department, and no routing to any such
                        department exists — the request goes to the نظامي
                        fulfilment queue. The label in
                        src/lib/services/intakeValues.ts is this same string. */}
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تفاصيل إضافية لفريق نظامي القانوني</label>
                    <textarea
                      rows={3}
                      placeholder="اكتب ملاحظاتك للمستشار القانوني أو المحامي هنا..."
                      className={`${inputCls} resize-none`}
                      value={details}
                      onChange={e => setDetails(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مستوى الأهمية / الاستعجال *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["حرجة", "عاجلة", "طبيعية"] as const).map(u => (
                        <button
                          key={u}
                          onClick={() => setUrgency(u)}
                          className={`rounded-xl border py-2 text-[12px] font-bold transition-all ${
                            urgency === u
                              ? u === "حرجة"
                                ? "bg-red-500 border-red-500 text-white"
                                : u === "عاجلة"
                                ? "bg-amber-500 border-amber-500 text-white"
                                : "bg-blue-500 border-blue-500 text-white"
                              : isDark
                              ? "border-white/[0.08] bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* A failed POST must say so on the same screen as the
                      button that failed. Without this the catch above would
                      be silent and the client would press «حفظ واعتماد»
                      forever with nothing changing. */}
                  {submitError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-semibold leading-relaxed text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
                      {submitError}
                    </div>
                  )}
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => setStep(1)}
                      disabled={isSubmitting}
                      className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold transition disabled:opacity-40 ${isDark ? "bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      رجوع
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!canFinish || isSubmitting}
                      className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold hover:bg-[#092e22] shadow-[0_4px_12px_rgba(11,61,46,0.3)] transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSubmitting && <span className="h-4 w-4 rounded-full border-2 border-[#C8A762]/30 border-t-[#C8A762] animate-spin" />}
                      {isSubmitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
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
