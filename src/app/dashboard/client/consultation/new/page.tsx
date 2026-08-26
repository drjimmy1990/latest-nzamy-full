"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Robot, SealCheck, VideoCamera, ArrowRight, ArrowLeft,
  Check, Warning, CreditCard, Sparkle,
  Buildings, ChatsCircle, Info, CheckCircle, Phone,
  Paperclip, X, Lightning, Clock, FileText,
  Package,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { useUser } from "@/hooks/useUser";
import { useClientPricingCatalog } from "@/hooks/useClientPricingCatalog";
import { usePaymentsStatus } from "@/hooks/usePaymentsStatus";
import { createWorkflowId, createWorkflowRequest } from "@/lib/clientWorkflowRepository";
import { createPaymentIntentStub } from "@/lib/paymentAdapter";
import { getClientServiceById, getConsultationModeServiceId } from "@/lib/pricingRepository";
import { LEGAL_BRANCHES_REGULAR } from "@/components/draft/draftConstants";
import { getLawyerById, type LawyerProfile } from "@/lib/services/lawyerService";
import { uploadDocumentFile, isUploadTimeoutError } from "@/lib/services/documentService";

import {
  type ConsultPath,
  type LawyerMode,
  MODE_COPY,
  IS_BETA,
} from "@/constants/clientConsultationData";
import { StepBar, PlanBadge } from "@/components/consultation/ClientConsultationComponents";

// ─── Attachment failure reporting ─────────────────────────────────────────────

/** One file that did not become an attachment on the created request. */
type AttachFailure = { name: string; reason: string };

/**
 * Arabic copy for one attachment upload that failed.
 *
 * This duplicates attachErrorMessageAr() in src/hooks/useOrderAttachments.ts on
 * purpose: that helper is module-private there, and this wizard cannot use the
 * hook at all. The hook uploads at *selection* time and owns the resulting
 * OrderAttachment list; this page deliberately holds raw File[] and uploads
 * once, at submit, after the request row exists — see the comment on the loop
 * in confirmConsultation().
 *
 * The timeout's own Arabic sentence is read back off `.message` rather than
 * retyped, so UploadTimeoutError in documentService.ts stays the single source
 * of that wording. The machine `.code` is logged next to the raw message
 * because an UploadTimeoutError's message is Arabic prose and no longer
 * identifies the error in a developer console.
 */
function attachmentErrorAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error ? (err as { code?: unknown }).code : undefined;
  console.error("[consultation] attachment upload failed:", code ?? raw, raw);
  if (isUploadTimeoutError(err)) {
    return err.message;
  }
  if (raw === "upload_unavailable_demo") {
    return "رفع المرفقات غير متاح في وضع العرض التجريبي.";
  }
  if (raw === "Unauthorized") {
    return "انتهت جلستك — يرجى تسجيل الدخول مجدداً.";
  }
  return "تعذّر رفع الملف — تحقق من الاتصال وحاول مجدداً.";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewConsultationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const subscription = useSubscription();
  const user = useUser();
  const { catalog, source: pricingSource } = useClientPricingCatalog();
  const payments = usePaymentsStatus();
  const isDark = theme === "dark";
  const [selectedLawyer, setSelectedLawyer] = useState<LawyerProfile | null>(null);
  const urlLawyerId = searchParams.get("lawyer");
  const modeConfig = useMemo(() => (
    Object.fromEntries(
      (Object.entries(MODE_COPY) as [LawyerMode, typeof MODE_COPY[LawyerMode]][]).map(([key, cfg]) => [
        key,
        {
          ...cfg,
          price: getClientServiceById(cfg.serviceId, catalog).basePrice,
        },
      ]),
    ) as Record<LawyerMode, typeof MODE_COPY[LawyerMode] & { price: number }>
  ), [catalog]);
  const aiConsultPrice = getClientServiceById("ai-consult", catalog).basePrice;
  const writtenOpinionPrice = getClientServiceById("written-opinion", catalog).basePrice;

  const [step, setStep] = useState(1);
  const [path, setPath] = useState<ConsultPath | null>(null);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "urgent" | "critical">("normal");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [mode, setMode] = useState<LawyerMode>("video");
  const [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  // ── Attachment outcome, decided during submit and read by the confirmation
  // screen. These two are what stop that screen from claiming a complete
  // submission when part of it never arrived.
  const [attachFailures, setAttachFailures] = useState<AttachFailure[]>([]);
  const [skippedNames, setSkippedNames] = useState<string[]>([]);
  // ── Submit state. The confirm button used to stay live for the whole
  // request + upload sequence, which since the 60s upload ceiling landed can
  // be a full minute per file with nothing on screen: a second click would
  // have minted a second workflow id, a second payment intent and a second
  // request.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Resolve the selected lawyer from the real DB when a lawyer id is in the URL ──
  useEffect(() => {
    if (!urlLawyerId) {
      setSelectedLawyer(null);
      return;
    }
    let cancelled = false;
    getLawyerById(urlLawyerId).then((lawyer) => {
      if (cancelled) return;
      setSelectedLawyer(lawyer);
      if (lawyer) setSpecialty(lawyer.specialty);
    });
    return () => { cancelled = true; };
  }, [urlLawyerId]);

  // ── Pre-fill from URL context (e.g. coming from Services or AI assistant) ──
  useEffect(() => {
    const urlSpecialty = searchParams.get("specialty");
    const urlQ         = searchParams.get("q");
    const urlPath      = searchParams.get("path") as ConsultPath | null;
    const urlType      = searchParams.get("type"); // e.g. video-short, in-person, written-opinion
    const urlLawyer    = searchParams.get("lawyer");

    if (urlType === "contract-review") {
      router.replace("/dashboard/client/requests/new?type=contract-review");
      return;
    }

    if (urlSpecialty) setSpecialty(urlSpecialty);
    if (urlQ)         setAiQuestion(urlQ);
    if (urlLawyer) {
      // Lawyer details + specialty are resolved by the dedicated effect above.
      setPath("lawyer");
      setMode("video");
      setStep(2);
      return;
    }

    if (urlType) {
      // Coming from Services page (already chose human service)
      setPath("lawyer");
      if (urlType.includes("video")) setMode("video");
      else if (urlType.includes("in-person")) setMode("in-person");
      else if (urlType.includes("written") || urlType.includes("text")) setMode("text");
      setStep(2);
    } else if (urlPath) {
      setPath(urlPath);
      setStep(2);
    }
  }, [router, searchParams]);

  const activeTopic = path === "ai" ? aiQuestion : topic;
  const canGoStep3 = specialty !== null && activeTopic.trim().length > 5;
  const serviceId = path === "ai" ? "ai-consult" : getConsultationModeServiceId(mode);
  const service = getClientServiceById(serviceId, catalog);
  // `requiresPayment`, not the raw basePrice — the same rule quoteClientService()
  // applies in pricingRepository.ts and the requests wizard applies at
  // requests/new/page.tsx. Reading basePrice raw priced the free daily AI
  // question at ٤٩, which made needsPayment true and left the only free service
  // on the platform permanently stuck behind the disabled payment gate.
  const total = service.requiresPayment ? service.basePrice : 0;
  const consultationLimit = subscription.tierRank >= 3 ? 5 : subscription.tierRank >= 2 ? 1 : 0;
  // TODO: derive consultationsUsed from a real consultations-count endpoint
  // (count of the user's consultation workflow requests). 0 is the honest
  // default until that endpoint exists — it does not fake a number.
  const consultationsUsed = 0;
  // A service the catalog marks free carries its own allowance and is covered
  // whatever the tier is; a paid one is covered only while the tier's
  // consultation allowance lasts. The old `path === "lawyer" &&` guard sent
  // every AI consultation down the «باقتك لا تشمل استشارات» branch even when it
  // costs nothing.
  //
  // The allowance is a value and not a boolean because PlanBadge re-checks
  // `used < limit` itself before it shows the covered branch: handing it the
  // same expression this page decides on is what stops the two from disagreeing
  // and dropping a free consultation into the «٠ ر.س» blue banner.
  const includedAllowance = service.requiresPayment ? consultationLimit : 1;
  const consultationIncluded = consultationsUsed < includedAllowance;
  const payableTotal = consultationIncluded ? 0 : total;
  // Payment gate: when the admin has disabled the gateway, block paid submissions.
  const needsPayment = payableTotal > 0;
  const paymentsBlocked = !payments.loading && payments.disabled && needsPayment;
  // Step 1 has no type selected, so it can only name a floor: the cheapest
  // amount this wizard is able to bill. That is the cheapest session mode —
  // the AI path is free by catalog rule and bills ٠, so folding its ٤٩ in here
  // would quote a figure no order on this page ever charges. Derived from the
  // modes rather than pinned to written-opinion, so an admin catalog that
  // reprices a mode moves the floor with it.
  const lowestConsultationPrice = Math.min(
    ...Object.values(modeConfig).map((cfg) => cfg.price),
  );

  const confirmConsultation = async () => {
    if (!path) return;
    if (paymentsBlocked) return; // do not create a request when payments are disabled
    if (submitting) return;      // one click, one request — see `submitting` above
    setSubmitting(true);
    setSubmitError("");
    setAttachFailures([]);
    setSkippedNames([]);
    try {
      const newRequestId = createWorkflowId(path === "ai" ? "AIC" : "CON");
      const paymentIntent = await createPaymentIntentStub({
        amount: payableTotal,
        requestId: newRequestId,
        serviceId,
      });
      const request = await createWorkflowRequest({
        id: newRequestId,
        type: "consultation",
        title: path === "ai"
          ? `استشارة AI - ${specialty}`
          : selectedLawyer
            ? `حجز استشارة مع ${selectedLawyer.name}`
            : `حجز استشارة — ${specialty}`,
        description: activeTopic,
        requester: {
          userId: user.userId,
          name: user.name,
          role: user.userType,
          tier: user.tier,
          businessRole: user.businessRole,
        },
        // ALWAYS "ai_workspace" — the same literal the client request form was
        // corrected to, and for the same reason. This is the ONE value the
        // fulfilment queue filters on
        // (src/app/api/v1/admin/service-orders/route.ts:54,
        //  `.eq("receiver", "ai_workspace")`). The old ternary sent every
        // lawyer-path booking — the paid ones: «استشارة مرئية», «استشارة
        // حضورية», «رأي قانوني مكتوب» — to `receiver: "lawyer"`, a value
        // NOTHING in this codebase reads. Those bookings were written to the
        // database and no human was ever shown them.
        //
        // The name is about WHERE the work is triaged, not about who does it:
        // during the single-office beta one team picks up every order and a
        // scheduled video call is picked up the same way a drafted contract
        // is. `metadata.mode` and `metadata.path` still carry what kind of
        // consultation it is, and the admin card reads them.
        receiver: "ai_workspace",
        // Driven by what is actually owed, the same way requests/new/page.tsx
        // decides it. Keyed off the path, a free AI question was born
        // «بانتظار الدفع» priced ٤٩ — a charge it never owed, and one the
        // client could not clear while the gateway is off.
        status: payableTotal > 0 ? "pending_payment" : "pending_assignment",
        payment: {
          amount: payableTotal,
          status: service.requiresPayment
            ? (payableTotal > 0 ? "pending" : "included")
            : "not_required",
        },
        sourcePath: "/dashboard/client/consultation/new",
        metadata: {
          path,
          specialty,
          mode: path === "lawyer" ? mode : "ai",
          serviceId,
          quoteSource: pricingSource,
          lawyerId: selectedLawyer?.id ?? null,
          lawyerName: selectedLawyer?.name ?? null,
          paymentIntentId: paymentIntent.id,
          paymentProvider: paymentIntent.provider,
          attachmentCount: attachments.length,
          // The fulfilment brief (buildOrderPrompt, src/lib/services/orderPrompt.ts)
          // reads `metadata.intake` and NOTHING ELSE — the flat keys above are
          // invisible to it. Before this, a booking that finally reached the
          // queue showed the team a description and an em dash: no
          // consultation type, no specialisation, no named lawyer. Every key
          // here has an Arabic label in src/lib/services/intakeValues.ts;
          // adding one without a label prints the raw English key to the team.
          intake: {
            // The three real values of `mode` are "text" | "voice" |
            // "in-person" (ConsultMode). Written out in Arabic here rather
            // than passed through raw, because this string is read by the
            // fulfilment team off the brief.
            consultationType:
              path === "ai" ? "استشارة بالذكاء الاصطناعي"
                : mode === "in-person" ? "استشارة حضورية"
                : mode === "voice" ? "استشارة صوتية / مرئية"
                : "استشارة مكتوبة",
            specialty,
            ...(selectedLawyer?.name ? { lawyerName: selectedLawyer.name } : {}),
            subject: activeTopic,
          },
        },
        auditEvent: "client_consultation_created",
      });
      // Upload attachments AFTER the request is created. createWorkflowRequest
      // throws on API failure, so files are never uploaded against a request that
      // doesn't exist (no orphaned blobs).
      //
      // A failed upload must NOT fail the consultation: the request row and the
      // payment intent both already exist, and throwing them away over one file
      // would be the worse outcome. But it must not be invisible either — every
      // file that did not become an attachment is collected here and named on the
      // confirmation screen, which changes from a success screen into a
      // partial-success one when this list is non-empty.
      //
      // WHEN THE BATCH STOPS — the same split attachFiles() settled on in
      // useOrderAttachments.ts: a per-file error is specific to that file and the
      // rest of the selection still deserves its try, while a TIMEOUT means the
      // link is not carrying data and every remaining file would burn another
      // 60 s proving it. The argument is stronger here than in the hook: the
      // hook's batch runs while the client can still see and use the page,
      // whereas this loop runs behind a disabled submit button, so N × 60 s is a
      // frozen screen rather than a slow background upload. Indexed rather than
      // for-of so the untried tail can be named by position.
      const failures: AttachFailure[] = [];
      let skipped: string[] = [];
      for (let i = 0; i < attachments.length; i++) {
        const file = attachments[i];
        try {
          await uploadDocumentFile(file, { requestId: request.id });
        } catch (err) {
          failures.push({ name: file.name, reason: attachmentErrorAr(err) });
          if (isUploadTimeoutError(err)) {
            // Name what was never attempted. If the timeout hit the last file
            // there is no tail, and claiming there is one would put a false
            // sentence on screen.
            skipped = attachments.slice(i + 1).map((f) => f.name);
            break;
          }
        }
      }
      setAttachFailures(failures);
      setSkippedNames(skipped);
      setRequestId(request.id);
      setConfirmed(true);
    } catch (err) {
      // createPaymentIntentStub / createWorkflowRequest. Before this catch the
      // handler simply rejected and the button did nothing visible at all.
      console.error("[consultation] submit failed:", err);
      setSubmitError("تعذّر تسجيل الطلب — تحقق من اتصالك وحاول مجدداً. لم يتم خصم أي مبلغ.");
    } finally {
      setSubmitting(false);
    }
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.07] bg-zinc-900/60"
    : "rounded-2xl border border-slate-200 bg-white";

  // One const for the submit button's wording because the notice above it
  // quotes that wording back. The notice used to hardcode «تأكيد وادفع», which
  // named a button that is not on screen whenever the consultation is covered.
  const confirmLabel = consultationIncluded ? "تأكيد بدون رسوم" : "تأكيد وادفع";

  if (confirmed) {
    // The attachment outcome decides whether this is a success screen at all.
    // A warning box underneath a green tick and the word «تم» still reads as
    // "everything went through", so when anything failed to attach the mark and
    // the heading change too — that, not the box, is what stops the screen from
    // making a claim the submission did not earn.
    const notAttachedCount = attachFailures.length + skippedNames.length;
    const attachmentsIncomplete = notAttachedCount > 0;
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0d1117]" : "bg-slate-50"}`} dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`${card} p-10 max-w-md w-full mx-4 text-center`}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
            className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${
              attachmentsIncomplete
                ? "bg-amber-100 dark:bg-amber-900/40"
                : "bg-emerald-100 dark:bg-emerald-900/40"
            }`}
          >
            {attachmentsIncomplete
              ? <Warning size={40} className="text-amber-500" weight="fill" />
              : <CheckCircle size={40} className="text-emerald-500" weight="fill" />}
          </motion.div>
          <h2 className={`text-[22px] font-black mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
            {attachmentsIncomplete
              ? "تم تسجيل الطلب — لكن بعض المرفقات لم تُرفق"
              : path === "ai" ? "جاهز لتشغيل المساعد" : "تم تجهيز معاينة الحجز"}
          </h2>
          <p className={`text-[13px] mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            {path === "ai"
              ? "تم حفظ طلب الاستشارة وسيتم فتح المساعد من هنا."
              : selectedLawyer
                ? `تم تسجيل طلبك مع ${selectedLawyer.name}. سيتم تأكيد الموعد من داخل المنصة.`
                : `تم تسجيل طلبك. سيتم تعيين محام متخصص والتواصل معك لترتيب الموعد.`
            }
          </p>
          {/* Deliberately outside the `path === "lawyer"` gate below: an AI
              client is one click away from /ai/consult without the documents
              they attached, and needs to know just as much. */}
          {attachmentsIncomplete && (
            <div className={`mt-4 mb-1 p-3.5 rounded-xl text-right text-[11px] leading-relaxed ${
              isDark
                ? "bg-amber-900/20 border border-amber-700/30 text-amber-300"
                : "bg-amber-50 border border-amber-200 text-amber-800"
            }`}>
              {/* A single attachment gets its own sentence: "١ من أصل ١" is not
                  Arabic anyone writes. Digits are ar-SA (٢/٣), matching the
                  prices elsewhere on this wizard. */}
              <p className="font-bold mb-2">
                {attachments.length === 1
                  ? "لم يُرفق الملف التالي بهذا الطلب:"
                  : `لم تُرفق ${notAttachedCount.toLocaleString("ar-SA")} من أصل ${attachments.length.toLocaleString("ar-SA")} من الملفات بهذا الطلب:`}
              </p>
              {/* Keyed by position, not by name: two selected files may carry the
                  same filename, and the list never reorders after submit. */}
              <ul className="space-y-1.5 mb-2.5">
                {attachFailures.map((f, i) => (
                  <li key={`f-${i}`} className="flex items-start gap-1.5">
                    <span className="mt-[6px] w-1 h-1 rounded-full bg-current flex-shrink-0" />
                    <span><strong className="font-bold break-all">{f.name}</strong> — {f.reason}</span>
                  </li>
                ))}
                {/* Only ever non-empty after a timeout ended the batch early. */}
                {skippedNames.map((name, i) => (
                  <li key={`s-${i}`} className="flex items-start gap-1.5">
                    <span className="mt-[6px] w-1 h-1 rounded-full bg-current flex-shrink-0" />
                    <span><strong className="font-bold break-all">{name}</strong> — لم تتم محاولة الرفع؛ توقّف الرفع بعد انتهاء المهلة.</span>
                  </li>
                ))}
              </ul>
              {/* The timeout row above ends in «حاول مجدداً» because it is
                  UploadTimeoutError's own copy, read back verbatim. There is no
                  retry control on this screen, so the first clause here says so
                  outright rather than leaving the client hunting for one. The
                  documents page uploads with no requestId (handleFiles there
                  calls uploadDocumentFile(file) with no opts), so the last
                  clause is the truth about what that remedy does and does not
                  do — it must not promise an automatic re-attach. */}
              <p>
                الطلب نفسه مسجَّل ولم يتأثر، ولا يمكن إعادة إرفاق هذه الملفات به من هذه الصفحة. لإرسالها ارفعها من صفحة «مستنداتي»، ثم اذكر رقم الطلب <strong>{requestId}</strong> عند التواصل — الملفات المرفوعة هناك تُحفظ في حسابك ولا تُربط بهذا الطلب تلقائياً.
              </p>
              <Link
                href="/dashboard/client/documents"
                className={`mt-2.5 inline-flex items-center gap-1.5 font-bold underline underline-offset-2 ${isDark ? "text-amber-200 hover:text-amber-100" : "text-amber-900 hover:text-amber-950"}`}
              >
                <Paperclip size={12} />
                رفع الملفات من «مستنداتي»
              </Link>
            </div>
          )}
          {path === "lawyer" && (
            <div className={`mt-4 mb-5 p-3 rounded-xl text-[11px] flex items-start gap-2 ${isDark ? "bg-amber-900/20 border border-amber-700/20 text-amber-400" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
              <Info size={13} className="flex-shrink-0 mt-0.5" />
              <span>رقم الطلب <strong>{requestId}</strong>. يظهر الآن في طلباتك ولوحة المحامي كطلب وارد.</span>
            </div>
          )}
          {path === "ai" && requestId && (
            <p className={`mb-5 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>رقم الطلب: {requestId}</p>
          )}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                if (path === "ai") router.push("/ai/consult");
                else router.push("/dashboard/client/consultation");
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#0B3D2E] text-white rounded-xl font-bold text-[14px] hover:bg-[#0d4d39] transition-colors"
            >
              <Sparkle size={15} weight="fill" />
              {path === "ai" ? "ابدأ الاستشارة" : "متابعة"}
            </button>
            <Link
              href="/dashboard/client"
              className={`text-[12px] text-center font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"} transition-colors`}
            >
              العودة للوحة التحكم
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDark ? "bg-[#0d1117] text-white" : "bg-slate-50 text-zinc-900"}`}
      dir="rtl"
    >
      {/* Breadcrumb */}
      <div className={`sticky top-0 z-40 border-b px-6 py-3 flex items-center gap-2 text-[12px] backdrop-blur-xl ${isDark ? "bg-[#0d1117]/80 border-white/[0.06] text-zinc-400" : "bg-white/80 border-slate-100 text-slate-500"}`}>
        <Link href="/dashboard/client" className="hover:underline">لوحة التحكم</Link>
        <ArrowRight size={11} />
        <Link href="/dashboard/client/consultation" className="hover:underline">استشاراتي</Link>
        <ArrowRight size={11} />
        <span className={isDark ? "text-white" : "text-zinc-800"}>استشارة جديدة</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className={`text-[22px] font-black mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>
            استشارة جديدة
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            استشارة فورية مع نظامي AI أو موعد مع محامٍ متخصص
          </p>
        </div>

        {/* Step bar */}
        <StepBar step={step} />

        <AnimatePresence mode="wait">

          {/* ── Step 1: Type ── */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {/* The floor, not a price — no type is chosen yet. Same ٢٥٠ as
                  before while written-opinion happens to be the cheapest mode,
                  but read off the catalog instead of hardcoded, and it now
                  matches the «من ٢٥٠» on the lawyer card below. */}
              <PlanBadge
                isDark={isDark}
                included={consultationIncluded}
                used={consultationsUsed}
                limit={includedAllowance}
                basePrice={lowestConsultationPrice}
                priceIsFrom={true}
              />

              <p className={`text-[13px] font-bold mb-4 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                كيف تريد استشارتك؟
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* AI */}
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { setPath("ai"); setStep(2); }}
                  className={`flex flex-col items-start gap-3 p-5 rounded-2xl border-2 transition-all ${
                    path === "ai"
                      ? "border-[#C8A762] bg-[#C8A762]/5"
                      : isDark ? "border-white/10 hover:border-[#C8A762]/40" : "border-gray-200 hover:border-[#C8A762]/50 hover:bg-[#C8A762]/5"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Robot size={24} weight="fill" className="text-amber-500" />
                  </div>
                  <div className="text-right w-full">
                    <p className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>نظامي AI</p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                      استشارة فورية · {aiConsultPrice.toLocaleString("ar-SA")} ر.س
                    </p>
                    <div className="flex flex-col gap-1 mt-2.5">
                      {["إجابة فورية ٢٤/٧", "استناد للأنظمة السعودية", "سرية تامة"].map(f => (
                        <span key={f} className={`flex items-center gap-1 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                          <Check size={9} weight="bold" className="text-amber-500" /> {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full font-bold">
                    متاح ٢٤/٧
                  </span>
                </motion.button>

                {/* Lawyer */}
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { setPath("lawyer"); setStep(2); }}
                  className={`flex flex-col items-start gap-3 p-5 rounded-2xl border-2 transition-all ${
                    path === "lawyer"
                      ? "border-[#0B3D2E] bg-[#0B3D2E]/5"
                      : isDark ? "border-white/10 hover:border-[#0B3D2E]/40" : "border-gray-200 hover:border-[#0B3D2E]/30 hover:bg-[#0B3D2E]/5"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <SealCheck size={24} weight="fill" className="text-emerald-600" />
                  </div>
                  <div className="text-right w-full">
                    <p className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>مع محامٍ</p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                      جلسة مجدولة · من {writtenOpinionPrice.toLocaleString("ar-SA")} ر.س
                    </p>
                    <div className="flex flex-col gap-1 mt-2.5">
                      {[
                        "محامٍ سعودي معتمد ومرخّص",
                        "اختر: مرئية · حضورية · نصية",
                        "ملخص مكتوب بعد الجلسة",
                      ].map(f => (
                        <span key={f} className={`flex items-center gap-1 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                          <Check size={9} weight="bold" className="text-emerald-500" /> {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full font-bold">
                    محامٍ معتمد
                  </span>
                </motion.button>
              </div>

              {/* Comparison note */}
              <div className={`rounded-xl p-3.5 flex items-start gap-2.5 text-[11px] ${isDark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-slate-50 border border-slate-200"}`}>
                <Info size={13} className={isDark ? "text-zinc-500 flex-shrink-0 mt-0.5" : "text-slate-400 flex-shrink-0 mt-0.5"} />
                <p className={isDark ? "text-zinc-500" : "text-slate-500"}>
                  الاستشارة مع نظامي AI <strong>لا تُعدّ رأياً قانونياً رسمياً</strong> ولا تصلح أمام المحاكم. لو الموضوع حساس أو يتعلق بنزاع قضائي — نوصي باستشارة محامٍ معتمد.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Details ── */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

              {/* ① Specialty */}
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  التخصص القانوني <span className="text-red-400">*</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {LEGAL_BRANCHES_REGULAR.map((s: string) => (
                    <motion.button
                      key={s}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSpecialty(s === specialty ? null : s)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                        specialty === s
                          ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-sm"
                          : isDark
                            ? "border-white/[0.08] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                            : "border-slate-200 text-slate-600 hover:border-[#0B3D2E]/40 hover:bg-[#0B3D2E]/5"
                      }`}
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* ② Session mode (lawyer only) */}
              {path === "lawyer" && (
                <div>
                  <p className={`text-[11px] font-black uppercase tracking-widest mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    نوع الجلسة
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.entries(modeConfig) as [LawyerMode, typeof modeConfig[LawyerMode]][]).map(([key, cfg]) => {
                      const Icon = cfg.Icon;
                      return (
                        <motion.button
                          key={key}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setMode(key)}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-[11px] font-semibold transition-all ${
                            mode === key
                              ? "bg-[#0B3D2E] text-white border-[#0B3D2E]"
                              : isDark ? "border-white/[0.08] text-zinc-400 hover:border-white/20" : "border-slate-200 text-slate-600 hover:border-[#0B3D2E]/30"
                          }`}
                        >
                          <Icon size={16} />
                          <span>{cfg.label}</span>
                          <span className={`text-[10px] font-black ${mode === key ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
                            {cfg.price} ر.س
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ③ Topic / Question */}
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {path === "ai" ? "سؤالك القانوني" : "موضوع الاستشارة"} <span className="text-red-400">*</span>
                </p>
                <textarea
                  value={path === "ai" ? aiQuestion : topic}
                  onChange={e => path === "ai" ? setAiQuestion(e.target.value) : setTopic(e.target.value)}
                  placeholder={path === "ai"
                    ? "صِف مشكلتك بالتفصيل... مثال: فُصلت دون إشعار بعد ٥ سنوات خدمة، ما حقوقي؟"
                    : "صِف موضوع الاستشارة بوضوح... مثال: نزاع مع المؤجر حول شروط تجديد عقد الإيجار التجاري"}
                  rows={4}
                  className={`w-full rounded-xl border px-4 py-3 text-[13px] outline-none resize-none leading-relaxed transition-colors ${
                    isDark
                      ? "border-white/[0.08] bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-700/50"
                      : "border-slate-200 bg-slate-50/80 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40 focus:bg-white"
                  }`}
                />
                <p className={`text-[10px] mt-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  كلما كانت التفاصيل أدق، كانت الاستشارة أكثر دقةً وفائدةً.
                </p>
              </div>

              {/* ④ Urgency */}
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  درجة الأولوية
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "normal",   label: "عادية",    Icon: Clock,      color: isDark ? "text-zinc-400" : "text-slate-500" },
                    { key: "urgent",   label: "عاجلة",    Icon: Lightning,  color: "text-amber-500" },
                    { key: "critical", label: "حرجة جداً", Icon: Warning,    color: "text-red-500" },
                  ] as const).map(({ key, label, Icon, color }) => (
                    <motion.button
                      key={key}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setUrgency(key)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[12px] font-semibold transition-all ${
                        urgency === key
                          ? key === "critical" ? "bg-red-500/10 border-red-400 text-red-500"
                            : key === "urgent" ? "bg-amber-500/10 border-amber-400 text-amber-600"
                            : "bg-[#0B3D2E]/10 border-[#0B3D2E]/50 text-[#0B3D2E] dark:text-emerald-400"
                          : isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-500"
                      }`}
                    >
                      <Icon size={13} className={urgency === key ? "" : color} />
                      {label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* ⑤ Attachments */}
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  المرفقات <span className={`normal-case font-normal ${isDark ? "text-zinc-600" : "text-slate-400"}`}>(اختياري)</span>
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    setAttachments(prev => [...prev, ...files].slice(0, 10));
                    e.target.value = "";
                  }}
                />
                {attachments.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {attachments.map((f, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] ${
                          isDark ? "bg-white/[0.04] border border-white/[0.06]" : "bg-slate-50 border border-slate-200"
                        }`}
                      >
                        <FileText size={13} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                        <span className={`flex-1 truncate font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{f.name}</span>
                        <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          {(f.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <button
                          onClick={() => setAttachments(a => a.filter((_, j) => j !== i))}
                          className={`p-0.5 rounded transition-colors ${isDark ? "hover:text-red-400 text-zinc-600" : "hover:text-red-500 text-slate-400"}`}
                        >
                          <X size={12} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-[12px] font-semibold transition-all ${
                    isDark
                      ? "border-white/[0.1] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                      : "border-slate-300 text-slate-500 hover:border-[#0B3D2E]/40 hover:text-[#0B3D2E]"
                  }`}
                >
                  <Paperclip size={14} />
                  إضافة مستندات أو صور
                  <span className={`text-[10px] font-normal ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    (PDF, Word, صور — حتى ١٠ ملفات)
                  </span>
                </button>
              </div>

              {/* Beta notice (lawyer only) */}
              {path === "lawyer" && IS_BETA && !selectedLawyer && (
                <div className={`flex items-start gap-2.5 p-4 rounded-xl border ${isDark ? "bg-amber-900/10 border-amber-900/30" : "bg-amber-50 border-amber-200"}`}>
                  <Info size={15} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-amber-500" : "text-amber-600"}`} weight="fill" />
                  <div>
                    <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-amber-400" : "text-amber-800"}`}>مرحلة البيتا</p>
                    <p className={`text-[11px] leading-relaxed ${isDark ? "text-amber-300/70" : "text-amber-700"}`}>
                      تقوم المنصة بتعيين أفضل محام متخصص تلقائيا. سيتواصل معك لتأكيد الموعد.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-1">
                <button
                  onClick={() => setStep(1)}
                  className={`flex items-center gap-1.5 text-[12px] px-4 py-2 rounded-xl border font-semibold transition-colors ${isDark ? "border-white/10 text-zinc-400 hover:text-zinc-200" : "border-gray-200 text-gray-500 hover:text-gray-700"}`}
                >
                  <ArrowRight size={13} /> رجوع
                </button>
                <motion.button
                  whileHover={{ scale: canGoStep3 ? 1.02 : 1 }}
                  onClick={() => canGoStep3 && setStep(3)}
                  disabled={!canGoStep3}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-[#0B3D2E] text-white text-[13px] font-bold rounded-xl hover:bg-[#0d4d39] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-[#0B3D2E]/20"
                >
                  مراجعة وتأكيد <ArrowLeft size={13} />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Review + Payment ── */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>

              {/* The type is chosen by now, so the badge and «الإجمالي» below it
                  have to quote the one same figure. */}
              <PlanBadge
                isDark={isDark}
                included={consultationIncluded}
                used={consultationsUsed}
                limit={includedAllowance}
                basePrice={total}
              />

              {/* Summary card */}
              <div className={`${isDark ? "border-white/[0.07] bg-zinc-900/60" : "border-slate-200 bg-white"} rounded-2xl border p-5 mb-5`}>
                <p className={`text-[11px] font-black uppercase tracking-wider mb-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  ملخص الاستشارة
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>النوع</span>
                    <span className={`text-[13px] font-bold text-right ${isDark ? "text-white" : "text-zinc-900"}`}>
                      {path === "ai" ? "نظامي AI — فورية" : `مع محام — ${mode === "video" ? "مرئية" : mode === "in-person" ? "حضورية" : mode === "voice" ? "صوتية" : "نصية"}`}
                    </span>
                  </div>
                  {specialty && (
                    <div className="flex justify-between">
                      <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>التخصص</span>
                      <span className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{specialty}</span>
                    </div>
                  )}
                  {path === "lawyer" && (IS_BETA || selectedLawyer) && (
                    <div className="flex justify-between">
                      <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المحامي والموعد</span>
                      <span className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                        {selectedLawyer ? selectedLawyer.name : "يحدد من قبل المنصة"}
                      </span>
                    </div>
                  )}
                  {path === "ai" && aiQuestion && (
                    <div className="flex justify-between items-start gap-3">
                      <span className={`text-[12px] flex-shrink-0 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>سؤالك</span>
                      <span className={`text-[12px] text-right line-clamp-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{aiQuestion}</span>
                    </div>
                  )}
                  <div className={`flex justify-between items-center pt-3 border-t ${isDark ? "border-white/[0.07]" : "border-gray-100"}`}>
                    <span className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>الإجمالي</span>
                    <span className="text-[18px] font-black text-[#C8A762]">{total} ر.س</span>
                  </div>
                </div>
              </div>

              {/* Pending / payment-disabled notice */}
              {paymentsBlocked ? (
                <div className={`rounded-xl p-3.5 flex items-start gap-2.5 mb-5 text-[11px] ${isDark ? "bg-red-900/15 border border-red-700/25" : "bg-red-50 border border-red-200"}`}>
                  <Warning size={13} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-red-400" : "text-red-600"}`} weight="fill" />
                  <p className={isDark ? "text-red-300/80" : "text-red-700"}>
                    الدفع غير متاح حالياً — سيتم تفعيل بوابة الدفع قريباً. لا يمكن إتمام الطلب المدفوع حتى التفعيل.
                  </p>
                </div>
              ) : (
                <div className={`rounded-xl p-3.5 flex items-start gap-2.5 mb-5 text-[11px] ${isDark ? "bg-amber-900/15 border border-amber-700/20" : "bg-amber-50 border border-amber-200"}`}>
                  <Warning size={13} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-amber-600"}`} weight="fill" />
                  <p className={isDark ? "text-amber-300/80" : "text-amber-700"}>
                    بعد الضغط على «{confirmLabel}» يُسجَّل طلبك لدى المكتب ويصل فريق نظامي فوراً. لا يُخصم أي مبلغ في هذه الخطوة.
                  </p>
                </div>
              )}

              {/* The submit can now take a minute per attachment (the 60s upload
                  ceiling in documentService.ts), so say so instead of leaving a
                  still screen. It names both stages because `submitting` flips
                  before createWorkflowRequest, which has no ceiling of its own:
                  saying only «جارٍ رفع المرفقات» would be a false sentence for
                  as long as that call is the one running. */}
              {submitting && attachments.length > 0 && (
                <div className={`rounded-xl p-3.5 flex items-start gap-2.5 mb-5 text-[11px] ${isDark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-slate-50 border border-slate-200"}`}>
                  <Paperclip size={13} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`} />
                  <p className={isDark ? "text-zinc-400" : "text-slate-600"}>
                    جارٍ تسجيل الطلب ورفع المرفقات… قد يستغرق كل ملف حتى دقيقة على اتصال بطيء. لا تغلق الصفحة.
                  </p>
                </div>
              )}

              {submitError && (
                <div className={`rounded-xl p-3.5 flex items-start gap-2.5 mb-5 text-[11px] ${isDark ? "bg-red-900/15 border border-red-700/25" : "bg-red-50 border border-red-200"}`}>
                  <Warning size={13} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-red-400" : "text-red-600"}`} weight="fill" />
                  <p className={isDark ? "text-red-300/80" : "text-red-700"}>{submitError}</p>
                </div>
              )}

              <div className="flex justify-between">
                <button
                  // Clear the failure banner on the way out, so returning to
                  // this step does not show a message about an attempt the
                  // client has since changed.
                  onClick={() => { setSubmitError(""); setStep(2); }}
                  disabled={submitting}
                  className={`flex items-center gap-1.5 text-[12px] px-4 py-2 rounded-xl border font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-white/10 text-zinc-400" : "border-gray-200 text-gray-500"}`}
                >
                  <ArrowRight size={13} /> رجوع
                </button>
                <motion.button
                  whileHover={{ scale: !paymentsBlocked && !submitting ? 1.02 : 1 }} whileTap={{ scale: !paymentsBlocked && !submitting ? 0.98 : 1 }}
                  onClick={confirmConsultation}
                  disabled={paymentsBlocked || submitting}
                  className={`flex items-center gap-2 px-6 py-3 text-white text-[13px] font-black rounded-xl transition-colors shadow-lg shadow-[#0B3D2E]/20 ${
                    paymentsBlocked || submitting
                      ? "bg-zinc-400/60 cursor-not-allowed shadow-none"
                      : "bg-[#0B3D2E] hover:bg-[#0d4d39]"
                  }`}
                >
                  <CreditCard size={15} />
                  {submitting ? "جارٍ إرسال الطلب…" : confirmLabel}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
