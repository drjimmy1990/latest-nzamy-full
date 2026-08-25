"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, CheckCircle, FileText, UploadSimple,
  Receipt, Paperclip, CaretLeft, PaperPlaneTilt, Info, X
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { useClientPricingCatalog } from "@/hooks/useClientPricingCatalog";
import { useOrderAttachments } from "@/hooks/useOrderAttachments";
import { createWorkflowId, createWorkflowRequest } from "@/lib/clientWorkflowRepository";
import { getClientServiceById, formatClientServicePrice } from "@/lib/pricingRepository";

/**
 * NewRequestWizard — the client's «طلب خدمة جديدة» form.
 *
 * THE MODEL THIS FORM SERVES (owner's ruling, 26 August): there is no AI
 * automation and no payment gateway. A request is fulfilled MANUALLY by the
 * نظامي team out of the admin queue. So the client submits FREE, the team
 * reads the request and quotes afterwards, and the catalogue figure appears
 * here only as «السعر التقديري».
 *
 * Two defects this file used to have, both of which made a submitted request
 * useless or impossible:
 *
 *  1. NOTHING COULD BE SUBMITTED. A `paymentsBlocked` gate refused the submit
 *     whenever the total was above zero, and 22 of the 27 catalogue services
 *     carry `requiresPayment: true` while no gateway exists — so the client
 *     wrote their request and hit a wall. The request now goes out with
 *     `payment: { amount: 0, status: "not_required" }`, which is also what
 *     keeps POST /api/v1/service-requests' 402 gate (it fires on
 *     `Number(payment.amount) > 0`) from firing. The price is NOT hidden and
 *     the service is NOT called free: the public pages advertise these
 *     numbers, so the figure stays on screen, labelled as an estimate, next to
 *     the sentence saying the team sets the final one.
 *
 *  2. THE FILES WERE THROWN AWAY. The form collected `File[]` and stored only
 *     `fileCount`/`fileNames` in metadata — there was no upload call in this
 *     file at all, so the team received a list of documents it could not open.
 *     It now uses `useOrderAttachments`, the same hook the four lawyer wizards
 *     use: files upload immediately with `request_id NULL`, and POST
 *     /api/v1/service-requests re-binds them to the new order by reading
 *     `metadata.attachments` (route.ts:293-329). The hook's array is passed
 *     through verbatim — that binding reads `.documentId` off each entry and
 *     any remapping here would silently no-op it.
 *
 * WHY `receiver: "ai_workspace"` — the admin queue hard-filters
 * `.eq("receiver","ai_workspace")` (api/v1/admin/service-orders/route.ts:54).
 * That one predicate is the whole of "the team can see this row". The name is
 * historical and no AI is involved; it means "fulfilled by the نظامي team, not
 * the marketplace". This form used to send `serviceInfo.receiverType`, which
 * is "lawyer" for 22 of the 27 services — those rows reached the database and
 * nobody ever saw them.
 */

const STEPS = [
  { id: "details", label: "تفاصيل الطلب" },
  { id: "documents", label: "المرفقات" },
  { id: "review", label: "المراجعة والإرسال" },
];

export default function NewRequestWizard() {
  const router = useRouter();
  const user = useUser();
  const searchParams = useSearchParams();
  const typeParam = searchParams?.get("type") || "general";

  const [currentStep, setCurrentStep] = useState(0);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { catalog, source: pricingSource } = useClientPricingCatalog();
  // Real uploads, identical to the four lawyer wizards. `attachments` holds
  // OrderAttachment[] — a documentId that exists server-side — not File
  // objects that never left the browser.
  const { attachments, uploading, attachError, attachFiles, removeAttachment } = useOrderAttachments();

  const serviceInfo = getClientServiceById(typeParam, catalog);
  const price = serviceInfo.requiresPayment ? serviceInfo.basePrice : 0;
  const serviceLabel = serviceInfo.label;
  const estimateLabel = formatClientServicePrice(serviceInfo);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(c => c + 1);
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(c => c - 1);
    else router.back();
  };

  /**
   * One batch call rather than a loop of single attachFile() calls — see
   * attachFiles() in useOrderAttachments.ts: it validates the whole selection
   * up front, keeps an accumulating error list, and stops the batch only on a
   * timeout.
   *
   * Array.from() BEFORE the reset: `event.target.files` is a live FileList and
   * the `value = ""` that lets the same filename be re-picked empties it in
   * place, so reading it afterwards yields nothing at all.
   */
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length > 0) await attachFiles(picked);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const requestId = createWorkflowId("REQ");
      const request = await createWorkflowRequest({
        id: requestId,
        type: serviceInfo.requestType === "consultation" ? "service" : serviceInfo.requestType,
        title: subject,
        description,
        requester: {
          userId: user.userId,
          name: user.name,
          role: user.userType,
          tier: user.tier,
          businessRole: user.businessRole,
        },
        // NOT serviceInfo.receiverType — see the file header. This literal is
        // what the admin queue filters on, and 20260815_marketplace_excludes_
        // ai_workspace.sql depends on it too.
        receiver: "ai_workspace",
        // Free intake: nothing is owed at submission, so the row must not be
        // born «بانتظار الدفع» for a charge the client cannot clear.
        status: "pending_assignment",
        payment: { amount: 0, status: "not_required" },
        sourcePath: "/dashboard/client/requests/new",
        // The cast is deliberate and narrow. `WorkflowRequest.metadata` is
        // still typed `Record<string, string | number | boolean | null>`, but
        // that type is stale rather than load-bearing: POST
        // /api/v1/service-requests already reads `metadata.attachments` as an
        // array of objects (route.ts:293-329) and `metadata.intake` as an
        // object (intakeGuard.checkOrderIntake), and createServiceOrder()
        // sends exactly this nested shape today by bypassing the type
        // entirely. Widening the declaration in src/lib/workflowStore.ts is
        // the real fix and is reported upstream.
        metadata: {
          service: serviceInfo.serviceId,
          // Every surface that renders an ai_workspace order reads this for
          // its heading (/ai/orders, /ai/orders/[id], buildOrderPrompt) — a
          // catalogue serviceId is not one of the four premium ServiceKeys, so
          // without this the title would be blank.
          serviceTitleAr: serviceLabel,
          schemaVersion: 1,
          requestedType: serviceInfo.serviceId,
          categoryId: serviceInfo.categoryId,
          // The catalogue figure, kept so the team sees what the client was
          // shown before they quote. It is an estimate, not a charge — the
          // payment above is 0/not_required.
          originalPrice: price,
          priceMode: serviceInfo.priceMode,
          quoteSource: pricingSource,
          // Without an `intake` object buildOrderPrompt() renders «—» under
          // «بيانات العميل المُدخلة» and the team's brief is empty. `service`
          // is a HIDDEN_INTAKE_KEY so it never prints; `description` already
          // has an Arabic label in intakeValues.ts.
          intake: {
            service: serviceInfo.serviceId,
            subject,
            description,
          },
          // Verbatim, no remapping: route.ts reads `.documentId` off each
          // entry to bind the uploaded files to this order.
          attachments,
        } as unknown as Record<string, string | number | boolean | null>,
        auditEvent: "client_request_created",
      });
      router.push(`/dashboard/client/requests?success=1&id=${request.id}`);
    } catch (err) {
      console.error("[client request] submit failed:", err);
      setSubmitError("تعذّر إرسال الطلب — تحقق من اتصالك وحاول مجدداً. لم يُطلب منك أي دفع.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">نوع الخدمة المطلوب</label>
              <div className="w-full bg-gray-50 dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2 cursor-not-allowed font-bold">
                <FileText size={18} className="text-[#C8A762]" />
                {serviceLabel}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">موضوع الطلب الأساسي</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="مثال: مراجعة عقد شراكة تجارية"
                className="w-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#0B3D2E] focus:ring-1 focus:ring-[#0B3D2E] outline-none transition-all dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">وصف تفصيلي للطلب</label>
              <textarea
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="اكتب كل التفاصيل التي ستساعد الفريق على دراسة طلبك بأفضل شكل..."
                className="w-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#0B3D2E] focus:ring-1 focus:ring-[#0B3D2E] outline-none transition-all resize-none dark:text-white"
              />
            </div>
          </motion.div>
        );
      case 1:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
            <label className={`block border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl p-8 text-center transition-colors group ${uploading ? "opacity-60 cursor-wait" : "hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"}`}>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                disabled={uploading}
                className="sr-only"
              />
              <div className="w-14 h-14 bg-[#0B3D2E]/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                {uploading
                  ? <div className="w-6 h-6 border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] rounded-full animate-spin" />
                  : <UploadSimple size={24} className="text-[#0B3D2E]" />}
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                {uploading ? "جارٍ رفع الملفات..." : "اضغط هنا لرفع المستندات"}
              </p>
              <p className="text-xs text-gray-500">PDF أو Word أو صورة — بحد أقصى ٢٠ ميجابايت للملف</p>
            </label>

            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div key={attachment.documentId} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-[#161b22]">
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckCircle size={16} weight="fill" className="flex-shrink-0 text-emerald-600" />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-gray-900 dark:text-white">{attachment.name}</p>
                        <p className="text-gray-400">
                          {Math.max(1, Math.round(attachment.size / 1024)).toLocaleString("ar-SA")} ك.ب · تم الرفع
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.documentId)}
                      aria-label={`إزالة ${attachment.name}`}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-xl p-4 flex items-start gap-3 text-xs leading-relaxed">
              <Info size={18} className="flex-shrink-0 mt-0.5" />
              <p>رفع المستندات ذات الصلة (مثل العقود السابقة، أو الأحكام، أو الهوية) يُسرّع من معالجة طلبك ويساعد الفريق على دراسة موقفك بدقة. المرفقات اختيارية.</p>
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

            {/* الإرسال مجاني — يقدّر الفريق السعر النهائي بعد القراءة. لا يوجد
                أي خصم أو محفظة أو بطاقة في هذه الصفحة لأن أياً منها لا يُنفَّذ
                فعلياً عند الإرسال. */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold leading-relaxed text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
              <span>إرسال الطلب مجاني — لا يُطلب منك أي دفع في هذه الخطوة. يراجع فريق نظامي طلبك ثم يتواصل معك بعرض السعر النهائي قبل بدء التنفيذ.</span>
            </div>

            {/* السعر التقديري */}
            <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                  <Receipt size={18} className="text-[#C8A762]" />
                  {/* «السعر التقديري» is the right heading over a figure the
                      team will re-quote. Over «مجانا» / «مشمول في الباقة»
                      (priceMode free/included, where requiresPayment is false
                      and price is 0) it reads as if the free-ness itself were
                      an estimate, so those say «سعر الخدمة» instead. */}
                  {price > 0 ? "السعر التقديري" : "سعر الخدمة"}
                </span>
                <span className="text-lg font-black text-[#0B3D2E] dark:text-[#C8A762]">{estimateLabel}</span>
              </div>
              {serviceInfo.priceNote && (
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">{serviceInfo.priceNote}</p>
              )}
              <p className="pt-3 border-t border-gray-200 dark:border-white/10 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                {price > 0
                  ? `هذا الرقم استرشادي من قائمة أسعار «${serviceLabel}». السعر النهائي يحدده الفريق بعد قراءة طلبك ومرفقاتك، ويصلك في عرض سعر مستقل قبل أي تنفيذ.`
                  : "هذه الخدمة بلا رسوم. إن احتاج طلبك عملاً خارج نطاقها، يصلك عرض سعر مستقل قبل أي تنفيذ."}
              </p>
            </div>

            {/* مراجعة ما سيُرسل */}
            <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
              <p className="text-sm font-bold text-gray-900 dark:text-white">مراجعة الطلب قبل الإرسال</p>
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-gray-500">الخدمة</p>
                <p className="text-sm text-gray-800 dark:text-gray-300">{serviceLabel}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-gray-500">موضوع الطلب</p>
                <p className="text-sm text-gray-800 dark:text-gray-300 break-words">{subject || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-gray-500">الوصف</p>
                <p className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap break-words">{description || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-gray-500">المرفقات</p>
                {attachments.length === 0 ? (
                  <p className="text-sm text-gray-800 dark:text-gray-300">لا توجد مرفقات</p>
                ) : (
                  <ul className="space-y-1">
                    {attachments.map((attachment) => (
                      <li key={attachment.documentId} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-300">
                        <Paperclip size={14} className="flex-shrink-0 text-gray-400" />
                        <span className="truncate">{attachment.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

          </motion.div>
        );
      default: return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4" dir="rtl">

      {/* Header */}
      <div className="mb-8">
        <button onClick={handlePrev} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-full mb-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
          <ArrowRight size={18} className="text-gray-600 dark:text-gray-400" />
        </button>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
          طلب خدمة جديدة
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          أكمل الخطوات الثلاث لإرسال طلبك إلى فريق نظامي — الإرسال مجاني ويصلك عرض السعر بعد المراجعة
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between mb-12 relative px-2">
        <div className="absolute top-5 left-6 right-6 h-1 bg-slate-200 dark:bg-white/[0.04] -translate-y-1/2 -z-10 rounded-full" />
        <motion.div
          className="absolute top-5 right-6 h-1 bg-[#0B3D2E] dark:bg-[#C8A762] -translate-y-1/2 -z-10 rounded-full transition-all duration-300"
          style={{ width: `calc(${(currentStep / (STEPS.length - 1)) * 100}% - 3rem)` }}
        />
        {STEPS.map((step, idx) => {
          const isPassed = idx < currentStep;
          const isActive = idx === currentStep;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => idx < currentStep && setCurrentStep(idx)}
              disabled={idx > currentStep}
              className={`flex flex-col items-center gap-2 relative ${idx > currentStep ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-105 active:scale-95 transition-transform'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                  isActive
                    ? "bg-[#0B3D2E] text-white shadow-[0_0_0_4px_rgba(11,61,46,0.15)] dark:bg-[#C8A762] dark:shadow-[0_0_0_4px_rgba(200,167,98,0.2)]"
                    : isPassed
                    ? "bg-[#0B3D2E] text-white dark:bg-[#C8A762]"
                    : "bg-white dark:bg-[#161b22] text-slate-400 border-2 border-slate-200 dark:border-white/[0.06]"
                }`}
              >
                {isPassed ? <CheckCircle size={18} weight="bold" /> : idx + 1}
              </div>
              <span
                className={`absolute top-12 text-[11.5px] font-bold whitespace-nowrap transition-colors ${
                  isActive ? "text-[#0B3D2E] dark:text-white" : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Form */}
      <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl border border-slate-200/50 dark:border-white/[0.06] shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] rounded-[2rem] p-6 md:p-8 mb-6">
        <AnimatePresence mode="wait">
          {renderStepContent()}
        </AnimatePresence>
      </div>

      {/* Footer Actions */}
      {/* Deliberately OUTSIDE renderStepContent(): an upload failure raised on
          step 2 must still be on screen on step 3, where the client presses
          «إرسال الطلب». Rendered inside the step it would vanish on «التالي»,
          and a client whose 2-of-5 files failed would submit believing all
          five went — the same silently-short attachment list this rewrite
          exists to remove. */}
      {attachError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold leading-relaxed text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
          {attachError}
        </div>
      )}
      {submitError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
          {submitError}
        </div>
      )}
      {uploading && (
        <p className="mb-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
          انتظر انتهاء رفع الملفات قبل المتابعة حتى لا يُرسَل الطلب ناقص المرفقات.
        </p>
      )}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrev}
          className={`px-8 py-3.5 rounded-2xl font-bold text-[13.5px] transition-all border ${currentStep === 0 ? "opacity-0 pointer-events-none" : "text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/[0.04] bg-white dark:bg-transparent shadow-sm"}`}
        >
          السابق
        </button>
        <button
          onClick={currentStep === STEPS.length - 1 ? handleSubmit : handleNext}
          // `uploading` blocks every step, not just the last: a click while an
          // upload is in flight would ship an `attachments` array missing that
          // file — a silently short attachment list, which is the same defect
          // as losing the files outright.
          disabled={isSubmitting || uploading || (currentStep === 0 && (!subject || !description))}
          className="flex items-center gap-2 px-8 py-3.5 bg-[#0B3D2E] text-white rounded-2xl font-bold text-[13.5px] hover:bg-[#0a3328] transition-all shadow-[0_4px_14px_0_rgba(11,61,46,0.3)] disabled:opacity-50 active:scale-[0.98]"
        >
          {isSubmitting ? (
             <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : currentStep === STEPS.length - 1 ? (
            <>
              إرسال الطلب <PaperPlaneTilt size={18} weight="fill" />
            </>
          ) : (
            <>
              التالي <CaretLeft size={16} weight="bold" />
            </>
          )}
        </button>
      </div>

    </div>
  );
}
