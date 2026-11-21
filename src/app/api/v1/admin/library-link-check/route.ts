import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { LINK_CHECK_HISTORY, parseLinkCheckHistory } from "@/lib/library/linkCheck";

/**
 * GET /api/v1/admin/library-link-check — the last daily broken-reference
 * checks of the library's links (owner file 10 ب34; batch l12, 20261202_30),
 * for the status tab of «مستكشف الجراف القانوني». Read-only, any staff role.
 * Titles, node keys and counts only — no article text.
 * Before 20261202_30: { schemaMissing: true, migration }.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;
  const admin = await createServiceClient();
  const { data, error } = await admin.rpc("graph_rag_link_check_history", { p_limit: LINK_CHECK_HISTORY });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") {
      return NextResponse.json({ schemaMissing: true, migration: "20261202_30_library_links.sql" }, { headers: NO_STORE });
    }
    console.error("[admin/library-link-check] failed:", error.code ?? "no-code", error.message);
    return NextResponse.json({ error: "تعذّر تحميل فحص الروابط" }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, history: parseLinkCheckHistory(data) }, { headers: NO_STORE });
}
