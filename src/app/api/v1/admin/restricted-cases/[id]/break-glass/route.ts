import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { breakGlassErrorResponse } from "@/lib/admin/breakGlass";

/**
 * GET /api/v1/admin/restricted-cases/[id]/break-glass — the case summary and
 * its live documents list (names only, no file links) for a super admin who
 * holds a LIVE break-glass grant on this case (owner decision س٢١٦, migration
 * 20261206_12). Read with the admin's OWN session through
 * public.restricted_case_break_glass_read(), which refuses (403) without a
 * grant, writes the open into the restricted-case open log the case's filer
 * and lead read, and writes an audit row. Never read with the service role.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireStaff("staff.manage");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!id || id.length > 200) {
    return NextResponse.json({ error: "رقم القضية غير صالح." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restricted_case_break_glass_read", { p_request: id });
  if (error) {
    const mapped = breakGlassErrorResponse(error);
    if (mapped.status === 500) console.error("[admin/restricted-cases/break-glass] rpc failed:", error.code);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
  return NextResponse.json({ ok: true, data });
}
