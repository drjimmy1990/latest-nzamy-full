import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { openLogRpcOutcome, toOpenLogEntries } from "@/lib/firm/restrictedCaseOpenLog";

/**
 * GET /api/v1/cases/[id]/open-log — N16 (batch l12, 20261202_80): who opened
 * this RESTRICTED case by office (firm owner, managing partner, platform
 * team), newest first. Only the case's filer or lead reads it: the database
 * function public.restricted_case_open_log_read checks that itself on the
 * session (42501 → 403), so this route only carries the request.
 *
 *   200 { available: true, entries: [{ openedAt, who, kind }] }
 *   200 { available: false, entries: [] }   20261202_80 not applied yet
 *   403 not the case's filer or lead
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { id } = await context.params;
    const { data, error } = await auth.supabase.rpc("restricted_case_open_log_read", { p_request: id });
    const outcome = openLogRpcOutcome(error);
    if (outcome === "unavailable") return NextResponse.json({ available: false, entries: [] }, { headers: NO_STORE });
    if (outcome === "forbidden") {
      return NextResponse.json({ error: "سجل فتح القضية يراه المحامي المسؤول عنها ومنشئها فقط." }, { status: 403, headers: NO_STORE });
    }
    if (outcome === "failed") {
      console.error("[cases/open-log GET] rpc failed:", error?.code);
      return NextResponse.json({ error: "تعذّر تحميل سجل فتح القضية." }, { status: 500, headers: NO_STORE });
    }
    return NextResponse.json({ available: true, entries: toOpenLogEntries(data) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[cases/open-log GET] threw:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json({ error: "تعذّر تحميل سجل فتح القضية." }, { status: 500, headers: NO_STORE });
  }
}
