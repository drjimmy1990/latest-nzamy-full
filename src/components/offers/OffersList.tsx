"use client";

import { OfferCard } from "./OfferCard";
import { reportOfferEvent, useOffers } from "./useOffers";

/**
 * The offers meant for this user now (owner item 5), as cards — on
 * /dashboard/offers («العروض») and, with `variant="strip"`, on /pricing.
 * Batch l9 (owner register 14 item 20, file 16): `variant="checkout"` puts
 * the active offer at the TOP of /checkout too — one column, nothing while
 * loading, on a failed read or with no offer (the payment form below never
 * waits for it). A closed popup's offer stays here while it is open. Loading
 * and a failed read say so plainly on the page variant; "no offer" is said
 * only on a real empty answer.
 */
export function OffersList({ variant = "page", enabled = true }: { variant?: "page" | "strip" | "checkout"; enabled?: boolean }) {
  const reply = useOffers(enabled);

  if (variant === "checkout") {
    if (!reply || reply.offers.length === 0) return null;
    return (
      <section aria-label="عروض متاحة لك" dir="rtl" className="mb-5 space-y-3">
        {reply.offers.map((o) => (
          <div key={o.id} className="rounded-2xl border border-[#C8A762]/40 bg-white p-5 dark:border-[#C8A762]/25 dark:bg-zinc-900">
            <OfferCard offer={o} compact onCta={() => reportOfferEvent(o.id, "click")} />
          </div>
        ))}
      </section>
    );
  }

  if (variant === "strip") {
    if (!reply || reply.offers.length === 0) return null;
    return (
      <section aria-label="عروض متاحة لك" dir="rtl" className="mx-auto w-full max-w-7xl px-4 pt-6">
        <h2 className="mb-3 text-lg font-bold text-[#0B3D2E] dark:text-white">عروض متاحة لك</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {reply.offers.map((o) => (
            <div key={o.id} className="rounded-2xl border border-[#C8A762]/40 bg-white p-5 dark:border-[#C8A762]/25 dark:bg-zinc-900">
              <OfferCard offer={o} compact onCta={() => reportOfferEvent(o.id, "click")} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (reply === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">جارٍ تحميل العروض…</p>;
  if (reply === null) return <p role="alert" className="text-sm text-slate-600 dark:text-zinc-300">تعذّر تحميل العروض الآن — حاول بعد قليل.</p>;
  if (reply.offers.length === 0) return <p className="text-sm text-slate-600 dark:text-zinc-300">لا توجد عروض متاحة لحسابك الآن.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {reply.offers.map((o) => (
        <div key={o.id} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <OfferCard offer={o} onCta={() => reportOfferEvent(o.id, "click")} />
        </div>
      ))}
    </div>
  );
}
