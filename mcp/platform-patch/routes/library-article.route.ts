// DRAFT — src/app/api/v1/ext/library/articles/[id]/route.ts
// The paid-library rule: every gate the website applies must be applied here explicitly, because the PAT path never reaches proxy.ts.
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { libraryGate } from "@/lib/library-gate";
import { libraryReadQuotaHit } from "@/lib/library/readQuotaServer"; // verify signature (userId, docKey, …)
import { requireExtCaller, extError, NO_STORE, USAGE_NOTICE_AR } from "../../../_extAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireExtCaller(req, "library:read");
  if (caller instanceof NextResponse) return caller;
  const { id } = await params;
  const admin = createServiceClient();

  const closed = await libraryGate();                      // 1. library switch (admins pass)
  if (closed) return extError(423, "library_closed", "المكتبة مغلقة مؤقتًا.", caller.requestId);

  // 2. entitlement + lock + daily/hourly quota, exactly as spendLibraryDocument does for the web routes,
  //    with the token's device_hash standing in for the browser device in enforceLibraryDevice (deviceLimitServer.ts).
  // 3. load the article by id; apply shapeHit()/the paywall shaping so locked items return text:null + lock_reason.
  // 4. return { id, law, article_no, text, status, amended_by, lock_reason, quota:{remaining_today}, usage_notice, request_id }.
  //    Status (in_force/amended/repealed) is read from the library's own columns; never computed by the AI.
  return NextResponse.json({ request_id: caller.requestId, usage_notice: USAGE_NOTICE_AR, /* TODO body */ }, { headers: NO_STORE });
}
