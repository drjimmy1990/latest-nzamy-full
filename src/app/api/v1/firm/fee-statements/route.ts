import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { resolveCallerFirm } from "@/lib/auth/firmMembershipAccess";
import { createServiceClient } from "@/lib/supabase/server";
import {
  canReadFirmStatements,
  FIRM_STATEMENT_STATUSES,
  mapFirmStatement,
  parseFirmStatementsQuery,
} from "@/lib/finance/firmFeeStatements";

/**
 * GET /api/v1/firm/fee-statements — O23 (batch l11): the fee statements every
 * member of the caller's firm issued, for the firm owner and an ACTIVE
 * managing partner or finance manager.
 *
 * ── HOW IT IS AUTHORISED ────────────────────────────────────────────────────
 *   1. resolveCallerFirm + canReadFirmStatements (owner / managing_partner /
 *      finance_manager) — the route's own gate;
 *   2. public.firm_fee_statement_reader(firm) with the SESSION client — the
 *      database's answer (20261201_40). Missing function (42883 / PGRST202) →
 *      `{ available: false }`: the migration has not run, and the list would
 *      otherwise show the caller's own statements as if they were the firm's;
 *   3. the rows are read with the SESSION client, so the payments policy
 *      "firm finance reads firm statements" is what admits them.
 * The service role is used for ONE thing: the display names of the issuers
 * and members of this firm (profiles RLS lets a user read only his own row),
 * after both gates passed — the /api/v1/firm/members pattern.
 *
 * Query: ?limit (≤100, default 50) &offset &filter=all|open|paid|void &issuer=<member user id>
 * 200 { available: true, statements, total, members: [{ userId, name }] }
 * 200 { available: false, statements: [], total: 0, members: [] }
 * 403 not the owner / managing partner / finance manager · 404 no firm
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const FORBIDDEN_AR = "كشوف أتعاب أعضاء المكتب لمالك المكتب والشريك المدير والمدير المالي فقط.";
const FAILED_AR = "تعذّر تحميل كشوف أتعاب المكتب.";
const MISSING_FUNCTION = new Set(["42883", "PGRST202"]);

const STATEMENT_COLUMNS =
  "id, request_id, amount, currency, status, metadata, created_at, owner_user_id, firm_id, void_reason";

export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data: firm, error: firmError } = await resolveCallerFirm(supabase, user.id);
    if (firmError) {
      console.error("[firm/fee-statements GET] firm lookup failed:", firmError.code);
      return NextResponse.json({ error: FAILED_AR }, { status: 500, headers: NO_STORE });
    }
    if (!firm) {
      return NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404, headers: NO_STORE });
    }
    if (!canReadFirmStatements(firm)) {
      return NextResponse.json({ error: FORBIDDEN_AR }, { status: 403, headers: NO_STORE });
    }

    const { data: allowed, error: gateError } = await supabase.rpc("firm_fee_statement_reader", { p_firm: firm.id });
    if (gateError) {
      if (MISSING_FUNCTION.has(String(gateError.code ?? ""))) {
        return NextResponse.json({ available: false, statements: [], total: 0, members: [] }, { headers: NO_STORE });
      }
      console.error("[firm/fee-statements GET] gate failed:", gateError.code);
      return NextResponse.json({ error: FAILED_AR }, { status: 500, headers: NO_STORE });
    }
    if (allowed !== true) {
      return NextResponse.json({ error: FORBIDDEN_AR }, { status: 403, headers: NO_STORE });
    }

    const q = parseFirmStatementsQuery(request.nextUrl.searchParams);
    let query = supabase
      .from("payments")
      .select(STATEMENT_COLUMNS, { count: "exact" })
      .eq("firm_id", firm.id)
      .eq("metadata->>invoice", "true")
      .in("status", [...FIRM_STATEMENT_STATUSES[q.filter]])
      .order("created_at", { ascending: false })
      .range(q.offset, q.offset + q.limit - 1);
    if (q.issuer) query = query.eq("owner_user_id", q.issuer);

    const { data: rows, count, error: readError } = await query;
    if (readError) {
      console.error("[firm/fee-statements GET] read failed:", readError.code);
      return NextResponse.json({ error: FAILED_AR }, { status: 500, headers: NO_STORE });
    }
    const list = (rows ?? []) as unknown as Record<string, unknown>[];

    // Names: the firm's members (for the «العضو» filter) and every issuer on
    // this page. Both id sets come from rows the gates above admitted.
    const service = await createServiceClient();
    const { data: memberRows, error: memberError } = await service
      .from("firm_members")
      .select("user_id")
      .eq("firm_id", firm.id)
      .eq("status", "active");
    if (memberError) console.error("[firm/fee-statements GET] members read failed:", memberError.code);
    const ids = new Set<string>();
    for (const m of (memberRows ?? []) as Array<{ user_id: string | null }>) if (m.user_id) ids.add(m.user_id);
    ids.add(firm.ownerUserId);
    for (const r of list) if (typeof r.owner_user_id === "string") ids.add(r.owner_user_id);

    const names = new Map<string, string>();
    if (ids.size > 0) {
      const { data: profiles, error: profileError } = await service
        .from("profiles")
        .select("id, display_name")
        .in("id", [...ids]);
      if (profileError) console.error("[firm/fee-statements GET] names read failed:", profileError.code);
      for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (p.display_name) names.set(p.id, p.display_name);
      }
    }

    const members = [...ids]
      .filter((id) => id === firm.ownerUserId || (memberRows ?? []).some((m) => (m as { user_id: string }).user_id === id))
      .map((id) => ({ userId: id, name: names.get(id) || "عضو في المكتب" }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));

    return NextResponse.json(
      {
        available: true,
        statements: list.map((r) => mapFirmStatement(r, names)),
        total: typeof count === "number" ? count : null,
        members,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[firm/fee-statements GET] unexpected error:", err);
    return NextResponse.json({ error: FAILED_AR }, { status: 500, headers: NO_STORE });
  }
}
