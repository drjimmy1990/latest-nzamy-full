"use client";

import { Gift, ArrowLeft } from "@phosphor-icons/react";
import { offerEndsLineAr, offerSeatsLineAr, type OfferCardDto } from "@/lib/offers/offerRules";

/**
 * One offer as the user sees it (owner item 5): the popup body, a card in
 * «العروض», the /pricing strip, and the admin's preview all draw this.
 * The seats and end lines come from the server's numbers (server clock);
 * nothing here invents a count.
 */
export function OfferCard({
  offer,
  onCta,
  compact = false,
  ctaDisabled = false,
}: {
  offer: OfferCardDto;
  /** Called before following the link (the click event); the link still navigates. */
  onCta?: () => void;
  compact?: boolean;
  /** The admin preview: the button is drawn but goes nowhere. */
  ctaDisabled?: boolean;
}) {
  const seats = offerSeatsLineAr(offer);
  const ends = offerEndsLineAr(offer.endsAt);
  return (
    <div dir="rtl" className="flex flex-col gap-3">
      {offer.mediaUrl && offer.mediaKind === "image" ? (
        // A plain <img>: the admin's URL may be any https host (next/image needs each host listed).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={offer.mediaUrl} alt="" className={`w-full rounded-xl object-cover ${compact ? "max-h-32" : "max-h-56"}`} />
      ) : null}
      {offer.mediaUrl && offer.mediaKind === "video" ? (
        <video src={offer.mediaUrl} controls preload="metadata" className={`w-full rounded-xl ${compact ? "max-h-32" : "max-h-56"}`} />
      ) : null}
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#C8A762]/15">
          <Gift size={18} weight="fill" className="text-[#C8A762]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-[#0B3D2E] dark:text-white">{offer.title}</h3>
          {offer.body ? (
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-slate-600 dark:text-zinc-300">{offer.body}</p>
          ) : null}
          {seats || ends ? (
            <p className="mt-2 text-[12px] font-semibold text-[#8a6d2b] dark:text-[#C8A762]">
              {[seats, ends].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        {ctaDisabled ? (
          <span className="inline-flex cursor-default items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[13px] font-bold text-white dark:bg-[#C8A762] dark:text-[#0B3D2E]">
            {offer.ctaLabel}
            <ArrowLeft size={13} weight="bold" aria-hidden />
          </span>
        ) : (
          <a
            href={offer.ctaHref}
            onClick={() => onCta?.()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[13px] font-bold text-white hover:brightness-110 dark:bg-[#C8A762] dark:text-[#0B3D2E]"
          >
            {offer.ctaLabel}
            <ArrowLeft size={13} weight="bold" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
