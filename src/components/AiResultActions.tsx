"use client";

/**
 * AiResultActions — Standardized action bar for all AI output pages
 * ──────────────────────────────────────────────────────────────────
 * Provides: Copy · Download (.txt) · Add to Collector · Human Review (firm only)
 * Usage: <AiResultActions text={resultText} filename="contract-draft" />
 *
 * P9 Mandate: Phosphor Icons only, no emoji, Spring Physics motion.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, CheckCircle, DownloadSimple, Tray,
  ShareNetwork, Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { addToInbox, type InboxSource } from "@/lib/services/researchService";
import { useUser } from "@/hooks/useUser";


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
    </div>
  );
}
