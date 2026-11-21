import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_DRAFT_PRICES, readDraftPrices } from "@/lib/ai/draftKinds";

/**
 * GET /api/v1/pricing/draft-prices → { prices: { claim, reply, …, petition } } — public.
 *
 * Batch l12 (owner N6, 20 Nov 2026): the legal drafter's price per pleading
 * kind is the admin setting ai_draft_prices (20261202_10). The wizard shows
 * these and sends the one it showed as expectedPrice, so a price the admin
 * changes is never charged unseen (runCore refuses a different one, 409).
 * The prices are what /pricing publishes anyway: no session needed.
 *
 * Any failure answers the code defaults (draftKinds.ts) — never 0.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const admin = await createServiceClient();
    return NextResponse.json({ prices: await readDraftPrices(admin) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[pricing/draft-prices] GET failed:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ prices: DEFAULT_DRAFT_PRICES }, { headers: NO_STORE });
  }
}
