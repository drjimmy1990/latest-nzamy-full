import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  FOUNDER_MEMBERSHIP_ON_SALE,
  founderCampaignFromSetting,
  founderOfferCampaign,
  founderSummaryFromRpc,
  riyadhDay,
  type FounderOfferCampaign,
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
 * Never an error status: a missing table/key (42P01), any read error or a
 * throw all answer `{ campaign: null, founderUnavailable: true }` with 200 —
 * a banner is never worth a 500, and the card must not call a failed read an
 * ended campaign. `force-dynamic` so the day is computed per request, never
 * baked in at build time (the SSR cached-date trap); the 1-minute public
 * cache bounds the drift at midnight and the staleness of the seat count (the
 * checkout gate is the authority on seats), and the banner re-checks the
 * dates on the client.
 */
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "public, max-age=60" };

// Logged once per server process: a failing banner read is worth one line,
// not one per visitor.
let readFailureLogged = false;

function logOnce(...args: unknown[]): void {
  if (readFailureLogged) return;
  readFailureLogged = true;
  console.error(...args);
}

function answer(campaign: FounderOfferCampaign | null) {
  return NextResponse.json({ campaign }, { status: 200, headers: HEADERS });
}

function unavailable() {
  return NextResponse.json({ campaign: null, founderUnavailable: true }, { status: 200, headers: HEADERS });
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

    const campaign = founderCampaignFromSetting(data?.value ?? null, riyadhDay(new Date()));
    if (!campaign) return answer(null);

    const { data: rows, error: rpcError } = await supabase.rpc("founder_seat_summary");
    if (rpcError) {
      logOnce("[campaigns/active GET] founder_seat_summary failed:", rpcError.code, rpcError.message);
      return unavailable();
    }
    const summary = founderSummaryFromRpc(rows);
    if (!summary) {
      logOnce("[campaigns/active GET] founder_seat_summary returned an unusable row");
      return unavailable();
    }

    return answer(founderOfferCampaign(campaign, summary, FOUNDER_MEMBERSHIP_ON_SALE));
  } catch (err) {
    logOnce("[campaigns/active GET] unexpected error:", err);
    return unavailable();
  }
}
