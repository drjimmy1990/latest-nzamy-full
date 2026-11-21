import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { FIRM_CASE_SCOPE_KEY, parseFirmCaseScope } from "@/lib/firm/firmCaseScope";

/**
 * GET /api/v1/firm/case-scope — Q112 (batch l12, 20261202_80).
 *
 * Which firm roles see only their assigned cases today: the platform setting
 * platform_settings.firm_case_scope, read the way the database reads it
 * (parseFirmCaseScope — a missing or malformed value is the owner's default).
 * The «الأدوار والصلاحيات» and «صلاحيات الأقسام» screens show it, so they say
 * what the database actually enforces. Not a secret (platform_settings is
 * readable by any session); signed-in users only.
 *
 *   200 { data: { assignedOnlyRoles, financeManagerNoCases }, stored: boolean }
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await assertRole();
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.supabase
    .from("platform_settings")
    .select("value")
    .eq("key", FIRM_CASE_SCOPE_KEY)
    .maybeSingle();
  if (error) {
    console.error("[firm/case-scope GET] read failed:", error.code);
    return NextResponse.json({ error: "تعذّر قراءة إعداد صلاحيات القضايا." }, { status: 500 });
  }
  const value = (data as { value?: unknown } | null)?.value;
  return NextResponse.json(
    { data: parseFirmCaseScope(value), stored: value !== undefined && value !== null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
