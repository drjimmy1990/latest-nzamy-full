import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { readFounderOfferCopy } from "@/lib/offers/offersServer";
import type { FounderOfferCopy } from "@/lib/offers/offerRules";
import {
  FOUNDER_MEMBERSHIP_ON_SALE,
  founderCampaignCopyFromOffer,
  founderCampaignFromSetting,
  founderOfferCampaign,
  founderSummaryFromRpc,
  founderWindow,
  riyadhDay,
  type FounderOfferCampaign,
  type FounderSeatSummary,
  type FounderWindow,
} from "@/lib/pricing/campaigns";

/**
 * GET /api/v1/campaigns/active → { campaign: FounderOfferCampaign | null,
 * founderUnavailable?: true } — public.
 *
 * The founder campaign (owner ٢١٨, dates ٢٢٥) when today, in Riyadh, is
 * between the admin-set `founder_campaign` dates (both included); else null.
 * PromotionalCampaignBanner falls back to the code `CAMPAIGNS` (empty) when
 * this answers null or fails.
 *
 * Owner answers of 25 Oct (P0): a free signup never earns the founder badge,
 * seat or library days; only the paid founder membership (P3, 20261101_10)
 * does. `FOUNDER_MEMBERSHIP_ON_SALE` is the code switch of that sale. It is
 * on since P3 Task 11; set back to false, this route answers
 * `{ campaign: null }` without reading the setting.
 *
 * Inside the dates the campaign also carries the /pricing card's numbers from
 * founder_seat_summary() (service role only, 20261101_10): `planId`,
 * `seatsLeft`, `capacity`, `salePaused` (the setting's sale_paused, R31) and
 * `onSale` = FOUNDER_MEMBERSHIP_ON_SALE AND the SQL's on_sale (window open,
 * not paused, a seat left); `endsOn` is the setting's ends_on. A full or
 * paused sale still answers the campaign, with onSale false. To a visitor
 * from the campaign link the card then says «البيع متوقف مؤقتًا…» when
 * paused with seats left, else «انتهت حملة المؤسس أو اكتملت مقاعدها»; other
 * visitors see no card, and the banner (campaignFromApi) and the dashboard
 * invite stay quiet.
 *
 * platform_settings has no public read, so the service client reads the one
 * key; only the derived banner copy, dates and seat numbers leave this route.
 *
 * Since the 17-Nov launch package (0.2 / F2) every answer also carries
 * `founderWindow` (founderWindow() in campaigns.ts): state pre | live |
 * sold_out | paused | ended, startsAt / endsAtExclusive as Riyadh instants,
 * serverNow, seatsTotal / seatsLeft and planId — answered BEFORE the
 * campaign opens too, so /founder can count down to the opening from the
 * server's clock. Null when no founder campaign is configured or the code
 * switch is off. The public cache is 10 s (owner spec: at most 10 s).
 *
 * Never an error status: a missing table/key (42P01), any read error or a
 * throw all answer `{ campaign: null, founderUnavailable: true }` with 200 —
 * a banner is never worth a 500, and the card must not call a failed read an
 * ended campaign. `force-dynamic` so the day is computed per request, never
 * baked in at build time (the SSR cached-date trap); the 10-second public
 * cache bounds the drift at midnight and the staleness of the seat count (the
 * checkout gate is the authority on seats), and the banner re-checks the
 * dates on the client.
 *
 * l8 (owner item 5, the offers system): the founder campaign is the first row
 * of public.offers (slug founder-2026). The banner's words come from that row
 * (title, body, button) and every answer carries `founderOffer: { promoted,
 * title, body, ctaLabel, ctaHref }` — promoted false once the admin stops the
 * offer, which hides the banner and the lawyer dashboard's campaign card. The
 * sale itself (dates, seats, onSale, checkout) is untouched. Before
 * 20261128_50 runs, founderOffer is null and the built-in copy stays.
 */
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "public, max-age=10" };

// Logged once per server process: a failing banner read is worth one line,
// not one per visitor.
let readFailureLogged = false;

function logOnce(...args: unknown[]): void {
  if (readFailureLogged) return;
  readFailureLogged = true;
  console.error(...args);
}

function answer(campaign: FounderOfferCampaign | null, window: FounderWindow | null = null, founderOffer: FounderOfferCopy | null = null) {
  return NextResponse.json({ campaign, founderWindow: window, founderOffer }, { status: 200, headers: HEADERS });
}

function unavailable(window: FounderWindow | null = null, founderOffer: FounderOfferCopy | null = null) {
  return NextResponse.json(
    { campaign: null, founderUnavailable: true, founderWindow: window, founderOffer },
    { status: 200, headers: HEADERS },
  );
}

export async function GET() {
  // The code switch of the paid founder sale (on since P3 Task 11): while it
  // is off there is no campaign to show, and the setting is not read.
  if (!FOUNDER_MEMBERSHIP_ON_SALE) return answer(null);
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "founder_campaign")
      .maybeSingle();

    if (error) {
      logOnce("[campaigns/active GET] founder_campaign read failed:", error.code, error.message);
      return unavailable();
    }

    const value = data?.value ?? null;
    const now = new Date();
    // l8: the founder offer row's copy (null before 20261128_50 / on a failed read).
    const founderOffer = await readFounderOfferCopy(supabase);
    const campaign = founderCampaignFromSetting(value, riyadhDay(now), founderCampaignCopyFromOffer(founderOffer));

    // The seat count is read whenever dates are configured: the countdown
    // before the opening shows the seats too.
    let summary: FounderSeatSummary | null = null;
    let summaryFailed = false;
    if (founderWindow(value, null, now, FOUNDER_MEMBERSHIP_ON_SALE)) {
      const { data: rows, error: rpcError } = await supabase.rpc("founder_seat_summary");
      if (rpcError) {
        logOnce("[campaigns/active GET] founder_seat_summary failed:", rpcError.code, rpcError.message);
        summaryFailed = true;
      } else {
        summary = founderSummaryFromRpc(rows);
        if (!summary) {
          logOnce("[campaigns/active GET] founder_seat_summary returned an unusable row");
          summaryFailed = true;
        }
      }
    }
    const window = founderWindow(value, summary, now, FOUNDER_MEMBERSHIP_ON_SALE);

    if (!campaign) return answer(null, window, founderOffer);
    if (summaryFailed || !summary) return unavailable(window, founderOffer);
    return answer(founderOfferCampaign(campaign, summary, FOUNDER_MEMBERSHIP_ON_SALE), window, founderOffer);
  } catch (err) {
    logOnce("[campaigns/active GET] unexpected error:", err);
    return unavailable();
  }
}
