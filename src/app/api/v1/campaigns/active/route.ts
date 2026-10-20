import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { founderCampaignFromSetting, riyadhDay, type Campaign } from "@/lib/pricing/campaigns";

/**
 * GET /api/v1/campaigns/active → { campaign: Campaign | null } — public.
 *
 * The founder-lawyer campaign (owner ٢١٨, dates ٢٢٥) when today, in Riyadh,
 * is between the admin-set `founder_campaign` dates (both included); else
 * null. PromotionalCampaignBanner falls back to the code `CAMPAIGNS` when this
 * answers null or fails.
 *
 * platform_settings has no public read, so the service client reads the one
 * key; only the derived banner copy and dates leave this route.
 *
 * Never an error status: a missing table/key (42P01), any read error or a
 * throw all answer `{ campaign: null }` with 200 — a banner is never worth a
 * 500. `force-dynamic` so the day is computed per request, never baked in at
 * build time (the SSR cached-date trap); the 5-minute public cache bounds the
 * drift at midnight, and the banner re-checks the dates on the client.
 */
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "public, max-age=300" };

function answer(campaign: Campaign | null) {
  return NextResponse.json({ campaign }, { status: 200, headers: HEADERS });
}

export async function GET() {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "founder_campaign")
      .maybeSingle();

    if (error) {
      console.error("[campaigns/active GET] founder_campaign read failed:", error.code, error.message);
      return answer(null);
    }

    return answer(founderCampaignFromSetting(data?.value ?? null, riyadhDay(new Date())));
  } catch (err) {
    console.error("[campaigns/active GET] unexpected error:", err);
    return answer(null);
  }
}
