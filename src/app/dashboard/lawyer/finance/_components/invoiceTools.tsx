"use client";

/**
 * invoiceTools.tsx — the fee-statement tools of /dashboard/lawyer/finance
 * (owner TODO 17-Nov N01-11..N01-14). Kept out of page.tsx so the page only
 * wires them in:
 *
 *   useIssuerVat / IssuerVatCard  N01-11 (Q484): who issues and whether VAT
 *                                 applies — the SQL's own answer
 *                                 (GET /api/v1/lawyer/finance/issuer); an
 *                                 individual lawyer saves his VAT number here.
 *   VatPreview / InvoiceVatLine   subtotal / VAT / total, in the form and on
 *                                 each statement.
 *   InvoicePrintDocument          N01-12: the statement on the issuer's
 *                                 letterhead, «طباعة / حفظ PDF» through the
 *                                 browser. No QR and no platform stamp on the
 *                                 paper (owner ٤٤٢(أ), newer than the verify
 *                                 card of q343).
 *   InvoiceRowActions             print · send to the client (N01-13 — no
 *                                 payment link exists: offices are paid
 *                                 directly) · void with a reason (N01-14).
 *   VoidedInvoicesList            voided statements, kept and shown apart —
 *                                 never in a total.
 *
 * Colours: dark-mode safe (no light-gray 100/200 text classes — globals.css
 * turns gray-50/100/200 into dark surfaces). The printed sheet is always light,
 * with inline hex colours, like LetterheadSheet.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer, PaperPlaneTilt, Prohibit, Copy, Warning, X, CheckCircle, Receipt } from "@phosphor-icons/react";
import { LetterheadSheet } from "@/components/letterhead/Letterhead";
import { buildLetterheadIdentity, letterheadOrigin, type BrandingResponse, type LetterheadIdentity } from "@/lib/branding/letterheadIdentity";
import { waitUntil } from "@/lib/docx/exportPolicy";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import {
  computeInvoiceVat,
  formatSar,
  riyalsToHalalas,
  VAT_LEGACY_AR,
  VAT_LINE_AR,
  VAT_NOT_SUBJECT_AR,
  type InvoiceVatSnapshot,
} from "@/lib/finance/invoiceVat";
import { FEE_STATEMENT_LABEL_AR, PAY_DIRECTLY_AR, statementReference } from "@/lib/finance/invoiceMessage";
import { toLatinDigits } from "@/lib/forms/latinDigits";

// ─── types ─────────────────────────────────────────────────────────────────

/** The invoice shape GET /api/v1/lawyer/finance emits (the fields used here). */
export interface FinanceInvoice {
  id: string;
  client: string;
  caseTitle: string;
  contractTitle?: string | null;
  desc: string;
  totalFee: number;
  paidAmount: number;
  status: string;
  date: string;
  vat?: InvoiceVatSnapshot | null;
  voidReason?: string;
  voidedDate?: string;
}

export type IssuerState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string }
  | {
      status: "ready";
      scope: "lawyer" | "firm";
      name: string;
      state: "registered" | "not_registered" | "invalid";
      vatNumber: string | null;
      editable: boolean;
    };

const halalasOf = (riyals: number) => Math.round((Number(riyals) || 0) * 100);

// ─── N01-11 — the issuer and its VAT state ────────────────────────────────

export function useIssuerVat() {
  const [issuer, setIssuer] = useState<IssuerState>({ status: "loading" });
  const load = useCallback(async () => {
    if (!isSupabaseMode) {
      setIssuer({ status: "unavailable", message: "احتساب الضريبة يعمل على الحساب الحقيقي فقط." });
      return;
    }
    try {
      const r = await apiGet<Record<string, unknown>>("/api/v1/lawyer/finance/issuer");
      if (r?.available === false) {
        setIssuer({ status: "unavailable", message: String(r.message ?? "") });
        return;
      }
      setIssuer({
        status: "ready",
        scope: r.scope === "firm" ? "firm" : "lawyer",
        name: typeof r.name === "string" ? r.name : "",
        state: r.state === "registered" || r.state === "invalid" ? r.state : "not_registered",
        vatNumber: typeof r.vatNumber === "string" ? r.vatNumber : null,
        editable: r.editable === true,
      });
    } catch (e) {
      setIssuer({ status: "error", message: e instanceof Error ? e.message : "تعذّرت قراءة بيانات جهة الإصدار" });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { issuer, reload: load };
}

export function IssuerVatCard({ issuer, onSaved, isDark }: { issuer: IssuerState; onSaved: () => void; isDark: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const box = `rounded-2xl border p-4 text-right ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`;
  if (issuer.status === "loading") {
    return <div className={box}><p className="text-[11px] text-slate-500 dark:text-zinc-400">جارٍ التحقق من الرقم الضريبي لجهة الإصدار…</p></div>;
  }
  if (issuer.status !== "ready") {
    return (
      <div className={box}>
        <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">{issuer.message || "تعذّرت قراءة بيانات جهة الإصدار"}</p>
      </div>
    );
  }

  const save = async (next: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiMutate("/api/v1/lawyer/finance/issuer", "PUT", { vatNumber: next });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر حفظ الرقم الضريبي");
    } finally {
      setBusy(false);
    }
  };

  const who = issuer.scope === "firm" ? `المكتب (${issuer.name || "مكتبك"})` : issuer.name || "أنت";
  return (
    <section aria-label="الرقم الضريبي لجهة إصدار بيانات الأتعاب" className={box}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[12px] font-black text-slate-800 dark:text-zinc-100">
            جهة الإصدار: {who}
          </p>
          {issuer.state === "registered" && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
              الرقم الضريبي <span dir="ltr" className="font-mono">{issuer.vatNumber}</span> — تُضاف {VAT_LINE_AR} إلى كل بيان أتعاب جديد.
            </p>
          )}
          {issuer.state === "not_registered" && (
            <p className="text-[11px] text-slate-600 dark:text-zinc-400 font-bold">
              لا يوجد رقم ضريبي مسجّل، فتصدر البيانات الجديدة «{VAT_NOT_SUBJECT_AR}» (٠٪).
            </p>
          )}
          {issuer.state === "invalid" && (
            <p className="text-[11px] text-red-700 dark:text-red-400 font-bold">
              الرقم الضريبي المسجّل غير صحيح (١٥ رقماً يبدأ وينتهي بالرقم ٣)، فلن يصدر أي بيان أتعاب حتى يُصحَّح.
            </p>
          )}
          {issuer.scope === "firm" && (
            <p className="text-[10px] text-slate-500 dark:text-zinc-500">
              بياناتك تصدر باسم المكتب؛ رقمه الضريبي يُعدَّل من الإعدادات ← «إعدادات الكيان».
            </p>
          )}
        </div>
        {issuer.editable && !editing && (
          <button
            type="button"
            onClick={() => { setValue(issuer.vatNumber ?? ""); setError(null); setEditing(true); }}
            className="self-start sm:self-center px-3 py-2 rounded-xl text-[11px] font-black border border-[#C8A762]/40 text-[#8a6d2c] dark:text-[#C8A762] hover:bg-[#C8A762]/10"
          >
            {issuer.vatNumber ? "تعديل الرقم الضريبي" : "إضافة رقم ضريبي"}
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <label htmlFor="issuer-vat" className="sr-only">الرقم الضريبي</label>
          <input
            id="issuer-vat"
            dir="ltr"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(toLatinDigits(e.target.value))}
            placeholder="3XXXXXXXXXXXXX3"
            className={`flex-1 rounded-xl border px-3 py-2 text-[12px] font-mono outline-none focus:border-[#C8A762]/50 ${isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"}`}
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => save(value)}
              className="px-4 py-2 rounded-xl text-[11px] font-black bg-[#0B3D2E] text-white disabled:opacity-60">
              {busy ? "جارٍ الحفظ…" : "حفظ"}
            </button>
            {issuer.vatNumber && (
              <button type="button" disabled={busy} onClick={() => save("")}
                className="px-3 py-2 rounded-xl text-[11px] font-black border border-red-300 text-red-700 dark:border-red-500/30 dark:text-red-400 disabled:opacity-60">
                حذف الرقم
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setEditing(false)}
              className="px-3 py-2 rounded-xl text-[11px] font-black border border-slate-300 text-slate-600 dark:border-zinc-700 dark:text-zinc-400">
              إلغاء
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[11px] font-bold text-red-700 dark:text-red-400">{error}</p>}
      <p className="mt-2 text-[10px] text-slate-500 dark:text-zinc-500">
        تغيير الرقم لا يغيّر بيانات الأتعاب الصادرة قبله: كل بيان يحفظ نسبة الضريبة والرقم وقت إصداره.
      </p>
    </section>
  );
}

/** Under the fee input: what the statement will say, from the same SQL answer. */
export function VatPreview({ feeText, issuer }: { feeText: string; issuer: IssuerState }) {
  if (issuer.status !== "ready") return null;
  if (issuer.state === "invalid") {
    return (
      <p className="text-[11px] font-bold text-red-700 dark:text-red-400">
        لن يصدر البيان: الرقم الضريبي المسجّل لجهة الإصدار غير صحيح. صحّحه أولاً.
      </p>
    );
  }
  const sub = riyalsToHalalas(feeText);
  const a = sub === null ? null : computeInvoiceVat(sub, issuer.state === "registered");
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] px-4 py-3 text-[11px] space-y-1">
      <Row k="الأتعاب قبل الضريبة" v={a ? formatSar(a.subtotalHalalas) : "—"} />
      <Row
        k={issuer.state === "registered" ? VAT_LINE_AR : "ضريبة القيمة المضافة"}
        v={issuer.state === "registered" ? (a ? formatSar(a.vatHalalas) : "—") : VAT_NOT_SUBJECT_AR}
      />
      <Row k="الإجمالي المستحق على الموكّل" v={a ? formatSar(a.totalHalalas) : "—"} strong />
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-black text-slate-800 dark:text-zinc-100" : "font-semibold text-slate-600 dark:text-zinc-400"}`}>
      <span>{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

/** One line under a statement in the list. */
export function InvoiceVatLine({ inv }: { inv: FinanceInvoice }) {
  const v = inv.vat;
  if (!v) return null;
  return (
    <p className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400">
      {v.rateBp > 0
        ? `الأتعاب ${formatSar(v.subtotalHalalas)} + ${VAT_LINE_AR} ${formatSar(v.vatHalalas)}`
        : `الأتعاب ${formatSar(v.subtotalHalalas)} — ${VAT_NOT_SUBJECT_AR}`}
    </p>
  );
}

// ─── N01-12 — print / save as PDF on the letterhead ───────────────────────

export const INVOICE_PRINT_ROOT_ID = "nz-invoice-print-root";

const PRINT_CSS = `
@page { size: A4; margin: 14mm 16mm 12mm; }
@media screen { #${INVOICE_PRINT_ROOT_ID} { display: none !important; } }
@media print {
  html, body { background: #FFFFFF !important; }
  body > *:not(#${INVOICE_PRINT_ROOT_ID}) { display: none !important; }
  #${INVOICE_PRINT_ROOT_ID} { display: block !important; }
  #${INVOICE_PRINT_ROOT_ID}, #${INVOICE_PRINT_ROOT_ID} * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const INK = "#1F2937";
const MUTED = "#4B5563";
const LINE = "#D1D5DB";

/** The issuer's letterhead identity, or a plain one (name only) when it cannot be read. */
async function loadIdentity(scope: "lawyer" | "firm", fallbackName: string): Promise<LetterheadIdentity> {
  const origin = letterheadOrigin(process.env.NEXT_PUBLIC_SITE_URL, window.location.origin);
  const plain: LetterheadIdentity = {
    nameAr: fallbackName,
    nameEn: "",
    licenceLine: null,
    contacts: [],
    logoUrl: null,
    accent: "#C8A762",
    qr: { kind: "platform", url: origin, caption: "", reason: "unknown" },
  };
  try {
    const res = await fetch(`/api/v1/branding?scope=${scope}`, { cache: "no-store" });
    if (!res.ok) return plain;
    const body = (await res.json()) as BrandingResponse;
    if (!body?.fields) return plain;
    const identity = buildLetterheadIdentity(body, origin);
    return identity.nameAr || identity.nameEn ? identity : { ...identity, nameAr: fallbackName };
  } catch {
    return plain;
  }
}

function SheetRow({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <tr>
      <td style={{ padding: "2mm 3mm", borderBottom: `0.5pt solid ${LINE}`, color: strong ? INK : MUTED, fontWeight: strong ? 700 : 400 }}>{k}</td>
      <td style={{ padding: "2mm 3mm", borderBottom: `0.5pt solid ${LINE}`, textAlign: "left", color: INK, fontWeight: strong ? 700 : 400, whiteSpace: "nowrap" }}>{v}</td>
    </tr>
  );
}

export function InvoiceSheetBody({ inv }: { inv: FinanceInvoice }) {
  const total = halalasOf(inv.totalFee);
  const paid = halalasOf(inv.paidAmount);
  const v = inv.vat ?? null;
  // Only the number snapshotted at issue time; a statement from before VAT shows none.
  const vatNumber = v?.vatNumber ?? null;
  const isVoid = inv.status === "void";
  return (
    <div style={{ position: "relative" }}>
      {isVoid && (
        <div aria-hidden="true" style={{ position: "absolute", top: "40mm", left: 0, right: 0, textAlign: "center", fontSize: "60pt", fontWeight: 800, color: "rgba(185,28,28,0.15)", transform: "rotate(-18deg)" }}>
          ملغى
        </div>
      )}
      <h1 style={{ fontSize: "16pt", fontWeight: 700, textAlign: "center", margin: "0 0 1mm" }}>بيان أتعاب</h1>
      <p style={{ textAlign: "center", fontSize: "9pt", color: MUTED, margin: "0 0 5mm" }}>{FEE_STATEMENT_LABEL_AR}</p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5pt", marginBottom: "5mm" }}>
        <tbody>
          <SheetRow k="المرجع" v={<span dir="ltr">{statementReference(inv.id)}</span>} />
          <SheetRow k="التاريخ" v={inv.date} />
          <SheetRow k="الموكّل" v={inv.client} />
          {inv.caseTitle && inv.caseTitle !== "—" && <SheetRow k="القضية" v={inv.caseTitle} />}
          {inv.contractTitle && <SheetRow k="العقد" v={inv.contractTitle} />}
          {vatNumber && <SheetRow k="الرقم الضريبي للمُصدِر" v={<span dir="ltr">{vatNumber}</span>} />}
        </tbody>
      </table>

      <p style={{ margin: "0 0 2mm", fontWeight: 700 }}>البيان</p>
      <p style={{ margin: "0 0 5mm", whiteSpace: "pre-wrap" }}>{inv.desc}</p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt" }}>
        <tbody>
          {v ? (
            <>
              <SheetRow k="الأتعاب (قبل الضريبة)" v={formatSar(v.subtotalHalalas)} />
              <SheetRow k={v.rateBp > 0 ? VAT_LINE_AR : "ضريبة القيمة المضافة"} v={v.rateBp > 0 ? formatSar(v.vatHalalas) : VAT_NOT_SUBJECT_AR} />
            </>
          ) : null}
          <SheetRow k="الإجمالي" v={formatSar(total)} strong />
          {!isVoid && paid > 0 && <SheetRow k="المحصّل" v={formatSar(paid)} />}
          {!isVoid && <SheetRow k="المتبقي" v={formatSar(Math.max(0, total - paid))} strong />}
        </tbody>
      </table>
      {!v && <p style={{ fontSize: "8.5pt", color: MUTED, margin: "2mm 0 0" }}>{VAT_LEGACY_AR}.</p>}

      {isVoid ? (
        <p style={{ marginTop: "6mm", color: "#B91C1C", fontWeight: 700 }}>
          أُلغي هذا البيان{inv.voidedDate ? ` في ${inv.voidedDate}` : ""} — السبب: {inv.voidReason}
        </p>
      ) : (
        <p style={{ marginTop: "6mm", fontSize: "9.5pt", color: MUTED }}>{PAY_DIRECTLY_AR}</p>
      )}
    </div>
  );
}

/**
 * Mounting it prints the statement once the letterhead (and its logo) is
 * ready; onDone runs when the print dialog closes. «حفظ PDF» is the browser's
 * own «Save as PDF» destination — no server PDF.
 */
export function InvoicePrintDocument({
  inv,
  scope,
  issuerName,
  onDone,
}: {
  inv: FinanceInvoice;
  scope: "lawyer" | "firm";
  issuerName: string;
  onDone: () => void;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [identity, setIdentity] = useState<LetterheadIdentity | null>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  useEffect(() => {
    const el = document.createElement("div");
    el.id = INVOICE_PRINT_ROOT_ID;
    document.body.appendChild(el);
    setRoot(el);
    return () => { el.remove(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadIdentity(scope, inv.vat?.issuerName || issuerName).then((id) => { if (!cancelled) setIdentity(id); });
    return () => { cancelled = true; };
  }, [scope, issuerName, inv.vat?.issuerName]);

  useEffect(() => {
    if (!root || !identity) return;
    let cancelled = false;
    const pageTitle = document.title;
    const closed = () => done.current();
    window.addEventListener("afterprint", closed, { once: true });
    void (async () => {
      await waitUntil(
        () => Array.from(root.querySelectorAll("img")).every((img) => img.complete),
        { timeoutMs: 3000, intervalMs: 50 },
      );
      if (cancelled) return;
      document.title = `بيان أتعاب ${statementReference(inv.id)}`;
      window.print();
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", closed);
      document.title = pageTitle;
    };
  }, [root, identity, inv.id]);

  if (!root || !identity) return null;
  return createPortal(
    <>
      <style>{PRINT_CSS}</style>
      <LetterheadSheet identity={identity}>
        <InvoiceSheetBody inv={inv} />
      </LetterheadSheet>
    </>,
    root,
  );
}

// ─── row actions: print · send · void ─────────────────────────────────────

/** N01-14: only an open statement with nothing collected may be voided. */
export const isVoidable = (inv: FinanceInvoice) => inv.status === "pending" && (Number(inv.paidAmount) || 0) === 0;
/** N01-13: only an open statement is sent. */
export const isSendable = (inv: FinanceInvoice) => inv.status === "pending" || inv.status === "partial";

type SendResult = { text: string; notified: boolean; notifySkipped: string | null; email: string };

function sendSummaryAr(r: SendResult, copied: boolean): string {
  const parts: string[] = [];
  parts.push(copied ? "نُسخ نص البيان — الصقه في واتساب أو أي قناة تتواصل بها مع الموكّل." : "انسخ نص البيان أدناه وأرسله للموكّل.");
  if (r.notified) parts.push("وصل إشعار داخل المنصة إلى حساب الموكّل.");
  else if (r.notifySkipped === "recent") parts.push("أُرسل إشعار المنصة قبل دقائق، فلم يُكرَّر.");
  else if (r.notifySkipped === "no_account") parts.push("بطاقة الموكّل غير مرتبطة بحساب على المنصة، فلم يُرسل إشعار داخلي.");
  else if (r.notifySkipped === "not_linked") parts.push("الحساب المربوط ببطاقة الموكّل لم يطلب منك خدمة على المنصة، فلم يُرسل إشعار داخلي.");
  else if (r.notifySkipped === "failed") parts.push("تعذّر إرسال إشعار المنصة.");
  if (r.email === "sent") parts.push("أُرسل البيان إلى بريد الموكّل.");
  else if (r.email === "unavailable") parts.push("البريد الإلكتروني غير مفعّل على المنصة بعد، فلم يُرسل بريد.");
  else if (r.email === "failed") parts.push("تعذّر إرسال البريد الإلكتروني.");
  else if (r.email === "sunk") parts.push("حساب اختبار: لم يُرسل بريد حقيقي، وحُفظت الرسالة في صندوق بريد الاختبار.");
  else parts.push("لا يوجد بريد إلكتروني في بطاقة الموكّل.");
  return parts.join(" ");
}

export function InvoiceRowActions({
  inv,
  onPrint,
  onVoided,
  isDark,
}: {
  inv: FinanceInvoice;
  onPrint: (inv: FinanceInvoice) => void;
  onVoided: () => void;
  isDark: boolean;
}) {
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"void" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ summary: string; text: string } | null>(null);

  const btn = `flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border transition-all cursor-pointer disabled:opacity-60 ${
    isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
  }`;

  const send = async () => {
    setBusy("send");
    setError(null);
    setSent(null);
    try {
      const r = await apiMutate<SendResult>(`/api/v1/lawyer/finance/${encodeURIComponent(inv.id)}/send`, "POST", {});
      let copied = false;
      try {
        await navigator.clipboard.writeText(r.text);
        copied = true;
      } catch { /* the text is shown below instead */ }
      setSent({ summary: sendSummaryAr(r, copied), text: r.text });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إرسال البيان");
    } finally {
      setBusy(null);
    }
  };

  const doVoid = async () => {
    setBusy("void");
    setError(null);
    try {
      await apiMutate(`/api/v1/lawyer/finance/${encodeURIComponent(inv.id)}/void`, "POST", { reason });
      setVoidOpen(false);
      setReason("");
      onVoided();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إلغاء البيان");
    } finally {
      setBusy(null);
    }
  };

  const reasonOk = reason.replace(/\s+/g, " ").trim().length >= 3 && reason.trim().length <= 500;

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className={btn} onClick={() => onPrint(inv)} aria-label={`طباعة بيان أتعاب ${inv.client} أو حفظه PDF`}>
          <Printer size={12} /> طباعة / حفظ PDF
        </button>
        {isSendable(inv) && (
          <button type="button" className={btn} disabled={busy !== null} onClick={send} aria-label={`إرسال بيان أتعاب ${inv.client} للموكّل`}>
            <PaperPlaneTilt size={12} /> {busy === "send" ? "جارٍ الإرسال…" : "إرسال البيان للموكّل"}
          </button>
        )}
        {isVoidable(inv) && !voidOpen && (
          <button type="button" className={`${btn} ${isDark ? "!text-red-400" : "!text-red-700"}`} onClick={() => { setVoidOpen(true); setError(null); }}
            aria-label={`إلغاء بيان أتعاب ${inv.client}`}>
            <Prohibit size={12} /> إلغاء البيان
          </button>
        )}
      </div>

      {voidOpen && (
        <div className={`rounded-2xl border p-3 space-y-2 ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
          <label htmlFor={`void-${inv.id}`} className="block text-[11px] font-bold text-red-800 dark:text-red-300">
            سبب إلغاء البيان (إلزامي) — يبقى البيان محفوظاً بحالة «ملغى» ولا يدخل في أي مجموع:
          </label>
          <textarea
            id={`void-${inv.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            className={`w-full rounded-xl border px-3 py-2 text-[12px] outline-none resize-none ${isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-200" : "border-red-200 bg-white text-slate-700"}`}
            placeholder="مثال: صدر بمبلغ خاطئ وسيُعاد إصداره"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" disabled={!reasonOk || busy !== null} onClick={doVoid}
              className="px-4 py-2 rounded-xl text-[11px] font-black bg-red-700 text-white disabled:opacity-50">
              {busy === "void" ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}
            </button>
            <button type="button" onClick={() => { setVoidOpen(false); setReason(""); }}
              className="px-3 py-2 rounded-xl text-[11px] font-black border border-slate-300 text-slate-600 dark:border-zinc-700 dark:text-zinc-400">
              تراجع
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-[11px] font-bold text-red-700 dark:text-red-400">
          <Warning size={12} weight="fill" /> {error}
        </p>
      )}

      {sent && (
        <div className={`rounded-2xl border p-3 space-y-2 ${isDark ? "border-emerald-500/20 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-start gap-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
              <CheckCircle size={13} weight="fill" className="flex-shrink-0 mt-0.5" /> {sent.summary}
            </p>
            <button type="button" onClick={() => setSent(null)} aria-label="إغلاق ملخص الإرسال" className="text-slate-500 dark:text-zinc-400">
              <X size={12} />
            </button>
          </div>
          <div className="relative">
            <pre dir="rtl" className={`whitespace-pre-wrap text-[11px] leading-relaxed rounded-xl p-3 font-sans ${isDark ? "bg-zinc-900 text-zinc-300" : "bg-white text-slate-700"}`}>{sent.text}</pre>
            <button
              type="button"
              onClick={() => { void navigator.clipboard?.writeText(sent.text).catch(() => undefined); }}
              className={`${btn} absolute top-2 left-2`}
              aria-label="نسخ نص البيان"
            >
              <Copy size={11} /> نسخ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── voided statements (kept, shown apart) ────────────────────────────────

export function VoidedInvoicesList({
  items,
  total,
  onPrint,
  cardCls,
}: {
  items: FinanceInvoice[];
  total: number | null;
  onPrint: (inv: FinanceInvoice) => void;
  cardCls: string;
}) {
  if (items.length === 0) return null;
  return (
    <details className={`${cardCls} p-5`}>
      <summary className="cursor-pointer text-[12px] font-black text-slate-700 dark:text-zinc-300 flex items-center gap-2">
        <Receipt size={14} className="text-red-500" />
        بيانات أتعاب ملغاة ({(total ?? items.length).toLocaleString("ar-SA")}) — محفوظة للسجل ولا تدخل في أي مجموع
      </summary>
      {total !== null && total > items.length && (
        <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">تُعرض أحدث {items.length.toLocaleString("ar-SA")} منها فقط.</p>
      )}
      <ul className="mt-3 space-y-2">
        {items.map((inv) => (
          <li key={inv.id} className="rounded-xl border border-slate-200 dark:border-white/[0.06] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="text-[12px] font-black text-slate-700 dark:text-zinc-300 line-through decoration-red-400/60">
                {inv.client} — {formatSar(halalasOf(inv.totalFee))}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400">{inv.desc} · صدر {inv.date}</p>
              <p className="text-[10px] font-bold text-red-700 dark:text-red-400">
                أُلغي{inv.voidedDate ? ` في ${inv.voidedDate}` : ""} — السبب: {inv.voidReason}
              </p>
            </div>
            <button type="button" onClick={() => onPrint(inv)}
              className="self-start sm:self-center flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-zinc-300">
              <Printer size={12} /> طباعة
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
