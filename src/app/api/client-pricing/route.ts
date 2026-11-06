import { NextResponse } from "next/server";
import { loadClientPricingCatalog } from "@/lib/pricing/clientPricingServer";

// S6-T3: the read moved to the shared server loader (both audiences; the
// variants travel inside `catalog` and the browser resolves them per
// audience — the prices are public anyway). Response shape unchanged:
// { source, catalog }.
export async function GET() {
  return NextResponse.json(await loadClientPricingCatalog());
}
