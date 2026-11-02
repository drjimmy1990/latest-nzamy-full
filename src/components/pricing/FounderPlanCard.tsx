"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Crown, Info, SealCheck } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { usePaymentsStatus } from "@/hooks/usePaymentsStatus";
import type { AudienceTab } from "@/constants/pricingData";
import {
  FOUNDER_BENEFITS,
  FOUNDER_CARD_TITLE,
  FOUNDER_CLOSED_TEXT,
  FOUNDER_FINE_PRINT,
  FOUNDER_PAUSED_TEXT,
  FOUNDER_PLAN_ANCHOR,
  FOUNDER_TERM_LINE,
  founderCta,
  founderEndsLine,
  founderMemberFromReply,
  founderOfferFromApi,
  founderPriceLine,
  founderSectionView,
  founderSeatsLine,
  founderVatLine,
  founderVerificationFromProfile,
  type FounderMember,
  type FounderOffer,
  type FounderVerification,
} from "@/lib/pricing/founderCard";

/**
 * The lawyer founder membership on /pricing (P3 Task 8). The owner's campaign
 * links to /pricing?audience=lawyers&campaign=founder-2026#founder-plan.
 *
 * FounderPlanSection reads GET /api/v1/campaigns/active and decides, through
 * the pure founderSectionView, whether the card, the «انتهت حملة المؤسس…» or
 * «البيع متوقف مؤقتًا…» line (campaign-link visitors only) or nothing renders.
 * All carry
 * id="founder-plan", so the link never lands on a dead anchor; they mount
 * after the fetch, so the hash is scrolled to by hand once.
 *
 * Every word and number comes from src/lib/pricing/founderCard.ts: the price
 * and its VAT breakdown from quote(), the seats from founder_seat_summary(),
 * the last day from the setting's ends_on, the button from founderCta.
 */

// quote() is pure and the book is static: computed once per module load.
const PRICE_LINE = founderPriceLine();
const VAT_LINE = founderVatLine();

export function FounderPlanSection({
  audience,
  libraryMode,
  campaignParam,
}: {
  audience: AudienceTab;
  libraryMode: boolean;
  campaignParam: string | null;
}) {
  const [offer, setOffer] = useState<FounderOffer | null>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/campaigns/active")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (!cancelled) setOffer(founderOfferFromApi(body));
      })
      .catch(() => {
        if (!cancelled) setOffer({ state: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const view = founderSectionView({ audience, libraryMode, campaignParam, offer, priced: PRICE_LINE !== null });

  // The browser looked for #founder-plan before this section existed.
  useEffect(() => {
    if (view === "hidden" || scrolled.current) return;
    if (window.location.hash !== `#${FOUNDER_PLAN_ANCHOR}`) return;
    scrolled.current = true;
    document.getElementById(FOUNDER_PLAN_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view]);

  if (view === "hidden" || !offer) return null;

  if (view === "closed" || view === "paused") {
    return (
      <section id={FOUNDER_PLAN_ANCHOR} dir="rtl" className="mx-auto max-w-3xl scroll-mt-24 px-4 pt-8">
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-5 py-4 text-center text-sm font-bold text-[#0B3D2E] dark:text-[#C8A762]">
          <Info size={18} weight="fill" aria-hidden />
          {view === "paused" ? FOUNDER_PAUSED_TEXT : FOUNDER_CLOSED_TEXT}
        </p>
      </section>
    );
  }

  if (offer.state !== "open" || PRICE_LINE === null) return null;
  return <FounderPlanCard campaign={offer} priceLine={PRICE_LINE} vatLine={VAT_LINE} />;
}

export function FounderPlanCard({
  campaign,
  priceLine,
  vatLine,
}: {
  campaign: { seatsLeft: number; capacity: number; endsOn?: string };
  priceLine: string;
  vatLine: string | null;
}) {
  const { isLoggedIn, loading, userType, practiceKind } = useUser();
  const payments = usePaymentsStatus();
  const [verification, setVerification] = useState<FounderVerification>("loading");
  const [member, setMember] = useState<FounderMember>("loading");

  const lawyerSignedIn = !loading && isLoggedIn && userType === "lawyer";

  // The two per-viewer reads behind the button: verification (GET
  // /api/v1/profile) and membership (GET /api/v1/membership/founder). A
  // failed read is "unknown" and never blocks — the checkout gate decides.
  useEffect(() => {
    if (!lawyerSignedIn) return;
    let cancelled = false;
    const read = (url: string) =>
      fetch(url, { cache: "no-store" })
        .then((res) => res.json() as Promise<unknown>)
        .catch(() => null);
    void read("/api/v1/profile").then((reply) => {
      if (!cancelled) setVerification(founderVerificationFromProfile(reply));
    });
    void read("/api/v1/membership/founder").then((reply) => {
      if (!cancelled) setMember(founderMemberFromReply(reply));
    });
    return () => {
      cancelled = true;
    };
  }, [lawyerSignedIn]);

  const endsLine = founderEndsLine(campaign.endsOn);

  const cta = founderCta({
    sessionLoading: loading,
    signedIn: isLoggedIn,
    userType: userType ?? null,
    practiceKind: userType === "lawyer" ? practiceKind : null,
    verification,
    member,
    gateway: payments,
  });

  const primary =
    "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 dark:bg-[#C8A762] dark:text-[#0B3D2E]";
  const quiet =
    "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 px-5 py-3 text-sm font-bold text-zinc-600 dark:border-zinc-600 dark:text-zinc-300";

  return (
    <section id={FOUNDER_PLAN_ANCHOR} dir="rtl" className="mx-auto max-w-3xl scroll-mt-24 px-4 pt-10">
      <div className="rounded-[2rem] border-2 border-gold/50 bg-white p-7 shadow-sm dark:border-[#C8A762]/40 dark:bg-dark-card md:p-8">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-xs font-bold text-[#0B3D2E] dark:text-[#C8A762]">
          <Crown size={14} weight="fill" aria-hidden />
          {founderSeatsLine(campaign.seatsLeft, campaign.capacity)}
        </div>

        <h2 className="font-brand text-2xl font-extrabold leading-tight text-[#0B3D2E] dark:text-white">
          {FOUNDER_CARD_TITLE}
        </h2>
        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">{FOUNDER_TERM_LINE}</p>

        <div className="my-5 border-y border-zinc-200 py-4 dark:border-zinc-700">
          <p className="text-lg font-extrabold tabular-nums text-[#0B3D2E] dark:text-[#C8A762]">{priceLine}</p>
          {vatLine && <p className="mt-1 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{vatLine}</p>}
          {endsLine && <p className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{endsLine}</p>}
        </div>

        <ul className="space-y-2.5">
          {FOUNDER_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[#0B3D2E] dark:text-[#C8A762]" aria-hidden />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        {cta.note && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-semibold leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <Info size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {cta.note}
          </p>
        )}

        <div className="mt-6 space-y-2.5">
          {cta.kind === "guest" && (
            <>
              <Link href={cta.href} className={primary}>{cta.label}</Link>
              <Link href={cta.registerHref} className={quiet}>{cta.registerLabel}</Link>
            </>
          )}
          {(cta.kind === "verify" || cta.kind === "checkout") && (
            <Link href={cta.href} className={primary}>{cta.label}</Link>
          )}
          {cta.kind === "member" && (
            <p className={quiet} role="status">
              <SealCheck size={18} weight="fill" className="text-[#0B3D2E] dark:text-[#C8A762]" aria-hidden />
              {cta.label}
            </p>
          )}
          {(cta.kind === "loading" || cta.kind === "wait" || cta.kind === "unavailable" || cta.kind === "lawyers_only") && (
            <p className={quiet} role="status" aria-live="polite">{cta.label}</p>
          )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{FOUNDER_FINE_PRINT}</p>
      </div>
    </section>
  );
}
