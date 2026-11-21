import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { checkCitations, cleanCited } from "@/lib/ai/citationCheck";
import { extError, extJson, requireExtCaller } from "../../_extAuth";

/**
 * POST /api/v1/ext/citations/check — is each cited article real, and is it in force?
 *
 * The platform's own checkCitations (the one the brief-check results use): the library decides
 * the status, never a model. Returns a status and a link, never article text, so it spends no
 * read quota and needs no entitlement beyond the token's library:read scope.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const caller = await requireExtCaller(request, "library:read");
  if (caller instanceof NextResponse) return caller;
  const rid = caller.requestId;
  try {
    const body = (await request.json().catch(() => null)) as { citations?: unknown } | null;
    const raw = body && Array.isArray(body.citations) ? body.citations : null;
    if (!raw || raw.length < 1 || raw.length > 30) return extError(400, "validation", "أرسل من ١ إلى ٣٠ استشهادًا.", rid);
    const cited = cleanCited(raw);
    if (cited.length === 0) return extError(422, "validation", "لا استشهاد صالح: اسم النظام ورقم المادة مطلوبان.", rid);
    const results = await checkCitations(await createServiceClient(), cited);
    return extJson(200, { request_id: rid, results }, rid);
  } catch (err) {
    console.error("[ext/citations/check] failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر التحقق الآن — حاول بعد قليل.", rid);
  }
}
