"use client";

/**
 * Letterhead — the official paper of a lawyer or a firm (D4, owner ٢٥٦).
 *
 * REUSABLE: LetterheadSheet wraps ANY printable body with the issuer's header
 * (name, logo, verified licence, contacts) and the platform's footer stamp
 * («صادر عبر منصة نظامي», the wordmark, the smart QR). The letter page
 * (LetterheadWorkspace) is the first user. Candidates to adopt it later,
 * NOT rewired now: the contract print view (src/app/dashboard/{lawyer,firm}/contracts),
 * the legal-opinion letter (src/app/ai/legal-opinion/_components/LetterWorkflow.tsx),
 * the drafter's output (/ai/draft) and the receipts PDF — each would take its
 * identity from useLetterhead(scope) and put its body inside the sheet.
 *
 * ALWAYS LIGHT, ON SCREEN AND ON PAPER: colours are hex literals in inline
 * styles. Tailwind's gray tokens are remapped under `.dark` (globals.css), and
 * globals.css's print rules force every background transparent and hide
 * <header>/<footer>/<button> — so this file uses none of those: borders, not
 * colour bands; <div>, not <header>/<footer>.
 *
 * MULTI-PAGE: a <table> whose <thead> holds the header (the browser repeats
 * it on every printed page); the footer is fixed to the foot of every page in
 * print, with an empty <tfoot> row reserving its room (SHEET_CSS).
 */
import type { CSSProperties, ReactNode } from "react";
import BrandedQr from "./BrandedQr";
import { PLATFORM_STAMP_AR, type LetterheadIdentity } from "@/lib/branding/letterheadIdentity";
import { QR_GOLD, QR_GREEN, QR_WORDMARK_SRC } from "@/lib/qr/brandedQr";

const INK = "#1F2937";
const MUTED = "#4B5563";
const FONT_BODY = "var(--font-body), 'IBM Plex Sans Arabic', 'Readex Pro', sans-serif";
const FONT_HEADING = "var(--font-heading), 'Cairo', sans-serif";

const CONTACT_LABEL: Record<LetterheadIdentity["contacts"][number]["kind"], string> = {
  address: "العنوان",
  phone: "هاتف",
  email: "بريد",
  website: "موقع",
};

export function LetterheadHeader({ identity }: { identity: LetterheadIdentity }) {
  const name = identity.nameAr || identity.nameEn;
  return (
    <div style={{ paddingBottom: "4mm", marginBottom: "6mm", borderBottom: `1.5pt solid ${identity.accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6mm", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {name ? (
            <div style={{ fontFamily: FONT_HEADING, fontSize: "17pt", fontWeight: 700, color: QR_GREEN, lineHeight: 1.3 }}>{name}</div>
          ) : (
            <div style={{ fontFamily: FONT_HEADING, fontSize: "12pt", color: MUTED }}>اسم المكتب</div>
          )}
          {identity.nameAr && identity.nameEn && (
            <div dir="ltr" style={{ fontSize: "10pt", color: MUTED, textAlign: "right", letterSpacing: "0.02em" }}>{identity.nameEn}</div>
          )}
          {identity.licenceLine && (
            <div style={{ fontSize: "9.5pt", color: INK, marginTop: "1mm" }}>{identity.licenceLine}</div>
          )}
        </div>
        {identity.logoUrl && (
          // A signed URL from the private bucket: a plain <img> (next/image
          // would proxy and cache it past its 10-minute life).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={identity.logoUrl} alt="شعار المكتب" style={{ maxHeight: "22mm", maxWidth: "45mm", objectFit: "contain" }} />
        )}
      </div>
      {identity.contacts.length > 0 && (
        <div style={{ marginTop: "3mm", display: "flex", flexWrap: "wrap", gap: "1mm 5mm", fontSize: "8.5pt", color: MUTED }}>
          {identity.contacts.map((c) => (
            <span key={c.kind}>
              {CONTACT_LABEL[c.kind]}: <span dir={c.ltr ? "ltr" : undefined} style={{ color: INK }}>{c.text}</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: "1.2mm", borderBottom: `0.5pt solid ${QR_GOLD}` }} />
    </div>
  );
}

export function LetterheadFooter({ identity }: { identity: LetterheadIdentity }) {
  return (
    <div style={{ marginTop: "8mm", paddingTop: "3mm", borderTop: `0.5pt solid ${QR_GOLD}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6mm" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={QR_WORDMARK_SRC} alt="نظامي" style={{ height: "12mm", width: "auto" }} />
        <div>
          <div style={{ fontFamily: FONT_HEADING, fontSize: "9.5pt", fontWeight: 700, color: QR_GREEN }}>{PLATFORM_STAMP_AR}</div>
          <div dir="ltr" style={{ fontSize: "8pt", color: MUTED, textAlign: "right" }}>nezamy.sa</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "3mm", maxWidth: "95mm" }}>
        <div style={{ fontSize: "7.5pt", color: MUTED, lineHeight: 1.5 }}>
          <div>{identity.qr.caption}</div>
          <div dir="ltr" style={{ textAlign: "right", color: INK, wordBreak: "break-all" }}>{identity.qr.url.replace(/^https?:\/\//, "")}</div>
        </div>
        <BrandedQr url={identity.qr.url} size="22mm" />
      </div>
    </div>
  );
}

/** Room the fixed print footer takes at the foot of each page (QR 22mm + rule + gap). */
const PRINT_FOOTER_ROOM = "32mm";

// Screen: the footer follows the body and the sheet's min-height pushes it to
// the bottom. Print: it is `position: fixed; bottom: 0`, which the browser
// repeats at the foot of every page, and an empty <tfoot> row of the same
// height keeps the body from running under it.
const SHEET_CSS = `
.nz-letterhead-sheet .nz-lh-foot-room { display: none; }
@media print {
  .nz-letterhead-sheet .nz-lh-foot-room { display: block; height: ${PRINT_FOOTER_ROOM}; }
  .nz-letterhead-sheet .nz-lh-footer { position: fixed; left: 0; right: 0; bottom: 0; background: #FFFFFF; }
  .nz-letterhead-sheet .nz-lh-footer > div { margin-top: 0 !important; }
}
`;

/**
 * The A4 sheet: the header repeats on every printed page (<thead>), the
 * platform footer sits at the foot of every page.
 */
export function LetterheadSheet({
  identity,
  children,
  id,
  style,
}: {
  identity: LetterheadIdentity;
  children: ReactNode;
  id?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      id={id}
      dir="rtl"
      className="nz-letterhead-sheet"
      style={{
        background: "#FFFFFF", color: INK, fontFamily: FONT_BODY, fontSize: "11pt", lineHeight: 1.8,
        display: "flex", flexDirection: "column", boxSizing: "border-box", ...style,
      }}
    >
      <style href="nz-letterhead-sheet" precedence="default">{SHEET_CSS}</style>
      <table style={{ width: "100%", borderCollapse: "collapse", flex: "1 0 auto" }}>
        <thead>
          <tr><td style={{ padding: 0 }}><LetterheadHeader identity={identity} /></td></tr>
        </thead>
        <tfoot>
          <tr><td style={{ padding: 0 }}><div className="nz-lh-foot-room" /></td></tr>
        </tfoot>
        <tbody>
          <tr><td style={{ padding: 0, verticalAlign: "top" }}>{children}</td></tr>
        </tbody>
      </table>
      <div className="nz-lh-footer">
        <LetterheadFooter identity={identity} />
      </div>
    </div>
  );
}
