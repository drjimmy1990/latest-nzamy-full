"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteCardButton({ id }: { id: string }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/billing/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json();
        setError(typeof body.error === "string" ? body.error : "تعذّر حذف البطاقة، حاول مرة أخرى");
      } else { router.refresh(); }
    } catch { setError("تعذّر الاتصال، حاول مرة أخرى"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="text-sm">
    <button type="button" onClick={remove} disabled={busy} className="rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950">{busy ? "جارٍ الحذف…" : "حذف البطاقة"}</button>
    {error ? <p role="alert" className="mt-2 text-red-700 dark:text-red-300">{error}</p> : null}
  </div>;
}
export function PrintReceiptButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-xl bg-[#0B3D2E] px-5 py-2.5 font-bold text-white">طباعة الإيصال</button>;
}
