"use client";

/**
 * The researcher's action strip under an answer (owner file 11 item 5, V3
 * phase A4): «نسخ صافي» (the answer without its source markers; a check and
 * «تم النسخ» for two seconds), «تصدير Word» (the plain .docx every AI result
 * uses, lib/docx/plainDocx.ts, with «جارٍ تجهيز ملف Word…» while it builds),
 * and «أرسل إلى الصائغ» for the accounts the drafter is open to. Every button
 * presses in (motion-safe). Listening to the answer is phase C (not built).
 */
import { useState } from "react";
import { CheckCircle, Copy, FileDoc, SpinnerGap } from "@phosphor-icons/react";
import { stripCitationMarkers } from "@/lib/ai/citationMarkers";
import SendToDrafterNotesButton from "@/components/draft/SendToDrafterNotesButton";

export const COPY_CONFIRM_MS = 2000;

export function ResearchAnswerActions({ text, question, isDark }: { text: string; question: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const btn = `inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-transform motion-safe:active:scale-[0.96] disabled:opacity-60 ${
    isDark ? "border-white/10 text-zinc-300 hover:text-white hover:border-[#C8A762]/40" : "border-slate-200 text-slate-600 hover:text-[#0B3D2E] hover:border-[#0B3D2E]/40"
  }`;

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  function copy() {
    const clean = stripCitationMarkers(text).trim();
    if (!navigator.clipboard) return flash("تعذّر النسخ في هذا المتصفح — ظلّل النص وانسخه.");
    navigator.clipboard.writeText(clean).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPY_CONFIRM_MS);
      },
      () => flash("تعذّر النسخ في هذا المتصفح — ظلّل النص وانسخه."),
    );
  }

  async function word() {
    if (wordBusy) return;
    setWordBusy(true);
    try {
      // fflate is loaded on the click, never with the page.
      const { plainResultDocx, safeFilename } = await import("@/lib/docx/plainDocx");
      const title = `باحث المكتبة — ${question.slice(0, 60)}`;
      const bytes = plainResultDocx(text, title);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFilename(`باحث-المكتبة-${question.slice(0, 40)}`, "nzamy-library-research")}.docx`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      flash("جُهّز ملف Word");
    } catch {
      flash("تعذّر إنشاء ملف Word — انسخ النص");
    } finally {
      setWordBusy(false);
    }
  }

  return (
    <div data-research="actions" className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className={btn} aria-live="polite">
          {copied ? <CheckCircle size={13} weight="bold" className="text-emerald-500" /> : <Copy size={13} />}
          {copied ? "تم النسخ" : "نسخ صافي"}
        </button>
        <button type="button" onClick={() => void word()} disabled={wordBusy} className={btn}>
          {wordBusy ? <SpinnerGap size={13} className="motion-safe:animate-spin" /> : <FileDoc size={13} />}
          {wordBusy ? "جارٍ تجهيز ملف Word…" : "تصدير Word"}
        </button>
        {/* Q485 / P1-13: lawyers and firms only (the button decides). */}
        <SendToDrafterNotesButton text={text} sourceLabel="باحث المكتبة" isDark={isDark} className="px-1" />
      </div>
      {toast && <span role="status" className="text-[12px] font-semibold" style={{ color: "#C8A762" }}>{toast}</span>}
    </div>
  );
}
