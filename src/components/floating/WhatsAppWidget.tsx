"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
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
import type { ServiceItem } from "./constants/floatingServices";
import { getFloatingActorContext, type FloatingActorContext } from "./roleContext";

// ─── Step components ──────────────────────────────────────────────────────────
import WaHeader from "./wa-steps/WaHeader";
import { StepDots } from "./wa-steps/WaShared";
import StepUserType from "./wa-steps/StepUserType";
import StepServiceSelect from "./wa-steps/StepServiceSelect";
import StepConsult from "./wa-steps/StepConsult";
import StepContract from "./wa-steps/StepContract";
import StepRepresentation from "./wa-steps/StepRepresentation";
import StepNotary from "./wa-steps/StepNotary";
import StepPayment from "./wa-steps/StepPayment";
import StepAiChat from "./wa-steps/StepAiChat";
import { StepSuccess, StepCustomerService } from "./wa-steps/StepSuccessAndService";

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

  const handlePaymentComplete = (paymentMethod: string) => {
    const receipt = createWhatsAppWorkflow({
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
    });
    setWorkflowReceipt(receipt);
  };

  const handleQuickRequest = (service: ServiceItem) => {
    if (!service.quickRequest) return;
    const receipt = createQuickWhatsAppWorkflow({
      quickRequest: service.quickRequest,
      user,
      userCategory,
      sourcePath,
      serviceKey: service.key,
      serviceLabel: service.label,
    });
    setWorkflowReceipt(receipt);
    goTo("success");
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
      return <StepSuccess isDark={isDark} onClose={closeAll} workflow={workflowReceipt} />;
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
            stepHeader={step === "user-type" && isLoggedIn ? (user?.name ? `أهلاً بك، ${user.name.split(" ")[0]}` : "أهلاً بك") : getStepHeader()}
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
