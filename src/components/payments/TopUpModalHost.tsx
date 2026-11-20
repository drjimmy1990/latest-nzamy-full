"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import MoyasarCheckout from "@/components/payments/MoyasarCheckout";
import { formatHalalas, type PayableItem } from "@/lib/payments/catalog";
import { checkoutItemNotes, TOPUP_LIBRARY_EXPIRY_GENERIC_AR } from "@/lib/payments/checkoutView";
import { INSUFFICIENT_POINTS_EVENT, saveTopUpReturn, topUpPacksFor } from "@/lib/payments/topUpDraft";

/**
 * TopUpModalHost — l6-pay (owner TODO, TopUpModal row). Mounted once by the
 * /ai layout. When useAiRun reports an insufficient-points refusal
 * (INSUFFICIENT_POINTS_EVENT; the tool's input is already saved for it), a
 * modal opens IN PLACE over the tool: the top-up packs the book sells to this
 * account type, then the same Moyasar checkout as /checkout (the server
 * prices it — the founder discount included — and shows the quote before
 * paying). Before the payment form appears the tool's path is kept
 * (saveTopUpReturn) so /payments/result offers «العودة إلى الأداة»; the
 * typed input comes back on the tool's page (useToolDraft). Closing the
 * modal leaves the tool as it was, the input still on screen.
 */
export default function TopUpModalHost() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [pack, setPack] = useState<PayableItem | null>(null);

  useEffect(() => {
    const onShort = () => {
      setPack(null);
      setOpen(true);
    };
    window.addEventListener(INSUFFICIENT_POINTS_EVENT, onShort);
    return () => window.removeEventListener(INSUFFICIENT_POINTS_EVENT, onShort);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || user.loading || !user.isLoggedIn) return null;
  const packs = topUpPacksFor(user.userType);

  function choose(item: PayableItem) {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    saveTopUpReturn(storage, window.location.pathname + window.location.search);
    setPack(item);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" dir="rtl">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-modal-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="topup-modal-title" className="text-lg font-bold">
              رصيدك من النقاط لا يكفي لهذه الأداة
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              اشحن رصيدك هنا ثم أكمل من حيث توقفت — ما كتبته في الأداة محفوظ.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق"
            className="rounded-lg px-2 py-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>

        {pack ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{pack.labelAr}</p>
              <button
                type="button"
                onClick={() => setPack(null)}
                className="text-xs font-bold text-[#0B3D2E] underline underline-offset-2 dark:text-[#C8A762]"
              >
                اختيار حزمة أخرى
              </button>
            </div>
            {/* l11 O7: the pack's validity, and the library rule (register 49) */}
            <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {checkoutItemNotes(pack).map((note) => (
                <li key={note}>{note}</li>
              ))}
              <li>{TOPUP_LIBRARY_EXPIRY_GENERIC_AR}</li>
            </ul>
            <MoyasarCheckout itemId={pack.id} billing="once" />
          </div>
        ) : packs.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {packs.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-start text-sm transition-colors hover:border-[#0B3D2E]/40 dark:border-zinc-700 dark:hover:border-[#C8A762]/40"
                >
                  <span className="font-semibold">{p.labelAr}</span>
                  <span className="shrink-0 font-bold text-[#0B3D2E] dark:text-[#C8A762]">{formatHalalas(p.prices.once ?? 0)}</span>
                </button>
              </li>
            ))}
            <li className="pt-1 text-xs text-zinc-600 dark:text-zinc-400">
              الأسعار قبل ضريبة القيمة المضافة (١٥٪)، ويظهر المبلغ النهائي قبل الدفع.
            </li>
          </ul>
        ) : (
          <p className="mt-5 text-sm text-zinc-700 dark:text-zinc-300">
            لا تتوفر حزم شحن لنوع حسابك حالياً.{" "}
            <Link href="/pricing" className="font-semibold underline underline-offset-2">
              الباقات والنقاط
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
