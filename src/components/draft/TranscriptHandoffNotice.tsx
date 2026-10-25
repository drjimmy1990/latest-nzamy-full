"use client";

/**
 * The notice /ai/draft shows when it was opened from a transcript
 * (?from=transcript, N1.8): the facts field («الوقائع», step 2) holds text the
 * user did not type, so he is told where it came from and that he must review
 * it. Dismissing hides the notice only; the text stays in the field, editable.
 */

import { X, Microphone } from "@phosphor-icons/react";

interface TranscriptHandoffNoticeProps {
  isDark: boolean;
  sourceLabel: string;
  truncated: boolean;
  onDismiss: () => void;
}

export function TranscriptHandoffNotice({ isDark, sourceLabel, truncated, onDismiss }: TranscriptHandoffNoticeProps) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
        isDark ? "border-[#C8A762]/25 bg-[#C8A762]/5" : "border-[#0B3D2E]/15 bg-[#0B3D2E]/5"
      }`}
    >
      <Microphone size={16} weight="fill" aria-hidden="true"
        className={`mt-0.5 flex-shrink-0 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`} />
      <div className="flex-1 space-y-0.5">
        <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
          هذا نص مُفرَّغ أُرسل من {sourceLabel || "المفرّغ الذكي"} — راجعه وعدّله قبل الصياغة
        </p>
        <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          وضعناه في خانة «الوقائع» في الخطوة ٢، ويمكنك تعديله أو حذفه هناك. لن يُرسَل أي طلب قبل أن تراجعه وتضغط الإرسال بنفسك.
        </p>
        {truncated && (
          <p className={`text-[11px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
            النص أطول من الحد المسموح، فنُقل جزؤه الأول فقط — أكمل الباقي يدوياً إن لزم.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="إخفاء التنبيه"
        className={`flex-shrink-0 rounded-lg p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${
          isDark ? "text-zinc-400 hover:bg-white/[0.06] hover:text-white" : "text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-800"
        }`}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
