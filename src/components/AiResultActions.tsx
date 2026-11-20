"use client";

/**
 * AiResultActions — Standardized action bar for all AI output pages
 * ──────────────────────────────────────────────────────────────────
 * Provides: Copy · Download (.txt) · Word (.docx) · Print / PDF · Add to Collector
 *           · Human Review (firm only)
 * N01-21/22/23 (batch l11): Word is the plain package of lib/docx/plainDocx.ts
 * (the same fflate writer as the letterhead export, loaded on the click), and
 * print is AiResultPrint (the browser's «حفظ بصيغة PDF» is the PDF). Both for
 * every account that sees the result; the letterhead bar stays where it was.
 * Usage: <AiResultActions text={resultText} filename="contract-draft" />
 *
 * P9 Mandate: Phosphor Icons only, no emoji, Spring Physics motion.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, CheckCircle, DownloadSimple, Tray,
  ShareNetwork, Warning, FileDoc, Printer, SpinnerGap,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { addToInbox, type InboxSource } from "@/lib/services/researchService";
import { useUser } from "@/hooks/useUser";
import SaveToCaseButton from "@/components/ai/SaveToCaseButton";
import AiResultPrint from "@/components/ai/AiResultPrint";


interface AiResultActionsProps {
  /** The full AI-generated text to copy / download */
  text: string;
  /** Base filename (without extension) for the downloaded file */
  filename?: string;
  /** Show "Add to Collector" button (default: true) */
  showCollector?: boolean;
  /** Source label for collector — which AI tool is saving this */
  collectorSource?: InboxSource;
  /**
   * @deprecated use showCollector instead
   * kept for backward compat so existing callers with showVault don't break
   */
  showVault?: boolean;
  /** Show human-review flag — FIRM only, default: false */
  showHumanReview?: boolean;
  /** Show share button (default: false) */
  showShare?: boolean;
  /** Called when user clicks "Add to Collector" */
  onAddToCollector?: () => void;
  /** Called when user flags for human review */
  onHumanReview?: () => void;
  /** Extra className on the wrapper */
  className?: string;
  /**
   * N01-21/22: show «حفظ في مستندات القضية» (lawyer/firm accounts only;
   * default true). `runId` links a stored ai_runs row to the picked case.
   */
  showSaveToCase?: boolean;
  runId?: string | null;
  /** N01-21/22/23: the heading of the Word file and the printed page (default: the filename in words). */
  title?: string;
  /** Show «Word» and «طباعة / PDF» (default: true). */
  showExport?: boolean;
  /**
   * The page also mounts LetterheadExportBar (Word + print on the letterhead,
   * lawyer and firm accounts only): those accounts then get the letterhead's
   * buttons alone, never a second Word and print pair. Everyone else keeps these.
   */
  letterheadBeside?: boolean;
}

export default function AiResultActions({
  text,
  filename = "nzamy-ai-result",
  showCollector = true,
  collectorSource = "other",
  showVault,          // ignored — kept for compat
  showHumanReview = false,  // OFF by default — firm feature only
  showShare = false,
  onAddToCollector,
  onHumanReview,
  className = "",
  showSaveToCase = true,
  runId = null,
  title,
  showExport = true,
  letterheadBeside = false,
}: AiResultActionsProps) {
  // showVault is intentionally unused — absorbed by showCollector
  void showVault;

  const { isDark } = useTheme();
  const user = useUser();

  // Human review is exclusively for non-specialist users: individual, corporate/business, ngo, micro.
  // It is explicitly hidden from lawyers, firms, and other specialist roles.
  const allowedForReview = ["individual", "corporate", "business", "ngo", "micro"];
  const canShowHumanReview = showHumanReview && allowedForReview.includes(user?.userType as string);

  // The collector (المجمع البحثي) is exclusively for lawyers/firms to organize their drafts and research.
  // It is explicitly hidden from clients.
  const allowedForCollector = ["lawyer", "firm"];
  const canShowCollector = showCollector && allowedForCollector.includes(user?.userType as string);

  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  // A count, not a flag: some browsers never fire afterprint, and the next click must still print.
  const [printRun, setPrintRun] = useState(0);
  const docTitle = (title ?? filename.replace(/-/g, " ")).trim();

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleWord() {
    if (wordBusy) return;
    setWordBusy(true);
    setWordError(null);
    try {
      // fflate is loaded on the click, never with the page.
      const { plainResultDocx, safeFilename } = await import("@/lib/docx/plainDocx");
      const bytes = plainResultDocx(text, docTitle);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFilename(filename)}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setWordError("تعذّر إنشاء ملف Word — انسخ النص");
    } finally {
      setWordBusy(false);
    }
  }

  async function handleCollector() {
    try {
      await addToInbox(
        collectorSource,
        "text",
        filename.replace(/-/g, " "),
        text,
      );
    } catch { /* localStorage unavailable */ }
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
    onAddToCollector?.();
  }

  function handleHumanReview() {
    setFlagged(true);
    onHumanReview?.();
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: filename, text }).catch(() => {});
    } else {
      handleCopy();
    }
  }

  const btn = `inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all border`;
  const ghost = isDark
    ? `${btn} border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200`
    : `${btn} border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm`;
  const accent = isDark
    ? `${btn} border-[#0B3D2E]/40 bg-[#0B3D2E]/20 text-emerald-400 hover:bg-[#0B3D2E]/30`
    : `${btn} border-[#0B3D2E]/20 bg-[#0B3D2E]/5 text-[#0B3D2E] hover:bg-[#0B3D2E]/10`;
  const purple = isDark
    ? `${btn} border-purple-500/30 bg-purple-900/15 text-purple-400 hover:bg-purple-900/25`
    : `${btn} border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100`;
  const danger = isDark
    ? `${btn} border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10`
    : `${btn} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} dir="rtl">

      {/* Copy */}
      <motion.button
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
        onClick={handleCopy}
        className={copied ? accent : ghost}
        aria-label="نسخ النص"
      >
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span key="ok" initial={{ scale: 0.7 }} animate={{ scale: 1 }} className="flex items-center gap-1.5">
              <CheckCircle size={14} weight="fill" className="text-emerald-400" /> تم النسخ
            </motion.span>
          ) : (
            <motion.span key="copy" initial={{ scale: 0.7 }} animate={{ scale: 1 }} className="flex items-center gap-1.5">
              <Copy size={14} /> نسخ
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Download */}
      <motion.button
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
        onClick={handleDownload}
        className={ghost}
        aria-label="تنزيل كملف نصي"
      >
        <DownloadSimple size={14} /> تنزيل .txt
      </motion.button>

      {/* Word + print / PDF (N01-21/22/23); the letterhead bar's own pair stands in for lawyers and firms */}
      {showExport && !(letterheadBeside && (user?.userType === "lawyer" || user?.userType === "firm")) && (
        <>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => void handleWord()}
            disabled={wordBusy || !text.trim()}
            className={`${ghost} disabled:opacity-50`}
            aria-label="تنزيل كملف Word"
          >
            {wordBusy ? <SpinnerGap size={14} className="animate-spin" /> : <FileDoc size={14} />} Word
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setPrintRun((n) => n + 1)}
            disabled={!text.trim()}
            className={`${ghost} disabled:opacity-50`}
            aria-label="طباعة أو حفظ بصيغة PDF"
          >
            <Printer size={14} /> طباعة / PDF
          </motion.button>
          {printRun > 0 && <AiResultPrint key={printRun} text={text} title={docTitle} onDone={() => setPrintRun(0)} />}
        </>
      )}

      {/* Add to Collector */}
      {canShowCollector && (
        <motion.button
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={handleCollector}
          className={added ? accent : purple}
          aria-label="أضف للمجمّع البحثي"
        >
          <AnimatePresence mode="wait" initial={false}>
            {added ? (
              <motion.span key="added" initial={{ scale: 0.7 }} animate={{ scale: 1 }} className="flex items-center gap-1.5">
                <CheckCircle size={14} weight="fill" className="text-emerald-400" /> أُضيف للمجمّع ✓
              </motion.span>
            ) : (
              <motion.span key="tray" initial={{ scale: 0.7 }} animate={{ scale: 1 }} className="flex items-center gap-1.5">
                <Tray size={14} /> أضف للمجمّع
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      )}

      {/* Save to a case's documents (N01-21/22) — lawyer/firm only, decided inside */}
      {showSaveToCase && (
        <SaveToCaseButton text={text} title={filename.replace(/-/g, " ")} runId={runId} />
      )}

      {/* Human Review — firm-only, hidden for lawyers */}
      {canShowHumanReview && !flagged && (
        <motion.button
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={handleHumanReview}
          className={danger}
          aria-label="إحالة لمراجعة من محامٍ متخصص"
        >
          <Warning size={14} weight="duotone" /> مراجعة من محامٍ متخصص
        </motion.button>
      )}
      {canShowHumanReview && flagged && (
        <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold
          ${isDark ? "border border-amber-500/20 bg-amber-500/5 text-amber-400" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
          <Warning size={14} weight="duotone" /> تم إحالتها للمراجعة
        </span>
      )}

      {/* Share */}
      {showShare && (
        <motion.button
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={handleShare}
          className={ghost}
          aria-label="مشاركة النص"
        >
          <ShareNetwork size={14} /> مشاركة
        </motion.button>
      )}

      {wordError && (
        <p role="status" className={`w-full text-[11px] ${isDark ? "text-amber-400" : "text-amber-700"}`}>{wordError}</p>
      )}
    </div>
  );
}
