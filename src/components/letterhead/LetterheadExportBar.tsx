"use client";

/**
 * LetterheadExportBar — q345: a finished AI document, as a real .docx or as print
 * or PDF, on the lawyer's or the firm's letterhead. Costs nothing: the document
 * was paid for when it was written, and the export never leaves the browser
 * except to fetch the logo and the template.
 *
 * Who sees it: letterheadScopesFor. Clients and everyone else get nothing, and
 * keep the buttons the tools already had. The firm scope is offered to a lawyer
 * only when GET /api/v1/branding?scope=firm answers permissions.print (R32); the
 * server applies that same gate again to each read.
 */
import { useEffect, useMemo, useState } from "react";
import { FileDoc, Printer, SpinnerGap, Warning, Info } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { stripCitationMarkers } from "@/lib/ai/citationMarkers";
import type { BrandingScope } from "@/lib/branding/brandingVault";
import { exportableBlocks, letterheadScopesFor } from "@/lib/docx/exportPolicy";
import type { DocBlock } from "@/lib/docx/ooxml";
import LetterheadPrintDocument from "./LetterheadPrintDocument";
import { useLetterhead } from "./useLetterhead";

const SCOPE_LABEL: Record<BrandingScope, string> = { lawyer: "ورقي الشخصي", firm: "ورق المكتب" };

interface BarProps {
  title: string;
  blocks: DocBlock[];
  filename: string;
}

function ExportButtons({ scope, scopes, onScope, title, blocks, filename }: BarProps & {
  scope: BrandingScope;
  scopes: BrandingScope[];
  onScope: (scope: BrandingScope) => void;
}) {
  const { isDark } = useTheme();
  const { state, identityFor } = useLetterhead(scope);
  const identity = identityFor();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // A count, not a flag: some browsers never fire afterprint, and the next click must still print.
  const [printRun, setPrintRun] = useState(0);
  const safe = useMemo(() => exportableBlocks(blocks), [blocks]);

  // Not signed in, no print permission, or no firm: nothing to offer.
  if (state.status === "error" && [401, 403, 404].includes(state.httpStatus)) return null;

  const data = state.status === "ready" ? state.data : null;
  const disabled = !identity || safe.length === 0;
  const button = `flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold disabled:opacity-50 ${isDark ? "border-white/[0.07] text-zinc-300" : "border-zinc-200 text-zinc-600"}`;
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";

  async function downloadWord() {
    if (!identity || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { downloadDocx } = await import("./exportKit");
      const { note } = await downloadDocx({ scope, blocks: safe, identity, docxUrl: data?.letterheadDocxUrl ?? null, filename });
      setMessage(note);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذّر إنشاء ملف Word — انسخ النص");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-1.5" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        {scopes.length === 2 && (
          <select
            value={scope}
            onChange={(e) => onScope(e.target.value as BrandingScope)}
            aria-label="ورق أي جهة"
            className={`rounded-xl border px-2 py-2 text-[12px] font-semibold ${isDark ? "border-white/[0.07] bg-zinc-900 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}
          >
            {scopes.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
          </select>
        )}
        <button type="button" onClick={() => void downloadWord()} disabled={disabled || busy} className={button}>
          {busy ? <SpinnerGap size={14} className="animate-spin" /> : <FileDoc size={14} />} Word على الورق الرسمي (.docx)
        </button>
        <button type="button" onClick={() => setPrintRun((n) => n + 1)} disabled={disabled} className={button}>
          <Printer size={14} /> طباعة / حفظ PDF على الورق الرسمي
        </button>
      </div>
      {state.status === "error" && (
        <p className={`flex items-center gap-1 text-[11px] ${muted}`}><Warning size={12} /> {state.message}</p>
      )}
      {data?.hasLetterheadPdf && (
        <p className={`flex items-center gap-1 text-[11px] ${muted}`}><Info size={12} /> ملف PDF المرفوع لا يُدمج؛ تُطبع ترويسة الهوية</p>
      )}
      {message && <p className={`flex items-center gap-1 text-[11px] ${muted}`} role="status"><Warning size={12} /> {message}</p>}
      {printRun > 0 && identity && (
        <LetterheadPrintDocument key={printRun} identity={identity} blocks={safe} title={stripCitationMarkers(title).trim()} onDone={() => setPrintRun(0)} />
      )}
    </div>
  );
}

export default function LetterheadExportBar(props: BarProps) {
  const { userType, affiliation, loading, isLoggedIn } = useUser();
  const [firmPrint, setFirmPrint] = useState(false);
  const [chosen, setChosen] = useState<BrandingScope>("lawyer");

  const firmMember = !loading && isLoggedIn && userType === "lawyer" && affiliation?.entityType === "firm";
  useEffect(() => {
    if (!firmMember) return;
    let cancelled = false;
    fetch("/api/v1/branding?scope=firm", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { permissions?: { print?: boolean } } | null) => { if (!cancelled) setFirmPrint(body?.permissions?.print === true); })
      .catch(() => { if (!cancelled) setFirmPrint(false); });
    return () => { cancelled = true; };
  }, [firmMember]);

  if (loading || !isLoggedIn) return null;
  const scopes = letterheadScopesFor({ userType, affiliation }, firmPrint);
  if (scopes.length === 0) return null;
  const scope = scopes.includes(chosen) ? chosen : scopes[0];
  return <ExportButtons key={scope} scope={scope} scopes={scopes} onScope={setChosen} {...props} />;
}
