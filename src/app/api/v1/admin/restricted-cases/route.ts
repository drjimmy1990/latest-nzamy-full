import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import {
  BREAK_GLASS_STATUS_AR,
  breakGlassStatus,
  isBreakGlassMissing,
  type BreakGlassGrantRow,
} from "@/lib/admin/breakGlass";

/**
 * GET /api/v1/admin/restricted-cases — owner decision س٢١٦: the
 * administration sees a restricted firm case's METADATA only. Columns read:
 * service_requests id, firm_id, status, type, created_at, updated_at (never
 * title, description or metadata) + the firm's name; and the break-glass
 * requests / grants of public.restricted_case_access_grants (migration
 * 20261206_12) with their status. Super admins only (staff.manage). Content is
 * read only through the break-glass routes, with the admin's own session.
 */
export async function GET() {
  const gate = await requireStaff("staff.manage");
  if (!gate.ok) return gate.response;

  try {
    const admin = await createServiceClient();
    const { data: cases, error: casesError } = await admin
      .from("service_requests")
      .select("id, firm_id, status, type, created_at, updated_at")
      .eq("is_restricted", true)
      .not("firm_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (casesError) {
      console.error("[admin/restricted-cases] cases read failed:", casesError.code);
      return NextResponse.json({ error: "تعذّر تحميل القضايا المقيّدة." }, { status: 500 });
    }

    const { data: grants, error: grantsError } = await admin
      .from("restricted_case_access_grants")
      .select("id, request_id, firm_id, requested_by, reason, duration_minutes, requested_at, approved_by, approved_at, expires_at, rejected_by, rejected_at, revoked_by, revoked_at, decision_note, firm_notified_at")
      .order("requested_at", { ascending: false })
      .limit(200);
    const installed = !(grantsError && isBreakGlassMissing(grantsError.code));
    if (grantsError && installed) {
      console.error("[admin/restricted-cases] grants read failed:", grantsError.code);
      return NextResponse.json({ error: "تعذّر تحميل طلبات الوصول الطارئ." }, { status: 500 });
    }

    const caseRows = (cases ?? []) as Array<Record<string, unknown>>;
    const grantRows = (installed ? grants ?? [] : []) as Array<Record<string, unknown>>;
    const firmIds = [...new Set(caseRows.map((c) => c.firm_id).filter((v): v is string => typeof v === "string"))];
    const people = [...new Set(grantRows.flatMap((g) => [g.requested_by, g.approved_by, g.rejected_by, g.revoked_by])
      .filter((v): v is string => typeof v === "string"))];
    const [firms, profs] = await Promise.all([
      firmIds.length ? admin.from("firm_profiles").select("id, name_ar").in("id", firmIds) : Promise.resolve({ data: [] }),
      people.length ? admin.from("profiles").select("id, display_name").in("id", people) : Promise.resolve({ data: [] }),
    ]);
    const firmName = new Map(((firms.data ?? []) as Array<Record<string, unknown>>).map((f) => [String(f.id), String(f.name_ar ?? "")]));
    const name = new Map(((profs.data ?? []) as Array<Record<string, unknown>>).map((p) => [String(p.id), String(p.display_name ?? "")]));
    const nameOf = (v: unknown) => (typeof v === "string" ? name.get(v) || null : null);

    return NextResponse.json({
      installed,
      cases: caseRows.map((c) => ({
        id: c.id,
        firmId: c.firm_id,
        firmName: typeof c.firm_id === "string" ? firmName.get(c.firm_id) || null : null,
        status: c.status,
        type: c.type,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
      grants: grantRows.map((g) => {
        const status = breakGlassStatus(g as unknown as BreakGlassGrantRow);
        return {
          id: g.id,
          requestId: g.request_id,
          reason: g.reason,
          durationMinutes: g.duration_minutes,
          requestedAt: g.requested_at,
          requestedBy: nameOf(g.requested_by),
          requestedByMe: g.requested_by === gate.userId,
          approvedBy: nameOf(g.approved_by),
          approvedAt: g.approved_at,
          expiresAt: g.expires_at,
          firmNotifiedAt: g.firm_notified_at,
          decisionNote: g.decision_note,
          status,
          statusAr: BREAK_GLASS_STATUS_AR[status],
        };
      }),
    });
  } catch (err) {
    console.error("[admin/restricted-cases] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل القضايا المقيّدة." }, { status: 500 });
  }
}
