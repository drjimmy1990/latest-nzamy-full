"use client";

/**
 * BetaReviewGate — Temporary Overlay for Beta Phase
 * ──────────────────────────────────────────────────────────────
 * Wraps ANY AI output section. When BETA_REVIEW_MODE is ON:
 *   → Hides the children (the actual AI result)
 *   → With an `orderPayload` prop that resolves to a value: lets the user
 *     submit a REAL order (createServiceOrder → POST /api/v1/service-requests,
 *     the same transport useDraftState.submitOrder() uses) and shows the
 *     real order id + status once it exists.
 *   → Without `orderPayload` (absent, or the getter returns null — the
 *     default for every call site today): shows an honest "not available"
 *     card. No button, no promise that a request was received, because none
 *     was.
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
 *
 *   // For a tool wired into the real order pipeline:
 *   <BetaReviewGate
 *     toolName="..."
 *     orderPayload={() => intakeReady ? { service, title, description, intake, attachments } : null}
 *   >
 *     ...
 *   </BetaReviewGate>
 */

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Clock, CheckCircle, Info,
  WhatsappLogo, Sparkle, ArrowLeft,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  createServiceOrder, ORDER_STATUS_AR, type ServiceOrder,
} from "@/lib/services/serviceOrders";
import type { ServiceKey, OrderAttachment } from "@/lib/services/orderIntake";
// The platform's one real support number (Task B1, item 45) — NOT
// betaConfig.ts's BETA_WHATSAPP_NUMBER, still a literal placeholder
// ("966XXXXXXXXX" — "Update with real number"), and not a second literal
// pasted here. Same constant buildWhatsAppHref (src/app/ai/orders/[id]/page.tsx's
// wa.me link) defaults to; src/app/contact/page.tsx still hardcodes the same
// digits as a literal rather than importing this.
import { NZAMY_WHATSAPP_NUMBER } from "@/components/floating/whatsappWorkflow";

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

// ─── Payload contract ───────────────────────────────────────────────────────

/**
 * Supplied by a call site that is wired into the real order pipeline. When
 * this resolves to a non-null value, pressing send creates an actual
 * service_requests row via createServiceOrder — the same transport
 * useDraftState.submitOrder() uses. When it is absent, or returns null (the
 * tool isn't wired yet, or its intake isn't complete), the gate must not
 * imply a request exists.
 *
 * The getter is called during render to decide which card to show, so it
 * must be pure / side-effect free — read current form state, do not touch
 * it.
 */
export interface BetaReviewOrderPayload {
  service: ServiceKey;
  title: string;
  description: string;
  intake: Record<string, unknown>;
  attachments?: OrderAttachment[];
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
  /** When supplied, pressing send creates a REAL order. When absent, the gate
   *  must not claim a human will review anything — see the no-payload card. */
  orderPayload?: () => BetaReviewOrderPayload | null;
}

/** Tailwind text color for an order status "tone" (see ORDER_STATUS_AR). */
function statusToneClass(tone: string): string {
  switch (tone) {
    case "amber": return "text-amber-500";
    case "blue": return "text-blue-500";
    case "emerald": return "text-emerald-500";
    default: return "text-gray-400";
  }
}

/**
 * Map a thrown createServiceOrder error to Arabic user-facing copy. Mirrors
 * useDraftState's submitErrorMessageAr (not exported from that module) —
 * kept local since this is the only other order-creation call site.
 */
function submitErrorMessageAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[BetaReviewGate] order submission failed:", raw);
  if (raw === "Unauthorized") {
    return "انتهت جلستك — يرجى تسجيل الدخول مجدداً ثم إعادة المحاولة.";
  }
  return "تعذّر إرسال الطلب — حاول مجدداً";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BetaReviewGate({
  toolId,
  toolName = "الأداة الذكية",
  reviewScope = "role",
  children,
  forceShow = false,
  orderPayload,
}: BetaReviewGateProps) {
  const { isDark } = useTheme();
  const user = useUser();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  // Evaluated once per render — reused both to pick the card below and,
  // via closure, inside handleSubmit. Do not call orderPayload() again.
  const payload = orderPayload ? orderPayload() : null;

  async function handleSubmit() {
    if (!payload) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: profile } = authUser
        ? await supabase.from("profiles").select("display_name, phone, email").eq("id", authUser.id).single()
        : { data: null };

      const createdOrder = await createServiceOrder({
        service: payload.service,
        title: payload.title,
        description: payload.description,
        intake: payload.intake,
        attachments: payload.attachments ?? [],
        requester: {
          name: profile?.display_name ?? undefined,
          phone: profile?.phone ?? undefined,
          email: profile?.email ?? undefined,
        },
      });
      setOrder(createdOrder);
    } catch (err) {
      setSubmitError(submitErrorMessageAr(err));
    } finally {
      setSubmitting(false);
    }
  }

  // ── After a real order is created: show the confirmation card, backed by
  //    the actual row (id + live status) so the claim is checkable ─────────
  if (order) {
    // order.status is unchecked JSON from the API route, not a validated
    // literal — fall back rather than crash the just-created success card
    // on an unexpected value (mirrors /ai/orders/[id]/page.tsx:97).
    const statusInfo = ORDER_STATUS_AR[order.status] ?? ORDER_STATUS_AR.pending_assignment;
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
            <CheckCircle size={36} weight="fill" className="text-emerald-500" />
          </motion.div>

          {/* Confirmation text */}
          <div>
            <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              تم إنشاء طلبك بنجاح
            </h3>
            <p className={`text-sm mt-1.5 leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              تم تسجيل طلبك في نظام المتابعة لدى فريق نظامي القانوني.
              <br />
              سيتم إشعارك فور جاهزية النتيجة.
            </p>
          </div>

          {/* Status card — backed by the real order row */}
          <div className={`rounded-xl p-4 space-y-3
            ${isDark ? "bg-white/5 border border-white/10" : "bg-gray-50 border border-gray-100"}`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className={isDark ? "text-gray-400" : "text-gray-500"}>رقم الطلب</span>
              <span className={`font-mono font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`} dir="ltr">
                {order.id}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className={isDark ? "text-gray-400" : "text-gray-500"}>الحالة</span>
              <span className={`flex items-center gap-1.5 font-bold ${statusToneClass(statusInfo.tone)}`}>
                <ShieldCheck size={13} weight="fill" />
                {statusInfo.label}
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

          {/* Order tracking link — makes the claim above checkable */}
          <Link
            href={`/ai/orders/${order.id}`}
            className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all
              bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 shadow-lg shadow-[#0B3D2E]/20`}
          >
            متابعة حالة الطلب
          </Link>

          {/* WhatsApp CTA */}
          <a
            href={`https://wa.me/${NZAMY_WHATSAPP_NUMBER}`}
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
            هذا المخرج مسودة أولية وُلّدت بأدوات الذكاء الاصطناعي، وتخضع لمراجعة فريق نظامي
            المتخصص قبل التسليم. نظامي منصة أدوات قانونية ولا تُقدّم استشارات قانونية مباشرة.
          </p>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── A payload getter was supplied and resolved to a value: this tool is
  //    wired to the real order pipeline. Show the send prompt — pressing it
  //    actually creates the order via handleSubmit above. ──────────────────
  if (payload) {
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

        {/* Submission error — button stays usable, nothing here claims success */}
        {submitError && (
          <p className="text-xs font-semibold text-red-500" role="alert">
            {submitError}
          </p>
        )}

        {/* Submit button */}
        <motion.button
          whileHover={submitting ? undefined : { scale: 1.02 }}
          whileTap={submitting ? undefined : { scale: 0.97 }}
          onClick={handleSubmit}
          disabled={submitting}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all
            bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90
            shadow-lg shadow-[#0B3D2E]/20 disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {submitting ? "جارٍ الإرسال…" : "إرسال للمراجعة الذكية"}
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

  // ── No payload — absent, or the getter returned null. This is the path
  //    every live call site takes today. Say so plainly: no request exists,
  //    no review is running. No button — a disabled "send" still implies
  //    sending is the intended outcome. ──────────────────────────────────
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
        ${isDark ? "bg-white/5" : "bg-gray-100"}`}
      >
        <Info
          size={28}
          weight="duotone"
          className={isDark ? "text-gray-400" : "text-gray-500"}
        />
      </div>

      {/* Title + plain statement of fact */}
      <div>
        <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
          {toolName}: المخرج التلقائي غير متاح خلال البيتا
        </h3>
        <p className={`text-sm mt-1.5 leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>
          هذا المخرج لا يُعرض تلقائيًا خلال الفترة الحالية من البيتا، ولم يُسجَّل أي طلب بشأنه.
        </p>
      </div>

      {/* What does work right now */}
      <div className={`rounded-xl p-4 space-y-2 text-right
        ${isDark ? "bg-white/5 border border-white/10" : "bg-gray-50 border border-gray-100"}`}
      >
        <p className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          الخدمة المتاحة حاليًا
        </p>
        <Link
          href="/ai/draft"
          className={`flex items-center justify-between gap-2 text-sm font-bold
            ${isDark ? "text-[#C8A762] hover:text-[#C8A762]/80" : "text-[#0B3D2E] hover:text-[#0B3D2E]/80"}`}
        >
          <span>الصائغ القانوني — صياغة المذكرات</span>
          <ArrowLeft size={16} weight="bold" />
        </Link>
      </div>
    </motion.div>
  );
}
