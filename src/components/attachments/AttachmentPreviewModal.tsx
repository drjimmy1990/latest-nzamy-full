"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Spinner, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import type { PreviewBody } from "@/lib/attachments/previewServe";

/**
 * «معاينة»: a look at an uploaded file before sending it (owner screenshot 13).
 * It reads only through GET /api/v1/documents/<id>/preview, so it shows a file
 * only to someone who could already read it. It renders the reply's `kind` and
 * does not work the kind out itself (that rule pulls fflate into a bundle).
 *
 * A browser or a server header can refuse a PDF inside a frame, and a frame gives
 * no signal when it does, so a PDF always has the plain link beside it.
 */

type LoadState = { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; body: PreviewBody };

const FOCUSABLE = 'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

function noneCopy(reason: "too_large" | "unreadable" | undefined): string {
  if (reason === "too_large") return "هذا الملف أكبر من أن يُعاين هنا";
  if (reason === "unreadable") return "تعذّر قراءة نص هذا الملف (قد يكون تالفاً)";
  return "لا تتوفر معاينة لهذا النوع من الملفات";
}

function errorCopy(status: number): string {
  if (status === 401) return "انتهت جلستك — يرجى تسجيل الدخول مجدداً";
  if (status === 404) return "الملف غير موجود";
  return "تعذّرت معاينة الملف الآن — حاول بعد قليل";
}

export function AttachmentPreviewModal({ documentId, name, onClose }: { documentId: string; name: string; onClose: () => void }) {
  const { isDark } = useTheme();
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/documents/${encodeURIComponent(documentId)}/preview`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) { setState({ phase: "error", message: errorCopy(res.status) }); return; }
        setState({ phase: "ready", body: (await res.json()) as PreviewBody });
      })
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name !== "AbortError") setState({ phase: "error", message: errorCopy(0) });
      });
    return () => controller.abort();
  }, [documentId]);

  // Focus moves in, and goes back to the button that opened it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);

  // Capture phase: a wizard behind this dialog must not take the same Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) { e.preventDefault(); root.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const body = state.phase === "ready" ? state.body : null;

  return createPortal(
    // Stops here: React events cross a portal, and the chips sit inside dropzones.
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4" dir="rtl"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`معاينة ${name}`} tabIndex={-1}
        className={`flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border shadow-2xl outline-none ${isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-200" : "border-zinc-200 bg-white text-zinc-800"}`}>
        <div className={`flex items-center gap-3 border-b px-4 py-3 ${isDark ? "border-white/[0.07]" : "border-zinc-200"}`}>
          <p className="min-w-0 flex-1 truncate text-[13px] font-bold">{name}</p>
          <button type="button" onClick={onClose} aria-label="إغلاق المعاينة"
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${isDark ? "text-zinc-400 hover:bg-white/[0.07]" : "text-zinc-500 hover:bg-zinc-100"}`}>
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {state.phase === "loading" && (
            <p role="status" className={`flex items-center justify-center gap-2 py-12 text-[12px] ${muted}`}>
              <Spinner size={14} className="animate-spin" /> جارٍ تحميل المعاينة…
            </p>
          )}
          {state.phase === "error" && <p role="alert" className="py-12 text-center text-[12px] text-red-500">{state.message}</p>}
          {body?.kind === "pdf" && (
            <div className="space-y-2">
              <iframe title={name} src={body.url} className={`h-[70vh] w-full rounded-xl border ${isDark ? "border-white/[0.07]" : "border-zinc-200"}`} />
              <a href={body.url} target="_blank" rel="noopener noreferrer" className={`text-[11px] font-bold underline ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                لا يظهر الملف؟ افتحه في نافذة جديدة
              </a>
            </div>
          )}
          {body?.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- a five-minute signed URL from a private bucket; next/image has nothing to optimise
            <img src={body.url} alt={name} className="mx-auto max-h-[70vh] max-w-full rounded-xl object-contain" />
          )}
          {body?.kind === "text" && (
            <div className="space-y-2">
              {body.truncated && <p className={`text-[11px] ${muted}`}>يُعرض أول ٢٠٬٠٠٠ حرف</p>}
              <pre dir="auto" className={`whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.9] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{body.text}</pre>
            </div>
          )}
          {body?.kind === "none" && <p className={`py-12 text-center text-[12px] ${muted}`}>{noneCopy(body.reason)}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The eye on an uploaded file's chip. Its click never reaches a dropzone behind it. */
export function AttachmentPreviewButton({ documentId, name, size = 13, className }: { documentId: string; name: string; size?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={`معاينة ${name}`} title="معاينة"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`flex-shrink-0 ${className ?? "text-[#C8A762]"}`}>
        <Eye size={size} />
      </button>
      {open && <AttachmentPreviewModal documentId={documentId} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
