// DRAFT — src/app/api/v1/ext/ai/runs/quote/route.ts   (the quote-first endpoint the MCP server calls before any charge)
import { NextRequest, NextResponse } from "next/server";
import { requireExtCaller, NO_STORE } from "../../../_extAuth";
// Reuse: src/lib/ai/pointsStanding.ts (price + balance + daily remaining, "the way ai_start_run decides").
// MUST NOT call ai_start_run. Read-only. Contract draft phase = 0 points; contract-drafter = 500; else registry price.
export async function POST(req: NextRequest) {
  const caller = await requireExtCaller(req, "account:read");
  if (caller instanceof NextResponse) return caller;
  // TODO: validate {tool,input?}; return { price_points, balance, can_afford, daily_remaining, note?, request_id }.
  return NextResponse.json({ request_id: caller.requestId }, { headers: NO_STORE });
}
