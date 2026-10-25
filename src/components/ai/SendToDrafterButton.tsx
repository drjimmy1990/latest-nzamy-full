"use client";

/**
 * «📝 إرسال النص المفرّغ للصائغ القانوني» (owner-free plan 2026-10-25, N1.8).
 *
 * Hands a REAL transcript to /ai/draft: writes a one-shot sessionStorage
 * handoff (src/lib/ai/transcriptHandoff.ts) and navigates in the same tab to
 * /ai/draft?from=transcript, where the drafter prefills its facts field and
 * asks the user to review it. Nothing is submitted for him.
 *
 * Not mounted anywhere yet: the tools that would produce a transcript
 * (/ai/transcriber, «عصارة المرفقات») are «قريباً» (owner answer ١١٥). Mount it
 * beside the real transcript only, never beside sample or canned text.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import {
  DRAFTER_TRANSCRIPT_URL,
  canSendToDrafter,
  sessionStorageOrNull,
  writeTranscriptHandoff,
} from "@/lib/ai/transcriptHandoff";

interface SendToDrafterButtonProps {
  /** The transcript text exactly as the tool produced it. */
  text: string;
  /** The producing tool's name, e.g. «المفرّغ الذكي». */
  sourceLabel: string;
  className?: string;
}

export function SendToDrafterButton({ text, sourceLabel, className = "" }: SendToDrafterButtonProps) {
  const { isDark } = useTheme();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const canSend = canSendToDrafter(text);

  function send() {
    if (!canSend) return;
    const result = writeTranscriptHandoff(sessionStorageOrNull(), text, sourceLabel);
    if (!result.ok) {
      // Navigating now would land on an empty drafter; say so instead.
      setError("تعذّر حفظ النص في هذا المتصفح — انسخه والصقه يدوياً في خانة الوقائع لدى الصائغ القانوني.");
      return;
    }
    setError(null);
    router.push(DRAFTER_TRANSCRIPT_URL);
  }

  return (
    <div className={`space-y-1.5 ${className}`} dir="rtl">
      <button
        type="button"
        onClick={send}
        disabled={!canSend}
        aria-disabled={!canSend}
        title={canSend ? undefined : "لا يوجد نص مُفرَّغ لإرساله"}
        className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]"
      >
        <span aria-hidden="true">📝</span>
        إرسال النص المفرّغ للصائغ القانوني
      </button>
      {error && (
        <p role="alert" className={`text-[11px] ${isDark ? "text-red-400" : "text-red-600"}`}>
          {error}
        </p>
      )}
    </div>
  );
}

export default SendToDrafterButton;
