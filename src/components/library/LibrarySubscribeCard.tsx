"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Lock, X, ArrowLeft } from "@phosphor-icons/react";
import { bookPriceText } from "@/lib/pricing/priceBook";
import { VAT_NOTICE } from "@/lib/pricing/vatNotice";
import { activeCampaign, campaignFromApi, type Campaign } from "@/lib/pricing/campaigns";

/**
 * The subscribe card a non-subscriber sees on locked library content (owner
 * message 18 Nov, item 2.4; audit م-3): the button «اشترك في المكتبة», the
 * library's price (the catalogue's annual price — priceBook, 3,490) and, while
 * the founder campaign is on sale, its banner (GET /api/v1/campaigns/active,
 * the same source as PromotionalCampaignBanner; nothing when it is off).
 *
 * Owner decision (18 Nov, «Library»): shown only to account types whose
 * library is open. TODO(l8-liblock): wrap the two exports below in the
 * account-type library gate helper that l8-liblock adds (hide the card, and
 * show its locked message instead, when the viewer's type has no library
 * access). Until it is wired every viewer sees the card.
 */

export const LIBRARY_SUBSCRIBE_HREF = "/laws/subscribe?plan=lib-annual";
export const LIBRARY_SUBSCRIBE_LABEL = "اشترك في المكتبة";

function useFounderCampaign(): Campaign | null {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/campaigns/active")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const fromRoute = body ? campaignFromApi(body) : null;
        // Today is read after mount (the SSR cached-date trap).
        const live = fromRoute ? activeCampaign(new Date(), [fromRoute]) : null;
        if (!cancelled) setCampaign(live);
      })
      .catch(() => {
        /* no banner */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return campaign;
}

export function LibrarySubscribeCard({ title, onClose, className = "" }: { title?: string; onClose?: () => void; className?: string }) {
  const founder = useFounderCampaign();
  const price = bookPriceText("lib-annual", "once", "ar");
  return (
    <section
      dir="rtl"
      aria-label={LIBRARY_SUBSCRIBE_LABEL}
      className={`relative rounded-2xl border border-[#C8A762]/40 bg-white p-5 shadow-sm dark:border-[#C8A762]/30 dark:bg-zinc-900 ${className}`}
    >
      {onClose && (
        <button type="button" onClick={onClose} aria-label="إغلاق" className="absolute left-3 top-3 rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/10">
          <X size={16} />
        </button>
      )}
      <div className="mb-2 flex items-center gap-2">
        <Lock size={18} weight="fill" className="text-[#C8A762]" />
        <h3 className="text-base font-black text-slate-900 dark:text-white">
          {title ?? "النص الكامل متاح لمشتركي المكتبة القانونية"}
        </h3>
      </div>
      <p className="mb-3 text-sm leading-7 text-slate-700 dark:text-zinc-300">
        اشترك في المكتبة القانونية واطّلع على النصوص كاملة: الأنظمة واللوائح، والمبادئ والأحكام القضائية، والمراجع الفقهية.
      </p>
      <p className="mb-4 text-sm font-bold text-slate-900 dark:text-white">
        {price} ر.س سنوياً
        <span className="mr-2 text-xs font-normal text-slate-500 dark:text-zinc-400">{VAT_NOTICE.exclusive.ar}</span>
      </p>
      {founder && (
        <a
          href={founder.ctaHref}
          className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-[#C8A762]/40 bg-[#0B3D2E] px-3 py-2 text-xs text-white hover:brightness-110"
        >
          <span className="flex items-center gap-2">
            <Crown size={14} weight="fill" className="text-[#C8A762]" />
            <span className="font-bold text-[#C8A762]">{founder.badgeAr}</span>
            <span className="text-white/90">{founder.messageAr}</span>
          </span>
          <ArrowLeft size={12} weight="bold" className="shrink-0" />
        </a>
      )}
      <Link
        href={LIBRARY_SUBSCRIBE_HREF}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-5 text-sm font-black text-white hover:brightness-110 dark:bg-[#C8A762] dark:text-[#0B3D2E]"
      >
        {LIBRARY_SUBSCRIBE_LABEL}
      </Link>
    </section>
  );
}

/**
 * The note on a locked item (replaces the old static amber <span>): its own
 * message plus a real button that opens the subscribe card in a dialog.
 */
export function LibraryLockedNote({ message, className = "" }: { message: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        role="note"
        className={`flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-400 ${className}`}
      >
        <Lock size={14} weight="fill" className="flex-shrink-0" />
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[36px] items-center rounded-lg bg-[#0B3D2E] px-3 text-xs font-black text-white hover:brightness-110 dark:bg-[#C8A762] dark:text-[#0B3D2E]"
        >
          {LIBRARY_SUBSCRIBE_LABEL}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <LibrarySubscribeCard onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
