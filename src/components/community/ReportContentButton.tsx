"use client";

/**
 * ReportContentButton.tsx — «إبلاغ» on a community post or answer.
 * ─────────────────────────────────────────────────────────────
 * Owner item ٦٩ remainder. Posts to
 * POST /api/v1/community/reports (src/lib/services/communityReportsService.ts),
 * backed by public.community_reports (20260911_community_reports.sql).
 *
 * A guest never reaches the modal — the button itself becomes a plain link
 * to /login carrying its own honest label («سجّل الدخول للإبلاغ»), matching
 * how the rest of this page treats guests (the reply box's own «سجّل» CTA).
 * That label is set as `aria-label` (not just `title`) so it holds even in
 * the icon-only reply-card variant, which has no visible text.
 * Success and duplicate messages are both the SERVER's own text: a 409 from
 * a second report of the same target renders exactly what the API said
 * («سبق أن أبلغت عن هذا المحتوى»), never an invented "something went wrong".
 *
 * The modal is rendered through a portal into `document.body`. This button
 * is used inside `ReplyCard` (community/[id]/page.tsx), a `motion.div` with
 * its own `animate` transform — any transform on an ancestor establishes a
 * new containing block for `position: fixed` descendants, which would pin
 * this modal to that card instead of the viewport. `document.body` is only
 * ever touched from inside `{open && …}` (open starts `false` and can only
 * become `true` from a client click after hydration), so this never runs
 * during SSR.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Flag, X, WarningCircle, CheckCircle, ArrowClockwise } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { submitCommunityReport, type SubmitCommunityReportInput } from "@/lib/services/communityReportsService";
import {
  COMMUNITY_REPORT_REASONS,
  COMMUNITY_REPORT_REASON_LABELS_AR,
  type CommunityReportReason,
  type CommunityReportTargetType,
} from "@/lib/services/communityReportsInput";

interface ReportContentButtonProps {
  targetType: CommunityReportTargetType;
  targetId: string;
  isGuest: boolean;
  /** "label" (post header row) shows the Arabic/English word next to the flag; "icon" (reply cards) is icon-only. */
  variant?: "label" | "icon";
  className?: string;
}

export default function ReportContentButton({
  targetType,
  targetId,
  isGuest,
  variant = "label",
  className,
}: ReportContentButtonProps) {
  const { isRTL, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CommunityReportReason | "">("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const triggerClass =
    className ??
    `flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition ${
      isDark ? "border-[#2d3748] text-gray-400 hover:bg-white/5 hover:text-red-400" : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-red-600"
    }`;

  if (isGuest) {
    const guestLabel = isRTL ? "سجّل الدخول للإبلاغ" : "Log in to report";
    return (
      <Link href="/login" className={triggerClass} title={guestLabel} aria-label={guestLabel}>
        <Flag size={12} />
        {variant === "label" && guestLabel}
      </Link>
    );
  }

  function reset() {
    setReason("");
    setDetails("");
    setSubmitting(false);
    setResult(null);
  }

  function handleClose() {
    setOpen(false);
    reset();
  }

  async function handleSubmit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const input: SubmitCommunityReportInput = { targetType, targetId, reason };
      const trimmedDetails = details.trim();
      if (trimmedDetails) input.details = trimmedDetails;
      await submitCommunityReport(input);
      setResult({ ok: true, message: isRTL ? "تم إرسال بلاغك. شكراً لمساعدتك في الحفاظ على جودة المجتمع." : "Your report was submitted. Thank you for helping keep the community healthy." });
    } catch (err) {
      // apiMutate throws with the server's own Arabic message (duplicate
      // report 409, validation 400, unauthenticated 401 …) — surfaced
      // verbatim, never replaced with an invented reason.
      setResult({ ok: false, message: err instanceof Error ? err.message : "تعذّر إرسال البلاغ." });
    } finally {
      setSubmitting(false);
    }
  }

  const reportLabel = isRTL ? "إبلاغ" : "Report";

  const modal = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="report-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            key="report-modal"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className={`fixed inset-x-4 top-1/2 -translate-y-1/2 z-[60] rounded-3xl max-w-md mx-auto overflow-hidden ${
              isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-100 shadow-2xl"
            }`}
            dir={isRTL ? "rtl" : "ltr"}
            onClick={(e) => e.stopPropagation()}
          >
              {/* Header */}
              <div className={`relative px-5 pt-5 pb-4 ${isDark ? "bg-gradient-to-b from-red-500/10 to-transparent" : "bg-gradient-to-b from-red-500/5 to-transparent"}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isDark ? "bg-red-500/15 border border-red-500/20" : "bg-red-500/10"}`}>
                      <Flag size={18} weight="fill" className="text-red-500" />
                    </div>
                    <div>
                      <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                        {isRTL ? "الإبلاغ عن محتوى" : "Report content"}
                      </h2>
                      <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                        {isRTL ? "سيراجع فريق الإشراف بلاغك" : "Our moderation team will review your report"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"}`}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {!result?.ok && (
                  <>
                    <div className="space-y-1.5">
                      <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                        {isRTL ? "سبب البلاغ" : "Reason"}
                      </span>
                      <div className="grid grid-cols-1 gap-1.5">
                        {COMMUNITY_REPORT_REASONS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setReason(r)}
                            disabled={submitting}
                            className={`text-start px-3 py-2 rounded-xl text-[12.5px] border transition ${
                              reason === r
                                ? isDark ? "bg-[#0B3D2E]/30 border-[#0B3D2E] text-white" : "bg-[#0B3D2E]/10 border-[#0B3D2E] text-[#0B3D2E]"
                                : isDark ? "bg-zinc-800/60 border-white/[0.06] text-zinc-300" : "bg-zinc-50 border-zinc-200 text-zinc-600"
                            }`}
                          >
                            {COMMUNITY_REPORT_REASON_LABELS_AR[r]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="block space-y-1.5">
                      <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                        {isRTL ? "تفاصيل إضافية (اختياري)" : "Additional details (optional)"}
                      </span>
                      <textarea
                        value={details}
                        onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
                        rows={3}
                        disabled={submitting}
                        placeholder={isRTL ? "أخبرنا بمزيد من التفاصيل..." : "Tell us more..."}
                        className={`w-full rounded-xl border px-3 py-2 text-[12.5px] resize-none outline-none ${
                          isDark ? "bg-zinc-800/80 border-white/[0.08] text-white placeholder:text-zinc-600" : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                        }`}
                      />
                    </label>

                    {result && !result.ok && (
                      <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${isDark ? "bg-rose-500/10 border border-rose-500/20 text-rose-300" : "bg-rose-50 border border-rose-200 text-rose-700"}`}>
                        <WarningCircle size={15} weight="fill" className="mt-0.5 shrink-0" />
                        <span>{result.message}</span>
                      </div>
                    )}

                    <button
                      onClick={() => void handleSubmit()}
                      disabled={!reason || submitting}
                      className={`w-full py-2.5 rounded-xl text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
                        !reason || submitting
                          ? isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                          : "bg-red-600 text-white hover:bg-red-700"
                      }`}
                    >
                      {submitting && <ArrowClockwise size={15} className="animate-spin" />}
                      {submitting ? (isRTL ? "جارٍ الإرسال…" : "Submitting…") : isRTL ? "إرسال البلاغ" : "Submit report"}
                    </button>
                  </>
                )}

                {result?.ok && (
                  <div className="space-y-4">
                    <div className={`flex items-start gap-2 rounded-xl px-3 py-3 text-[13px] leading-relaxed font-semibold ${isDark ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
                      <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0" />
                      <span>{result.message}</span>
                    </div>
                    <button
                      onClick={handleClose}
                      className="w-full py-2.5 rounded-xl text-[13px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#155e41] transition-all"
                    >
                      {isRTL ? "إغلاق" : "Close"}
                    </button>
                  </div>
                )}
              </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClass}
        aria-label={variant === "icon" ? reportLabel : undefined}
      >
        <Flag size={12} />
        {variant === "label" && reportLabel}
      </button>
      {typeof document !== "undefined" && createPortal(modal, document.body)}
    </>
  );
}
