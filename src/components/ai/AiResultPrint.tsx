"use client";

/**
 * AiResultPrint — N01-21/22/23 (batch l11): an AI result alone on paper, for
 * «طباعة / حفظ PDF» on the result bar. The same pattern as the letterhead print
 * (LetterheadPrintDocument): its own root under <body>, hidden on screen, the
 * only thing printed; mounting it prints once, and onDone runs after the print
 * dialog closes. No letterhead, no logo, no platform stamp (owner ٤٤٢(أ)):
 * nothing to wait for. The browser's «حفظ بصيغة PDF» in that dialog is the PDF.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Block } from "@/components/letterhead/LetterheadPrintDocument";
import { exportableBlocks } from "@/lib/docx/exportPolicy";
import { resultBlocks } from "@/lib/docx/plainDocx";

export const AI_PRINT_ROOT_ID = "nz-ai-result-print-root";

const PRINT_CSS = `
@page { size: A4; margin: 18mm 18mm 16mm; }
@media screen { #${AI_PRINT_ROOT_ID} { display: none !important; } }
@media print {
  html, body { background: #FFFFFF !important; }
  body > *:not(#${AI_PRINT_ROOT_ID}) { display: none !important; }
  #${AI_PRINT_ROOT_ID} { display: block !important; color: #111111; font-size: 12pt; line-height: 1.9; direction: rtl; text-align: justify; }
}
`;

export default function AiResultPrint({ text, title, onDone }: { text: string; title: string; onDone: () => void }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  useEffect(() => {
    const element = document.createElement("div");
    element.id = AI_PRINT_ROOT_ID;
    element.dir = "rtl";
    document.body.appendChild(element);
    setRoot(element);
    return () => { element.remove(); };
  }, []);

  useEffect(() => {
    if (!root) return;
    const pageTitle = document.title;
    const closed = () => done.current();
    window.addEventListener("afterprint", closed, { once: true });
    // One frame so the portal is painted before the dialog snapshots the page.
    const frame = window.requestAnimationFrame(() => {
      // The browser offers the page's title as the PDF's name.
      document.title = title;
      window.print();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", closed);
      document.title = pageTitle;
    };
  }, [root, title]);

  if (!root) return null;
  const blocks = exportableBlocks(resultBlocks(text, title));
  return createPortal(
    <>
      <style>{PRINT_CSS}</style>
      <div>
        {blocks.map((block, i) => <Block key={i} block={block} />)}
      </div>
    </>,
    root,
  );
}
