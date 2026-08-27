"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { CheckCircle, CircleNotch, WarningCircle, WhatsappLogo } from "@phosphor-icons/react";
import { useTheme } from "../ThemeProvider";
import type { UserCategory } from "./types";
import { useWhatsAppFlow } from "./hooks/useWhatsAppFlow";
import { useUser } from "@/hooks/useUser";
import {
  buildSupportWhatsAppHref,
  createQuickWhatsAppWorkflow,
  createWhatsAppWorkflow,
  type WhatsAppWorkflowReceipt,
} from "./whatsappWorkflow";
import {
  outcomeScreenCopyAr,
  type WhatsAppOutcome,
} from "@/lib/services/whatsappRequestMessage";
import type { ServiceItem } from "./constants/floatingServices";
import { getFloatingActorContext } from "./roleContext";

// ─── Step components ──────────────────────────────────────────────────────────
import WaHeader from "./wa-steps/WaHeader";
import { StepDots, staggerListVariants, staggerItemVariants } from "./wa-steps/WaShared";
import StepUserType from "./wa-steps/StepUserType";
import StepServiceSelect from "./wa-steps/StepServiceSelect";
import StepConsult from "./wa-steps/StepConsult";
import StepContract from "./wa-steps/StepContract";
import StepRepresentation from "./wa-steps/StepRepresentation";
import StepNotary from "./wa-steps/StepNotary";
import StepPayment from "./wa-steps/StepPayment";
import StepAiChat from "./wa-steps/StepAiChat";
// StepSuccess is deliberately NOT imported from ./wa-steps/StepSuccessAndService
// any more — see WaOutcomeStep below. StepCustomerService still is.
import { StepCustomerService } from "./wa-steps/StepSuccessAndService";

/**
 * The final step, rendered here rather than by
 * ./wa-steps/StepSuccessAndService.tsx's `StepSuccess`.
 *
 * That component hard-coded two sentences — «تم تسجيل الطلب محلياً حسب نوع
 * حسابك ودورك، وهو جاهز للربط بالباك إند» and «لا يوجد إرسال تلقائي الآن» —
 * and, worse, printed `workflow?.id ?? "WA-DEMO"` as «رقم الطلب». So a visitor
 * whose request was never created still walked away with a reference to quote
 * at the office. None of that could be fixed from the receipt object, because
 * all of it is inside a file this change does not own; it is replaced here
 * instead, and reported for deletion.
 *
 * Everything this renders comes from `outcomeScreenCopyAr`, which is pure and
 * under test — the four outcomes and their exact Arabic are asserted in
 * src/lib/services/whatsappRequestMessage.test.ts rather than eyeballed.
 *
 * DARK MODE: `text-gray-300` and `zinc-*` only. src/app/globals.css redefines
 * --color-gray-50/100/200 as dark SURFACES, so `dark:text-gray-100` is
 * invisible text on this panel.
 */
function WaOutcomeStep({
  isDark,
  outcome,
  href,
  onClose,
}: {
  isDark: boolean;
  outcome: WhatsAppOutcome;
  href: string | null;
  onClose: () => void;
}) {
  const copy = outcomeScreenCopyAr(outcome);

  const icon =
    copy.tone === "success" ? <CheckCircle size={36} weight="fill" className="text-[#0B3D2E] dark:text-emerald-400" />
    : copy.tone === "warning" ? <WarningCircle size={36} weight="fill" className="text-amber-600 dark:text-amber-400" />
    : copy.tone === "pending" ? <CircleNotch size={32} weight="bold" className="text-[#0B3D2E] dark:text-emerald-400 animate-spin" />
    : <WhatsappLogo size={36} weight="fill" className="text-[#25D366]" />;

  const halo =
    copy.tone === "warning"
      ? "bg-amber-100 dark:bg-amber-900/30"
      : "bg-emerald-100 dark:bg-emerald-900/30";

  return (
    <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col items-center gap-4 py-2 text-center relative">
      <motion.div
        variants={staggerItemVariants}
        className={`w-16 h-16 rounded-full flex items-center justify-center ${halo}`}
      >
        {icon}
      </motion.div>

      <motion.p variants={staggerItemVariants} className={`text-[15px] font-black ${isDark ? "text-white" : "text-gray-900"}`}>
        {copy.headline}
      </motion.p>

      {/* Only ever rendered when the server returned a row that owns this id. */}
      {copy.reference && (
        <motion.p variants={staggerItemVariants} className={`text-[13px] font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
          رقم الطلب:{" "}
          <span className="font-mono text-[#C8A762] ms-1 bg-[#C8A762]/10 px-2 py-0.5 rounded-md">{copy.reference}</span>
        </motion.p>
      )}

      <motion.div
        variants={staggerItemVariants}
        className={`w-full rounded-[1.25rem] border px-4 py-3.5 text-[12px] space-y-2 text-start font-medium leading-relaxed ${isDark ? "border-white/10 bg-white/[0.02]" : "border-gray-200/70 bg-gray-50/50"}`}
      >
        {copy.lines.map(line => (
          <p key={line} className={isDark ? "text-gray-300" : "text-gray-700"}>{line}</p>
        ))}
      </motion.div>

      {/* An anchor, never a scripted window.open from an async continuation:
          a popup opened after an await is blocked by every browser, and this
          link is the part of the widget that has always genuinely worked. */}
      {copy.showWhatsAppLink && href && (
        <motion.a
          variants={staggerItemVariants}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[1.25rem] bg-[#25D366] text-white text-[13px] font-bold hover:bg-[#1ebe5d] active:scale-[0.98] transition-all shadow-lg shadow-[#25D366]/20"
          aria-label="إرسال تفاصيل الطلب عبر واتساب"
        >
          <WhatsappLogo size={20} weight="fill" /> إرسال التفاصيل عبر واتساب
        </motion.a>
      )}

      <motion.button
        variants={staggerItemVariants}
        onClick={onClose}
        disabled={copy.tone === "pending"}
        className={`w-full py-3.5 rounded-[1.25rem] border-2 text-[13px] font-bold active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-white/10 text-white hover:bg-white/5" : "border-gray-200/70 text-gray-800 hover:bg-gray-50"}`}
      >
        إغلاق
      </motion.button>
    </motion.div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WhatsAppWidgetProps {
  open: boolean;
  onClose: () => void;
  bottomPos: string;
  panelSide: string;
  onUserTypeSelected?: (type: UserCategory) => void;
  isLoggedIn?: boolean;
  userCategory?: UserCategory;
}

// ─── Main Component (Shell) ──────────────────────────────────────────────────

export default function WhatsAppWidget({
  open, onClose, bottomPos, panelSide, onUserTypeSelected,
  isLoggedIn = false, userCategory = null,
}: WhatsAppWidgetProps) {
  const { lang, theme } = useTheme();
  const isRTL = lang === "ar";
  const isDark = theme === "dark";
  const user = useUser();
  const sourcePath = usePathname() ?? "/";
  const [workflowReceipt, setWorkflowReceipt] = useState<WhatsAppWorkflowReceipt | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * Re-entry guard for the submit.
   *
   * `isSubmitting` drives the UI; this ref decides. StepPayment renders four
   * live payment buttons (StepPayment.tsx:99-119) and each one calls
   * `onPaymentComplete` then `onNavigate("success")` synchronously — a second
   * click landing before React has re-rendered would start a second POST and
   * create a duplicate row in the office's queue. State is too late for that;
   * a ref is not.
   */
  const submitInFlight = useRef(false);

  const flow = useWhatsAppFlow(onClose);
  const {
    step, history, selections,
    detailsTitle, detailsDesc, contractNotes, repDetails,
    calDay, calSlot,
    showBack, getStepDots, getStepHeader,
    goTo, goBack, closeAll, select,
    setDetailsTitle, setDetailsDesc, setContractNotes, setRepDetails,
    setCalDay, setCalSlot,
  } = flow;

  const dots = getStepDots();
  const supportWhatsAppHref = buildSupportWhatsAppHref({ user, userCategory, sourcePath });

  /**
   * What the success step is allowed to say.
   *
   * The third branch is not defensive padding: `goBack` can walk back into the
   * success step's history, and a re-render with neither a receipt nor a
   * request in flight means no row exists. Saying so is the honest reading —
   * the alternative, a spinner that never resolves, would be a lie about work
   * that is not happening.
   */
  const successOutcome: WhatsAppOutcome =
    workflowReceipt?.outcome
    ?? (isSubmitting ? { kind: "pending" } : { kind: "whatsapp_only", reason: "not_recorded" });

  /**
   * Run one submit, exactly once, and keep the success screen honest while it
   * is in flight.
   *
   * Both creators are async now because creating the request is a real network
   * call. They never throw — every failure comes back as a `whatsapp_only`
   * outcome carrying a usable wa.me link — so there is no catch that could
   * leave the panel stuck on «جارٍ الإرسال».
   */
  const runSubmit = async (submit: () => Promise<WhatsAppWorkflowReceipt>) => {
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setWorkflowReceipt(null);
    setIsSubmitting(true);
    try {
      setWorkflowReceipt(await submit());
    } finally {
      setIsSubmitting(false);
      submitInFlight.current = false;
    }
  };

  const handlePaymentComplete = (paymentMethod: string) => {
    // Not awaited: StepPayment navigates to the success step in the same click
    // handler, and that step renders the pending state until this settles.
    void runSubmit(() =>
      createWhatsAppWorkflow({
        history,
        selections,
        detailsTitle,
        detailsDesc,
        contractNotes,
        repDetails,
        calDay,
        calSlot,
        paymentMethod,
        user,
        userCategory,
        sourcePath,
      }),
    );
  };

  const handleQuickRequest = (service: ServiceItem) => {
    const quickRequest = service.quickRequest;
    if (!quickRequest) return;
    goTo("success");
    void runSubmit(() =>
      createQuickWhatsAppWorkflow({
        quickRequest,
        user,
        userCategory,
        sourcePath,
        serviceKey: service.key,
        serviceLabel: service.label,
      }),
    );
  };

  const slideVariants = {
    initial: { x: isRTL ? -30 : 30, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit:    { x: isRTL ? 30 : -30, opacity: 0 },
  };
  const slideTransition = { duration: 0.22, ease: "easeInOut" as const };

  // ── Render the correct step ─────────────────────────────────────────────────
  const renderStep = () => {
    const effectiveUserCategory = userCategory || (selections.userType as UserCategory) || null;
    const actorContext = getFloatingActorContext(user, effectiveUserCategory as UserCategory);
    const CONSULT_STEPS = new Set([
      "consult-timing", "consult-instant-modality", "consult-instant-provider",
      "consult-details", "consult-next-details", "consult-specific-details",
      "consult-next-modality", "consult-specific-modality", "consult-calendar",
    ]);
    const CONTRACT_STEPS = new Set(["contract-type", "contract-service", "contract-details"]);
    const REPRESENTATION_STEPS = new Set([
      "representation-sub", "representation-specialty", "representation-city",
      "representation-role", "representation-stage", "representation-details",
    ]);
    const NOTARY_STEPS = new Set(["notary-type", "notary-location", "notary-urgency"]);
    const PAYMENT_STEPS = new Set(["payment-summary", "payment-method"]);

    // Logged-in users skip user-type selection — go straight to their service list
    if (step === "user-type" && isLoggedIn) {
      return (
        <StepServiceSelect
          isDark={isDark} isRTL={isRTL}
          onNavigate={goTo}
          onSelect={select}
          onClose={closeAll}
          user={user}
          userCategory={userCategory}
          onQuickRequest={handleQuickRequest}
        />
      );
    }

    if (step === "user-type") {
      return (
        <StepUserType
          isDark={isDark}
          isRTL={isRTL}
          onSelect={(type, next) => {
            select("userType", type);
            onUserTypeSelected?.(type);
            goTo(next);
          }}
        />
      );
    }

    if (step === "service-select") {
      return (
        <StepServiceSelect
          isDark={isDark}
          isRTL={isRTL}
          onNavigate={goTo}
          onSelect={select}
          onClose={closeAll}
          user={user}
          userCategory={userCategory}
          onQuickRequest={handleQuickRequest}
        />
      );
    }

    if (CONSULT_STEPS.has(step)) {
      return (
        <StepConsult
          step={step} isDark={isDark} isRTL={isRTL} selections={selections}
          detailsTitle={detailsTitle} detailsDesc={detailsDesc}
          onNavigate={goTo} onSelect={select}
          setDetailsTitle={setDetailsTitle} setDetailsDesc={setDetailsDesc}
          calDay={calDay} calSlot={calSlot}
          setCalDay={setCalDay} setCalSlot={setCalSlot}
          userCategory={effectiveUserCategory}
          actorContext={actorContext}
        />
      );
    }

    if (CONTRACT_STEPS.has(step)) {
      return (
        <StepContract
          step={step} isDark={isDark} selections={selections} contractNotes={contractNotes}
          onNavigate={goTo} onSelect={select} setContractNotes={setContractNotes}
          userCategory={effectiveUserCategory}
          actorContext={actorContext}
        />
      );
    }

    if (REPRESENTATION_STEPS.has(step)) {
      return (
        <StepRepresentation
          step={step} isDark={isDark} isRTL={isRTL} selections={selections}
          repDetails={repDetails} onNavigate={goTo} onSelect={select} setRepDetails={setRepDetails}
          userCategory={effectiveUserCategory}
          actorContext={actorContext}
        />
      );
    }

    if (NOTARY_STEPS.has(step)) {
      return (
        <StepNotary
          step={step} isDark={isDark} selections={selections}
          onNavigate={goTo} onSelect={select}
          userCategory={effectiveUserCategory}
          actorContext={actorContext}
        />
      );
    }

    if (PAYMENT_STEPS.has(step)) {
      return (
        <StepPayment
          step={step} isDark={isDark} history={history} selections={selections}
          onNavigate={goTo} onSelect={select} onPaymentComplete={handlePaymentComplete}
        />
      );
    }

    if (step === "ai-chat") {
      return (
        <StepAiChat
          isDark={isDark}
          isRTL={isRTL}
          userCategory={userCategory ?? null}
          isLoggedIn={isLoggedIn}
          onClose={closeAll}
        />
      );
    }

    if (step === "success") {
      return (
        <WaOutcomeStep
          isDark={isDark}
          outcome={successOutcome}
          href={workflowReceipt?.href ?? null}
          onClose={closeAll}
        />
      );
    }

    if (step === "customer-service") {
      return (
        <StepCustomerService
          isDark={isDark}
          whatsappHref={supportWhatsAppHref}
          onReset={() => { flow.goTo("service-select"); }}
        />
      );
    }

    return null;
  };

  // ── Panel render ────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="wa-widget"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ duration: 0.22 }}
          role="dialog"
          aria-modal="true"
          aria-label="مساعد نظامي — اختر خدمتك القانونية"
          className={`fixed ${bottomPos} ${panelSide} z-[9998] w-[340px] rounded-[2rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] border overflow-hidden
            bg-white/95 dark:bg-[#09090b]/85 backdrop-blur-2xl border-white/50 dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-black/5 dark:ring-white/5`}
          dir={isRTL ? "rtl" : "ltr"}
        >
          {/* Header */}
          <WaHeader
            // The success header is taken from the outcome, not from
            // STEP_HEADERS (useWhatsAppFlow.ts:87). That map's «تم استلام
            // طلبك» claims the office has the request — untrue while the POST
            // is still in flight, and untrue for a WhatsApp-only outcome until
            // the visitor presses send.
            stepHeader={
              step === "success" ? outcomeScreenCopyAr(successOutcome).header
              : step === "user-type" && isLoggedIn ? (user?.name ? `أهلاً بك، ${user.name.split(" ")[0]}` : "أهلاً بك")
              : getStepHeader()
            }
            showBack={showBack}
            showServiceSubtitle={step === "service-select" || (step === "user-type" && isLoggedIn)}
            isRTL={isRTL}
            isDark={isDark}
            onBack={goBack}
            onClose={closeAll}
          />

          {/* Body */}
          <div className="px-5 py-4 max-h-[460px] overflow-y-auto scrollbar-hide">
            {dots && step !== "success" && step !== "customer-service" && (
              <StepDots current={dots.current} total={dots.total} />
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={slideTransition}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
