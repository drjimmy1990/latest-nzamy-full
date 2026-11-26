"use client";

import { useCallback, useEffect, useState } from "react";
import { OPEN_NOW_LABEL_AR } from "@/lib/marketplace/marketPriority";

/**
 * Owner س٢٣ (batch l16): on the client's own request, while it is still in
 * the Nezamy priority window — until when, and «افتحه للجميع فوراً».
 * Renders nothing for any other request (assigned, closed, not a market
 * request, the window over, or the SQL not run).
 */
function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-SA-u-nu-arab", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
}

export default function MarketPriorityStatus({ requestId }: { requestId: string }) {
  const [releaseAt, setReleaseAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const url = `/api/v1/service-requests/${encodeURIComponent(requestId)}/open-market`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { held?: unknown; releaseAt?: unknown } | null;
      setReleaseAt(res.ok && body?.held === true && typeof body.releaseAt === "string" ? body.releaseAt : null);
    } catch {
      setReleaseAt(null);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openNow() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      setMsg({ ok: res.ok, text: body?.message || body?.error || (res.ok ? "تم." : "تعذّر تنفيذ ذلك الآن.") });
      if (res.ok) setReleaseAt(null);
    } catch {
      setMsg({ ok: false, text: "تعذّر الاتصال — حاول مجدداً." });
    } finally {
      setBusy(false);
    }
  }

  if (!releaseAt && !msg) return null;
  return (
    <div dir="rtl" className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[12px] leading-relaxed text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
      {releaseAt && (
        <>
          <p>
            طلبك لدى فريق نظامي حتى {fmt(releaseAt)}، ثم يُعرض تلقائياً على جميع المحامين الموثَّقين في السوق إن لم يتولَّه الفريق.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void openNow()}
            className="mt-2 rounded-lg bg-[#0B3D2E] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
          >
            {OPEN_NOW_LABEL_AR}
          </button>
        </>
      )}
      {msg && (
        <p role="status" className={`mt-1 font-bold ${msg.ok ? "" : "text-red-700 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
