import { NextResponse } from "next/server";
import { activeLaunchPrices } from "@/lib/pricing/priceBook";

/**
 * GET /api/v1/pricing/launch → { prices: { "<id>:<billing>": { sar, listSar, endsOn, campaignId } } } — public.
 *
 * Owner ٣٠٣ (30 Oct 2026): a launch price shows the listed price struck
 * through beside the offer, only on what the revised pricing doc gives a
 * launch price, from 25 Oct 2026 to 25 Jan 2027, and disappears by itself.
 * The day is decided HERE, on the server, per request — never by the
 * browser's clock, and never baked into a page nginx may cache (the SSR
 * cached-date trap): /pricing renders no launch price and asks this route
 * after mount. Checkout charges by the same rule (catalog.quote with the
 * request's clock), so the card and the charge agree.
 *
 * `no-store`: the answer changes at Riyadh midnight on the last day; no proxy
 * or browser may keep it.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { prices: activeLaunchPrices(new Date()) },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
