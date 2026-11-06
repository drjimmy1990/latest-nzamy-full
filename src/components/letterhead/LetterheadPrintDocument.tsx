"use client";

/**
 * LetterheadPrintDocument — q345: a document on the letterhead, for print or Save
 * as PDF. Hidden on screen, alone on paper: its own root under <body>, the same
 * print CSS pattern as LetterheadWorkspace. Mounting it prints it, once the QR
 * and the images are ready or 3 seconds have passed, and it calls onDone after
 * the print dialog closes.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LetterheadIdentity } from "@/lib/branding/letterheadIdentity";
import { waitUntil } from "@/lib/docx/exportPolicy";
import type { DocBlock } from "@/lib/docx/ooxml";
import { QR_WORDMARK_SRC } from "@/lib/qr/brandedQr";
import { LetterheadSheet } from "./Letterhead";

export const EXPORT_PRINT_ROOT_ID = "nz-letterhead-export-print-root";

const PRINT_CSS = `
@page { size: A4; margin: 14mm 16mm 12mm; }
@media screen { #${EXPORT_PRINT_ROOT_ID} { display: none !important; } }
@media print {
  html, body { background: #FFFFFF !important; }
  body > *:not(#${EXPORT_PRINT_ROOT_ID}) { display: none !important; }
  #${EXPORT_PRINT_ROOT_ID} { display: block !important; }
  #${EXPORT_PRINT_ROOT_ID}, #${EXPORT_PRINT_ROOT_ID} * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const READY_TIMEOUT_MS = 3000;

function isSheetReady(root: HTMLElement): boolean {
  const qrDrawn = root.querySelector("svg[role='img']") !== null;
  const imagesDone = Array.from(root.querySelectorAll("img")).every((image) => image.complete);
  return qrDrawn && imagesDone;
}

/** BrandedQr's <image> cannot be watched, so its wordmark is fetched into the cache first. */
const wordmarkLoaded = () =>
  new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = QR_WORDMARK_SRC;
  });

const paragraphStyle = { whiteSpace: "pre-wrap", margin: "0 0 2mm" } as const;
const listStyle = { margin: "0 0 2mm", paddingInlineStart: "7mm" } as const;

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "title":
      return <h1 style={{ fontSize: "15pt", fontWeight: 700, textAlign: "center", margin: "0 0 5mm" }}>{block.text}</h1>;
    case "heading":
      return <h2 style={{ fontSize: "12.5pt", fontWeight: 700, margin: "4mm 0 2mm", breakAfter: "avoid" }}>{block.text}</h2>;
    case "para":
      return <p style={paragraphStyle}>{block.text}</p>;
    case "list":
      return block.ordered ? (
        <ol style={{ ...listStyle, listStyleType: "arabic-indic" }}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ol>
      ) : (
        <ul style={{ ...listStyle, listStyleType: "disc" }}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
      );
    case "signature":
      return <div style={{ marginTop: "10mm" }}>{block.lines.map((line, i) => <p key={i} style={paragraphStyle}>{line}</p>)}</div>;
  }
}

export default function LetterheadPrintDocument({
  identity,
  blocks,
  title,
  onDone,
}: {
  identity: LetterheadIdentity;
  blocks: DocBlock[];
  title: string;
  onDone: () => void;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  useEffect(() => {
    const element = document.createElement("div");
    element.id = EXPORT_PRINT_ROOT_ID;
    document.body.appendChild(element);
    setRoot(element);
    return () => { element.remove(); };
  }, []);

  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    const pageTitle = document.title;
    const closed = () => done.current();
    window.addEventListener("afterprint", closed, { once: true });
    void (async () => {
      await Promise.race([wordmarkLoaded(), new Promise((resolve) => setTimeout(resolve, READY_TIMEOUT_MS))]);
      await waitUntil(() => isSheetReady(root), { timeoutMs: READY_TIMEOUT_MS, intervalMs: 50 });
      if (cancelled) return;
      // The browser offers the page's title as the PDF's name.
      document.title = title;
      window.print();
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", closed);
      document.title = pageTitle;
    };
  }, [root, title]);

  if (!root) return null;
  return createPortal(
    <>
      <style>{PRINT_CSS}</style>
      <LetterheadSheet identity={identity}>
        {blocks.map((block, i) => <Block key={i} block={block} />)}
      </LetterheadSheet>
    </>,
    root,
  );
}
