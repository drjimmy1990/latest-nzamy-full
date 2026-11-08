"use client";

/**
 * Letterhead — the official paper of a lawyer or a firm (D4, owner ٢٥٦).
 *
 * REUSABLE: LetterheadSheet wraps ANY printable body with the issuer's header
 * (name, logo, verified licence, contacts) — and nothing of the platform's:
 * owner ruling ٤٤٢(أ) (package 2026-11-06), the paper carries only the
 * office's or the lawyer's own letterhead and logo, never «صادر عبر منصة
 * نظامي», the platform wordmark or a QR. The letter page
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
 * it on every printed page). There is no footer (٤٤٢(أ)).
 */
import type { CSSProperties, ReactNode } from "react";
import type { LetterheadIdentity } from "@/lib/branding/letterheadIdentity";
import { QR_GOLD, QR_GREEN } from "@/lib/qr/brandedQr";

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

/**
 * The A4 sheet: the header repeats on every printed page (<thead>). No
 * platform footer, stamp or QR (owner ٤٤٢(أ)).
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
      <table style={{ width: "100%", borderCollapse: "collapse", flex: "1 0 auto" }}>
        <thead>
          <tr><td style={{ padding: 0 }}><LetterheadHeader identity={identity} /></td></tr>
        </thead>
        <tbody>
          <tr><td style={{ padding: 0, verticalAlign: "top" }}>{children}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
