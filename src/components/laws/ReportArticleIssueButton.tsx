"use client";

/**
 * ReportArticleIssueButton — «أبلغ عن خطأ في هذه المادة» (Phase 6).
 * ─────────────────────────────────────────────────────────
 * A small trigger + modal, self-contained so it can be dropped into any
 * article-page toolbar without that page owning form state. Submits through
 * feedbackService.submitLibraryIssueReport → POST /api/v1/library/issue-reports
 * (table library_issue_reports, readable by admin — see
 * adminListIssueReports/adminUpdateIssueReport in the same service).
 *
 * Guests see «سجّل الدخول لإرسال البلاغ» instead of the form — the report
 * needs an author (`user_id` on the row), matching the same gate
 * FeatureRequestBanner's GuestNotice uses for feature requests.
 *
 * T28-28 (owner test 2026-09-28): four plain-language categories (mapped onto
 * the existing kinds — reportIssuePayload.ts), a free note, and the reader's
 * highlighted text quoted automatically when there is one. There is no
 * contact field: the reporter is signed in, so the row already carries the
 * account the team would reply to.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WarningCircle, X, PaperPlaneTilt, CheckCircle, SignIn } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { submitLibraryIssueReport } from "@/lib/services/feedbackService";
import {
  REPORT_CATEGORIES,
  REPORT_TEXT_MAX,
  buildIssueReport,
  capHighlight,
  reportArticleRef,
  reportTextIsValid,
  type ReportCategoryId,
} from "./reportIssuePayload";

interface ReportArticleIssueButtonProps {
  /** The law's slug — becomes `lawSlug` on the report row. */
  lawSlug: string;
  /** The article's display label only, e.g. "المادة الثانية عشرة" (≤ 100 chars on the row). */
  articleRef: string;
  isDark: boolean;
  isRTL?: boolean;
  /** True while no article is resolvable yet (e.g. law still loading). */
  disabled?: boolean;
  /**
   * Returns the text the reader has highlighted inside the article, or "".
   * Called once, synchronously, when the dialog opens — on a phone the tap on
   * this button is what collapses the selection, so it cannot wait.
   */
  captureHighlight?: () => string;
}

export default function ReportArticleIssueButton({
  lawSlug, articleRef, isDark, isRTL = true, disabled = false, captureHighlight,
}: ReportArticleIssueButtonProps) {
  const { isLoggedIn } = useUser();
  const [open, setOpen] = useState(false);
  const [initialHighlight, setInitialHighlight] = useState("");

  const trigger = (
    <button
      type="button"
      onClick={() => {
        let captured = "";
        try { captured = captureHighlight?.() ?? ""; } catch { captured = ""; }
        setInitialHighlight(capHighlight(captured));
        setOpen(true);
      }}
      disabled={disabled}
      title={isRTL ? "أبلغ عن خطأ في هذه المادة" : "Report an issue in this article"}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed ${
        isDark
          ? "border-red-500/25 text-red-300/90 bg-red-900/10 hover:bg-red-900/20"
          : "border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
      }`}
    >
      <WarningCircle size={13} weight="duotone" />
      <span>{isRTL ? "أبلغ عن خطأ في هذه المادة" : "Report an issue"}</span>
    </button>
  );

  return (
    <>
      {trigger}
      <AnimatePresence>
        {open && (
          <ReportModal
            isDark={isDark}
            isRTL={isRTL}
            isLoggedIn={isLoggedIn}
            lawSlug={lawSlug}
            articleRef={articleRef}
            initialHighlight={initialHighlight}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ReportModal({
  isDark, isRTL, isLoggedIn, lawSlug, articleRef, initialHighlight, onClose,
}: {
  isDark: boolean;
  isRTL: boolean;
  isLoggedIn: boolean;
  lawSlug: string;
  articleRef: string;
  initialHighlight: string;
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState<ReportCategoryId>("text_error");
  const [description, setDescription] = useState("");
  // Optional; «إزالة التظليل» clears only this, never the note.
  const [highlight, setHighlight] = useState(initialHighlight);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base  = isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200";
  const inp   = isDark ? "bg-zinc-800/60 border-white/10 text-zinc-100 placeholder-zinc-600 focus:border-[#C8A762]/50" : "bg-slate-50 border-slate-200 text-gray-900 placeholder-slate-400 focus:border-amber-400";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const lbl   = isDark ? "text-zinc-300" : "text-gray-700";

  const articleLabel = reportArticleRef(articleRef);
  const canSubmit = reportTextIsValid(description) && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const body = buildIssueReport({ categoryId, text: description, highlight, articleLabel });
      await submitLibraryIssueReport({ lawSlug, ...body });
      setSubmitted(true);
      setTimeout(onClose, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال البلاغ، حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-[calc(100%-2rem)] max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${base}`}
        dir={isRTL ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isDark ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-600"}`}>
              <WarningCircle size={16} weight="duotone" />
            </div>
            <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "أبلغ عن خطأ في هذه المادة" : "Report an issue in this article"}
            </p>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl transition ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {!isLoggedIn ? (
          <div className="p-5">
            <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200 bg-slate-50"}`}>
              <SignIn size={16} weight="duotone" className={muted} />
              <div className="flex-1 min-w-0">
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  {isRTL ? "سجّل الدخول لإرسال البلاغ" : "Log in to send the report"}
                </p>
              </div>
              <a href="/login" className="flex-shrink-0 text-[11px] font-bold text-[#C8A762] hover:underline">
                {isRTL ? "دخول" : "Log in"}
              </a>
            </div>
          </div>
        ) : submitted ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-6">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
              <CheckCircle size={28} weight="fill" />
            </div>
            <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "وصل بلاغك، شكراً لك" : "Your report was sent, thank you"}
            </p>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4 max-h-[75dvh] overflow-y-auto overscroll-contain">
            {articleLabel && (
              <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${isDark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-slate-50 border border-slate-200"}`}>
                <span className={`text-[10px] font-bold ${muted} flex-shrink-0 mt-0.5`}>المادة:</span>
                <span className={`text-[11px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{articleLabel}</span>
              </div>
            )}

            <div>
              <p className={`text-[11px] font-bold mb-1.5 ${lbl}`}>نوع الملاحظة</p>
              <div role="radiogroup" aria-label="نوع الملاحظة" className="flex flex-wrap gap-1.5">
                {REPORT_CATEGORIES.map((c) => {
                  const selected = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCategoryId(c.id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition ${
                        selected
                          ? isDark ? "bg-red-900/25 border-red-500/40 text-red-300" : "bg-red-50 border-red-300 text-red-700"
                          : isDark ? "border-white/[0.08] text-zinc-400 hover:border-white/[0.16]" : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* The reader's highlight inside the article — optional, quoted
                after the note; removing it keeps everything else. */}
            {highlight && (
              <div className={`rounded-xl border px-3 py-2.5 ${isDark ? "border-amber-500/30 bg-amber-900/15" : "border-amber-300 bg-amber-50"}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold ${isDark ? "text-amber-300" : "text-amber-800"}`}>النص المظلل</span>
                  <button
                    type="button"
                    onClick={() => setHighlight("")}
                    className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 transition ${isDark ? "text-red-400 hover:bg-red-500/10" : "text-red-600 hover:bg-red-50"}`}
                  >
                    ✕ إزالة التظليل
                  </button>
                </div>
                <p className={`text-[11.5px] leading-relaxed line-clamp-4 ${isDark ? "text-amber-100/90" : "text-amber-900"}`}>
                  «{highlight}»
                </p>
              </div>
            )}

            <div>
              <label htmlFor="report-issue-text" className={`text-[11px] font-bold block mb-1.5 ${lbl}`}>ملاحظتك *</label>
              <textarea
                id="report-issue-text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={REPORT_TEXT_MAX}
                placeholder="اشرح ملاحظتك بحرية… خطأ مطبعي، اقتراح، أو خلل فني"
                className={`w-full px-3 py-2.5 rounded-xl border text-[12px] outline-none resize-none transition leading-relaxed ${inp}`}
              />
              {description.trim().length > 0 && !reportTextIsValid(description) && (
                <p className={`mt-1 text-[10px] ${muted}`}>اكتب خمسة أحرف على الأقل.</p>
              )}
            </div>

            {error && (
              <p className="text-[11px] font-semibold text-red-500">{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-3 rounded-xl text-[13px] font-black transition disabled:opacity-40 bg-[#0B3D2E] text-white hover:bg-[#0a3226] flex items-center justify-center gap-1.5"
            >
              <PaperPlaneTilt size={14} weight="bold" />
              {submitting ? (isRTL ? "جارٍ الإرسال..." : "Sending...") : (isRTL ? "إرسال البلاغ" : "Send report")}
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
}
