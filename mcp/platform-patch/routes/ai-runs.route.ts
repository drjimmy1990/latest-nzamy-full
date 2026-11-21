// DRAFT — src/app/api/v1/ext/ai/runs/route.ts (+ [id]/route.ts for GET)
// Thin adapter over startRunWith (src/lib/ai/runCore.ts): same role/Art.18/mode/idempotency/charge/refund path as the website.
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { startRunWith } from "@/lib/ai/runCore";
import { callN8n } from "@/lib/ai/n8nClient";
import { requireExtCaller, extError, NO_STORE } from "../../_extAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXT_TOOLS = new Set(["legal-drafter", "contract-drafter", "brief-check"]); // allowlist: registry ids to confirm in aiTools/tools.ts

export async function POST(req: NextRequest) {
  const caller = await requireExtCaller(req, "ai:run");
  if (caller instanceof NextResponse) return caller;
  const body = await req.json().catch(() => null);
  if (!body || !EXT_TOOLS.has(body.tool)) return extError(422, "invalid_input", "أداة غير مدعومة عبر هذا الاتصال.", caller.requestId);
  // Map v1 {idempotency_key, conversation_id} -> runCore {idempotencyKey, conversationId}.
  // Namespace the key per token: `ext:${caller.tokenId}:${key}` so one client can never collide with another's.
  // RunActor: load userType / practiceKind / displayName for caller.userId (same helpers runs/route.ts uses).
  // deps: copy the n8n/callbackUrl/libraryAccess wiring from src/app/api/v1/ai/runs/route.ts verbatim.
  // Reply: map RouteReply -> v1 shape; always add request_id and NO_STORE.
  return NextResponse.json({ request_id: caller.requestId }, { status: 501, headers: NO_STORE });
}
