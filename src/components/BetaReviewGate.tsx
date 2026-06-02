"use client";

/**
 * BetaReviewGate — Temporary Overlay for Beta Phase
 * ──────────────────────────────────────────────────────────────
 * Wraps ANY AI output section. When BETA_REVIEW_MODE is ON:
 *   → Hides the children (the actual AI result)
 *   → Shows a professional "your request has been submitted" card
 *
 * When BETA_REVIEW_MODE is OFF (or this component is removed):
 *   → Renders children normally — ZERO side effects
 *
 * HOW TO REMOVE:
 *   Option A: Set BETA_REVIEW_MODE = false in betaConfig.ts
 *   Option B: Delete the <BetaReviewGate> wrapper tags from pages
 *   Option C: Delete this file + betaConfig.ts entirely
 *   All 3 options are safe. Nothing breaks.
 *
 * Usage:
 *   <BetaReviewGate toolName="صياغة مذكرة">
 *     <AiResultActions text={result} ... />
 *   </BetaReviewGate>
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Clock, CheckCircle,
  WhatsappLogo, Sparkle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";

// ── Safe import: if betaConfig is deleted, default to OFF ────────────────────
let BETA_REVIEW_MODE = false;
let BETA_REVIEW_HOURS = "4-24";
let BETA_GATED_ROLES: string[] = [];
let LEGAL_DATA_REVIEW_GATED_TOOL_IDS: string[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require("@/lib/betaConfig");
  BETA_REVIEW_MODE    = cfg.BETA_REVIEW_MODE    ?? false;
  BETA_REVIEW_HOURS   = cfg.BETA_REVIEW_HOURS   ?? "4-24";
  BETA_GATED_ROLES    = cfg.BETA_GATED_ROLES    ?? [];
  LEGAL_DATA_REVIEW_GATED_TOOL_IDS = cfg.LEGAL_DATA_REVIEW_GATED_TOOL_IDS ?? [];
} catch {
  // betaConfig.ts was deleted — beta mode OFF, children render normally
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface BetaReviewGateProps {
  /** Stable registry id from LEGAL_DATA_REVIEW_GATED_TOOLS */
  toolId?: string;
  /** Name of the AI tool (shown in the submitted card) */
  toolName?: string;
  /** role = lawyer/firm only; legal-data = all non-bypass users during beta */
  reviewScope?: "role" | "legal-data";
  /** Children = the actual AI result that gets hidden during beta */
  children: React.ReactNode;
  /** Override: force show children even in beta (e.g., for admin preview) */
  forceShow?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BetaReviewGate({
  toolId,
  toolName = "الأداة الذكية",
  reviewScope = "role",
  children,
  forceShow = false,
}: BetaReviewGateProps) {
  const { isDark } = useTheme();
  const user = useUser();
  const [submitted, setSubmitted] = useState(false);

  // Check if the current user's role is in the gated list
  const isRoleGated = user && BETA_GATED_ROLES.includes(user.userType as string);
  const isLegalDataGated =
    reviewScope === "legal-data" ||
    Boolean(toolId && LEGAL_DATA_REVIEW_GATED_TOOL_IDS.includes(toolId));
  const shouldGate = Boolean(isRoleGated || isLegalDataGated);
  const reviewReasonText = isLegalDataGated
    ? "مخرج قانوني يعتمد على مصادر أو بيانات نظامية"
    : "مخرج محاماة ضمن مراجعة البيتا";

  // ── If beta mode is OFF, or user's role is NOT gated, or forceShow is ON, or demo bypass → render children ─
  if (!BETA_REVIEW_MODE || !shouldGate || forceShow || user.isDemoBypass) {
    return <>{children}</>;
  }

  // ── Beta Mode: show the overlay instead of children ───────────────────────

  // Before submission: show the "submit for review" prompt
  if (!submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 24 }}
        className={`rounded-2xl border p-6 text-center space-y-4
          ${isDark
            ? "bg-[#0d1117] border-white/10"
            : "bg-white border-gray-200 shadow-sm"
          }`}
        dir="rtl"
      >
        {/* Icon */}
        <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center
          ${isDark ? "bg-[#0B3D2E]/20" : "bg-[#0B3D2E]/5"}`}
        >
          <Sparkle
            size={28}
            weight="duotone"
            className="text-[#C8A762]"
          />
        </div>

        {/* Title */}
        <div>
          <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            تم إعداد {toolName} بنجاح
          </h3>
          <p className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            سيتم مراجعة المخرج من فريق نظامي القانوني لضمان دقة الإسنادات والصياغة
          </p>
          <p className={`text-xs mt-2 font-semibold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
            سبب الغطاء: {reviewReasonText}
          </p>
        </div>

        {/* Submit button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setSubmitted(true)}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all
            bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90
            shadow-lg shadow-[#0B3D2E]/20`}
        >
          إرسال للمراجعة الذكية
        </motion.button>

        {/* Time estimate */}
        <p className={`text-xs flex items-center justify-center gap-1
          ${isDark ? "text-gray-500" : "text-gray-400"}`}
        >
          <Clock size={12} weight="bold" />
          الوقت المتوقع: {BETA_REVIEW_HOURS} ساعة
        </p>
      </motion.div>
    );
  }

  // After submission: show the confirmation card
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="submitted"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, type: "spring", stiffness: 200, damping: 22 }}
        className={`rounded-2xl border p-6 text-center space-y-5
          ${isDark
            ? "bg-[#0d1117] border-[#0B3D2E]/30"
            : "bg-white border-[#0B3D2E]/15 shadow-sm"
          }`}
        dir="rtl"
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 15 }}
          className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center
            ${isDark ? "bg-emerald-900/30" : "bg-emerald-50"}`}
        >
          <CheckCircle
            size={36}
            weight="fill"
            className="text-emerald-500"
          />
        </motion.div>

        {/* Confirmation text */}
        <div>
          <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            تم استلام طلبك بنجاح
          </h3>
          <p className={`text-sm mt-1.5 leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            فريق نظامي القانوني يعمل الآن على مراجعة وتدقيق المخرج.
            <br />
            سيتم إشعارك فور جاهزيته.
          </p>
        </div>

        {/* Status card */}
        <div className={`rounded-xl p-4 space-y-3
          ${isDark ? "bg-white/5 border border-white/10" : "bg-gray-50 border border-gray-100"}`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className={isDark ? "text-gray-400" : "text-gray-500"}>الحالة</span>
            <span className="flex items-center gap-1.5 text-[#C8A762] font-bold">
              <ShieldCheck size={13} weight="fill" />
              {reviewReasonText}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className={isDark ? "text-gray-400" : "text-gray-500"}>الأداة</span>
            <span className={`font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
              {toolName}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className={isDark ? "text-gray-400" : "text-gray-500"}>التسليم المتوقع</span>
            <span className="flex items-center gap-1 text-emerald-500 font-bold">
              <Clock size={11} weight="bold" />
              خلال {BETA_REVIEW_HOURS} ساعة
            </span>
          </div>
        </div>

        {/* WhatsApp CTA */}
        <a
          href="https://wa.me/966XXXXXXXXX"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all
            ${isDark
              ? "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
              : "bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
        >
          <WhatsappLogo size={14} weight="fill" className="text-[#25D366]" />
          تواصل معنا عبر واتساب للاستفسار
        </a>

        {/* Disclaimer */}
        <p className={`text-[10px] leading-relaxed ${isDark ? "text-gray-600" : "text-gray-400"}`}>
          هذا المخرج مسودة أولية وُلّدت بأدوات الذكاء الاصطناعي ويتم مراجعتها من
          فريق نظامي المتخصص. نظامي منصة أدوات قانونية ولا تُقدّم استشارات قانونية مباشرة.
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
