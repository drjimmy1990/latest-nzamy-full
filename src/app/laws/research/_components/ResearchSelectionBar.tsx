"use client";

/**
 * The V3 selection toolbar: select words of an answer and two questions appear
 * — «اسأل عن الجزئية» and «الدفوع المضادة». Each only FILLS the question box
 * (nothing is sent or charged until the reader presses send). The prototype's
 * «علّق / عدّل» (rewriting the answer) and «استمع للفقرة» (phase C) are not
 * offered: the assistant answers research questions, it does not edit text.
 */
import { useEffect, useState, type RefObject } from "react";
import { selectionPrompts } from "./researchPrompts";

export function ResearchSelectionBar({ containerRef, onPrefill }: { containerRef: RefObject<HTMLElement | null>; onPrefill: (text: string) => void }) {
  const [bar, setBar] = useState<{ top: number; left: number; text: string } | null>(null);

  useEffect(() => {
    // Listening on the document: the thread may mount after this (the /laws tab
    // renders it only once a question is asked), so the container is read per event.
    const read = () => {
      const root = containerRef.current;
      if (!root) return setBar(null);
      const sel = window.getSelection();
      const text = sel ? sel.toString() : "";
      if (!sel || sel.rangeCount === 0 || !selectionPrompts(text)) return setBar(null);
      const range = sel.getRangeAt(0);
      // Only a selection inside an answer (never the question box or the sidebar).
      const node = range.commonAncestorContainer;
      const el = node instanceof Element ? node : node.parentElement;
      if (!el || !root.contains(el) || !el.closest('[data-research="answer"]')) return setBar(null);
      const r = range.getBoundingClientRect();
      setBar({ top: Math.max(8, r.top - 46), left: Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)), text });
    };
    const onUp = () => window.setTimeout(read, 0);
    const hide = () => setBar(null);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      window.removeEventListener("scroll", hide, true);
    };
  }, [containerRef]);

  const prompts = bar ? selectionPrompts(bar.text) : null;
  if (!bar || !prompts) return null;
  const pick = (text: string) => {
    onPrefill(text);
    window.getSelection()?.removeAllRanges();
    setBar(null);
  };
  const btn = "rounded-lg px-2.5 py-1 transition-transform hover:bg-white/10 motion-safe:active:scale-[0.96]";
  return (
    <div
      role="toolbar"
      aria-label="أسئلة عن النص المظلّل"
      dir="rtl"
      className="fixed z-[60] flex -translate-x-1/2 items-center gap-1 rounded-xl border px-1.5 py-1 text-[12px] font-semibold text-white shadow-xl"
      style={{ top: bar.top, left: bar.left, background: "#0B3D2E", borderColor: "rgba(200,167,98,0.55)" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className={btn} onClick={() => pick(prompts.ask)}>اسأل عن الجزئية</button>
      <span className="opacity-25" aria-hidden="true">|</span>
      <button type="button" className={btn} onClick={() => pick(prompts.counter)} style={{ color: "#C8A762" }}>الدفوع المضادة</button>
    </div>
  );
}
