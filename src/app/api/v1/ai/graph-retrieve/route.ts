import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { parseGraphRetrieveRequest, searchLegalGraph } from "@/lib/ai/graphService";

/**
 * POST /api/v1/ai/graph-retrieve — Machine-authenticated Hybrid Legal GraphRAG
 * endpoint for ALL multi-step / document-driven n8n workflows (`contract-review`,
 * `contract-negotiator`, `contracts-pro`, `contract-drafter`, `wargaming`,
 * `analyze-strength`, `brief-check`, `case-brief`, `legal-opinion-letter`, plus
 * future Corporate/Gov/NGO workflows) and internal backend services.
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `X-Nzamy-Key` must equal `NZAMY_AI_CALLBACK_KEY` (timing-safe SHA-256
 * comparison via `cronSecretMatches`, identical to `/api/v1/ai/callback`).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-nzamy-key"), process.env.NZAMY_AI_CALLBACK_KEY)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400, headers: NO_STORE });
  }

  const parsed = parseGraphRetrieveRequest(rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
  }

  try {
    const admin = await createServiceClient();
    const result = await searchLegalGraph(admin, parsed.value);
    return NextResponse.json(
      {
        ok: true,
        sources: result.sources,
        citations_map: result.map,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[ai/graph-retrieve] threw:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
