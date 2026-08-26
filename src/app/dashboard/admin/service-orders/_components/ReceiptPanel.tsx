"use client";

import { useCallback, useEffect, useState } from "react";
import { Receipt as ReceiptIcon } from "@phosphor-icons/react";
import { uploadDocumentFile } from "@/lib/services/documentService";
import { RECEIPT_METHODS, receiptMethodLabel } from "@/lib/services/receiptSerial";
import { tafqit } from "@/lib/services/tafqit";

/**
 * «سند قبض» — owner item ١٥, the half that is buildable today.
 *
 * His ruling on س٧ was a dual path: a generated document AND a manual upload
 * for the paper receipts the office already writes. This is the ledger and the
 * manual path. The generated PDF is not here, and the panel says so in as many
 * words rather than leaving a gap the admin has to discover — rendering Arabic
 * to PDF needs text shaping and an embedded font that the installed jsPDF does
 * not provide, and the ZATCA QR needs a package that is not installed.
 *
 * The serial is not shown before issuing and is not editable after. The
 * database generates it (a stored column over the table's bigserial), so any
 * number this panel displayed beforehand would be a guess that two admins
 * pressing the button together would both get wrong.
 */

interface ReceiptRow {
  id: number;
  serial: string;
  amount: number | string;
  amount_words: string;
  method: string;
  payer_name: string | null;
  reference: string | null;
  notes: string | null;
  issued_at: string;
}

export function ReceiptPanel({ orderId, isDark }: { orderId: string; isDark: boolean }) {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("");
  const [method, setMethod] = useState<string>(RECEIPT_METHODS[0].id);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paper, setPaper] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/admin/receipts?requestId=${encodeURIComponent(orderId)}`);
      if (!res.ok) return;
      const body = await res.json();
      setRows(body.data ?? []);
    } catch {
      /* the panel is still usable for issuing; a lost list is not fatal */
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // The words as they will be stored, shown live. The server computes them
  // itself and does not trust the client — this is a preview so the admin sees
  // what the client will read BEFORE the number becomes permanent.
  const numericAmount = Number(amount);
  const preview = amount.trim() && Number.isFinite(numericAmount) ? tafqit(numericAmount) : "";

  async function issue() {
    setBusy(true);
    setErr("");
    try {
      let attachmentId: string | undefined;
      if (paper) {
        // Uploaded FIRST and bound to this order, so the receipt row can never
        // reference an attachment that failed to arrive.
        const doc = await uploadDocumentFile(paper, { requestId: orderId });
        attachmentId = String(doc.id);
      }
      const res = await fetch("/api/v1/admin/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          requestId: orderId,
          amount: numericAmount,
          payerName: payer,
          method,
          reference,
          notes,
          attachmentId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Every refusal this route owns is written in Arabic; the fallback
        // covers the ones it does not (a 500 out of PostgREST).
        setErr(typeof body.error === "string" && body.error ? body.error : "تعذّر إصدار السند.");
        return;
      }
      setOpen(false);
      setAmount(""); setPayer(""); setReference(""); setNotes(""); setPaper(null);
      await load();
    } catch {
      setErr("تعذّر إصدار السند. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  const field = `w-full rounded-xl px-3 py-2 text-[12px] border ${
    isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"}`;

  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${
      isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-zinc-200 bg-zinc-50"}`} dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 text-[11px] font-bold ${
          isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          <ReceiptIcon size={14} weight="bold" /> سندات القبض
        </p>
        <button type="button" onClick={() => { setErr(""); setOpen((v) => !v); }}
          className="rounded-xl border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-500">
          {open ? "إغلاق" : "إصدار سند قبض"}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
          لم يصدر أي سند على هذا الطلب بعد.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className={`rounded-lg px-2.5 py-2 text-[11px] ${
              isDark ? "bg-zinc-900" : "bg-white"}`}>
              <p className={`font-mono font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                {r.serial} · {Number(r.amount).toLocaleString("ar-SA")} ر.س · {receiptMethodLabel(r.method)}
              </p>
              <p className={isDark ? "text-zinc-500" : "text-zinc-500"}>{r.amount_words}</p>
              <p className={isDark ? "text-zinc-600" : "text-zinc-400"}>
                {r.payer_name ? `${r.payer_name} · ` : ""}
                {new Date(r.issued_at).toLocaleDateString("ar-SA")}
                {r.reference ? ` · مرجع: ${r.reference}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="space-y-2 pt-1">
          <input value={amount} onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal" placeholder="المبلغ بالريال" className={field} />
          {/* Shown before the button, not after: the words are the part of a
              receipt that cannot be corrected once it is in a client's hands. */}
          {preview && (
            <p className={`text-[11px] ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>{preview}</p>
          )}
          <input value={payer} onChange={(e) => setPayer(e.target.value)}
            placeholder="اسم الدافع (اختياري)" className={field} />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
            {RECEIPT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <input value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder="رقم الحوالة أو الشيك (اختياري)" className={field} />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="ملاحظات (اختياري)" className={field} />

          <label className={`block cursor-pointer rounded-xl border border-dashed px-3 py-2.5 text-[11px] ${
            isDark ? "border-white/10 text-zinc-400" : "border-zinc-300 text-zinc-500"}`}>
            {paper ? `📎 ${paper.name}` : "إرفاق صورة السند الورقي (اختياري)"}
            <input type="file" className="hidden"
              accept="image/*,application/pdf"
              onChange={(e) => {
                // Read the file out of the live FileList BEFORE anything else
                // touches the input — resetting it first is what made four
                // other pickers on this platform silently drop the file.
                const picked = e.target.files?.[0] ?? null;
                setPaper(picked);
                e.target.value = "";
              }} />
          </label>

          {err && <p className="text-[11px] text-red-500">{err}</p>}

          <p className={`text-[10px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            الرقم التسلسلي يُصدره النظام تلقائياً ولا يمكن تعديله. توليد ملف PDF
            للسند وربطه برمز QR غير متاح بعد — يُرفق السند الورقي هنا حتى ذلك الحين.
          </p>

          <button type="button" onClick={issue}
            disabled={busy || !amount.trim() || !preview}
            className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40">
            {busy ? "جارٍ الإصدار…" : "إصدار السند"}
          </button>
        </div>
      )}
    </div>
  );
}
