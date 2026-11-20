"use client";

/**
 * «إرسال مع السياق إلى ▾» — T17a (batch l11), on the /ai/analyze result
 * (عصارة المرفقات). Hands the result to another tool as context, in this tab:
 *   - المساعد المتقدم: prefills its message box (assistantHandoff.ts);
 *   - الصائغ القانوني: prefills the facts field (transcriptHandoff.ts, the
 *     drafter's existing ?from=transcript path).
 * Nothing is sent or charged by the move: the lawyer reviews and sends there.
 * «حفظ في المجمّع» is the result bar's own «أضف للمجمّع» (AiResultActions).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretDown, PaperPlaneRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { writeAssistantHandoff } from "@/lib/ai/assistantHandoff";
import { DRAFTER_TRANSCRIPT_URL, sessionStorageOrNull, writeTranscriptHandoff } from "@/lib/ai/transcriptHandoff";

const TARGETS = [
  { id: "assistant", label: "المساعد المتقدم", url: "/ai/assistant" },
  { id: "drafter", label: "الصائغ القانوني", url: DRAFTER_TRANSCRIPT_URL },
] as const;

export default function SendWithContextMenu({ text, sourceLabel }: { text: string; sourceLabel: string }) {
  const { isDark } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function send(target: (typeof TARGETS)[number]) {
    setOpen(false);
    const storage = sessionStorageOrNull();
    const ok = target.id === "assistant"
      ? writeAssistantHandoff(storage, text, sourceLabel)
      : writeTranscriptHandoff(storage, text, sourceLabel).ok;
    if (!ok) {
      setError("تعذّر نقل النص في هذا المتصفح — انسخه والصقه يدوياً.");
      return;
    }
    setError(null);
    router.push(target.url);
  }

  const btn = `inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition-all ${isDark ? "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"}`;

  return (
    <div ref={ref} className="relative inline-block" dir="rtl">
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={!text.trim()} aria-haspopup="menu" aria-expanded={open} className={`${btn} disabled:opacity-50`}>
        <PaperPlaneRight size={14} /> إرسال مع السياق إلى <CaretDown size={11} />
      </button>
      {open && (
        <div role="menu" className={`absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-2xl border shadow-xl ${isDark ? "border-white/[0.08] bg-zinc-900" : "border-slate-200 bg-white"}`}>
          {TARGETS.map((t) => (
            <button key={t.id} type="button" role="menuitem" onClick={() => send(t)}
              className={`block w-full px-3.5 py-2.5 text-right text-[12px] font-medium ${isDark ? "text-zinc-300 hover:bg-white/[0.05]" : "text-slate-600 hover:bg-slate-50"}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className={`mt-1 text-[11px] ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</p>}
    </div>
  );
}
