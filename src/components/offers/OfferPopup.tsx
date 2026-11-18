"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { isSupabaseMode } from "@/lib/services/api";
import { fetchTermsStatus } from "@/lib/legal/termsAcceptanceClient";
import { POPUP_SESSION_PREFIX, popupAllowedOnPath, type OfferCardDto } from "@/lib/offers/offerRules";
import { fetchOffers, forgetOffers, reportOfferEvent } from "./useOffers";
import { OfferCard } from "./OfferCard";

/**
 * The offer popup (owner item 5): after the user enters his dashboard, ONE
 * offer — the highest-priority one meant for him whose closed popup is past
 * its return delay (the server picks it: GET /api/v1/offers `popupId`).
 *
 *   - Only on dashboard pages (popupAllowedOnPath): never during signup,
 *     payment (billing, wallets, checkout) or the terms, never in the admin
 *     console; and never while the terms re-ask modal is open (an account
 *     that must accept new terms gets no offer first).
 *   - At most once per session: once shown, this tab's sessionStorage
 *     remembers it (keyed by the sign-in), so a reload does not bring it back.
 *   - Closing it records a dismissal (offer_dismissals), so it stays away for
 *     the offer's return delay (default 3 days); the offer stays a card in
 *     «العروض» and on /pricing meanwhile. The button records a click.
 *
 * Mounted once in src/app/dashboard/layout.tsx.
 */

/*
 * "Not again in the same session" = this browser tab's session
 * (sessionStorage), keyed by the sign-in. A reload keeps it away (protocol
 * هـ3); a new tab or a new browser session after the return delay brings it
 * back (هـ6) — the server's dismissal clock decides that part.
 */
function seen(key: string): boolean {
  try {
    return window.sessionStorage.getItem(POPUP_SESSION_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function markSeen(key: string): void {
  try {
    window.sessionStorage.setItem(POPUP_SESSION_PREFIX + key, "1");
  } catch {
    // Storage blocked: the component's own state still shows it once per page load.
  }
}

export default function OfferPopup() {
  const pathname = usePathname();
  const allowed = isSupabaseMode && popupAllowedOnPath(pathname);
  const [offer, setOffer] = useState<OfferCardDto | null>(null);
  const attempted = useRef(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!allowed || attempted.current) return;
    attempted.current = true;
    let live = true;
    void (async () => {
      const terms = await fetchTermsStatus();
      if (!live || terms.kind === "needs_acceptance") return;
      const reply = await fetchOffers();
      if (!live || !reply || !reply.popupId || !reply.sessionKey) return;
      if (seen(reply.sessionKey)) return;
      const card = reply.offers.find((o) => o.id === reply.popupId);
      if (!card) return;
      markSeen(reply.sessionKey);
      setOffer(card);
      reportOfferEvent(card.id, "impression");
    })();
    return () => {
      live = false;
    };
  }, [allowed]);

  const dismiss = () => {
    if (!offer) return;
    reportOfferEvent(offer.id, "dismiss");
    forgetOffers();
    setOffer(null);
  };

  useEffect(() => {
    if (!offer) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer]);

  if (!offer || !allowed) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm" dir="rtl" onClick={dismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={offer.title}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-[#C8A762]/40 bg-white p-6 pt-10 shadow-2xl dark:border-[#C8A762]/30 dark:bg-zinc-900"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          aria-label="إغلاق"
          className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/5"
        >
          <X size={16} aria-hidden />
        </button>
        <OfferCard
          offer={offer}
          onCta={() => {
            reportOfferEvent(offer.id, "click");
          }}
        />
        <p className="mt-4 text-[11px] text-slate-500 dark:text-zinc-400">يبقى هذا العرض في قسم «العروض» في لوحتك ما دام قائمًا.</p>
      </div>
    </div>
  );
}
