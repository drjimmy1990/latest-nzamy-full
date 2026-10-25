"use client";

import { useEffect, useState } from "react";
import { Crown, ArrowLeft, X } from "@phosphor-icons/react";
import { activeCampaign, campaignFromApi, type Campaign } from "@/lib/pricing/campaigns";

const DISMISSED_PREFIX = "nzamy_dismissed_campaign_";

/**
 * Dismissible banner for a real, dated campaign (owner answer ١٧٩). The
 * founder campaign (owner ٢١٨ / ٢٢٥) comes from GET /api/v1/campaigns/active,
 * which reads the admin-set dates — and answers null until the paid founder
 * membership is on sale (FOUNDER_MEMBERSHIP_ON_SALE, phase P3; owner, 25 Oct:
 * no founder gift on a free signup). When that route fails or answers nothing
 * usable, the code `CAMPAIGNS` list (empty) is the fallback.
 * Renders nothing when neither has a campaign for today. Today is read after
 * mount, never during render, so a cached page cannot show a campaign on the
 * wrong day (the SSR cached-date trap) — and the route's campaign is
 * re-checked against today here, because the route answer is cached 5 minutes.
 */
export function PromotionalCampaignBanner() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let fromRoute: Campaign | null = null;
      try {
        const res = await fetch("/api/v1/campaigns/active");
        if (res.ok) fromRoute = campaignFromApi(await res.json());
      } catch {
        // Network failure or unreadable body: fall back to the code list.
      }
      const now = new Date();
      const live = (fromRoute && activeCampaign(now, [fromRoute])) ?? activeCampaign(now);
      if (cancelled || !live) return;
      let dismissed = false;
      try {
        dismissed = window.localStorage.getItem(DISMISSED_PREFIX + live.id) === "1";
      } catch {
        // Storage blocked (private mode): show it; the close button still works for this visit.
      }
      if (!dismissed) setCampaign(live);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!campaign) return null;

  function dismiss() {
    if (!campaign) return;
    try {
      window.localStorage.setItem(DISMISSED_PREFIX + campaign.id, "1");
    } catch {
      // Ignore: it stays closed until the page is reloaded.
    }
    setCampaign(null);
  }

  return (
    <aside
      dir="rtl"
      aria-label={campaign.badgeAr}
      className="relative z-30 w-full border-b border-gold/30 bg-[#0B3D2E] text-white"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-2.5 text-xs sm:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center sm:justify-start sm:text-right">
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/20 px-2.5 py-0.5 text-[11px] font-bold text-gold">
            <Crown size={12} weight="fill" />
            {campaign.badgeAr}
          </span>
          <span className="text-[12px] leading-relaxed text-white/90">{campaign.messageAr}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={campaign.ctaHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-[11px] font-bold text-[#0B3D2E] hover:brightness-105"
          >
            {campaign.ctaAr}
            <ArrowLeft size={12} weight="bold" />
          </a>
          <button
            type="button"
            onClick={dismiss}
            aria-label="إغلاق"
            title="إغلاق"
            className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>
    </aside>
  );
}
