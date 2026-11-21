import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { MARKET_SQL_MISSING_AR, acceptanceStatusAr, isMarketSqlMissing, isOverdue } from "@/lib/marketplace/marketSettings";
import { openRequestCategoryLabelAr } from "@/lib/services/openRequestCategory";

const STATUSES = new Set(["pending", "approved", "rejected", "withdrawn", "superseded"]);

/**
 * GET /api/v1/admin/marketplace/acceptances?status=pending — lawyers' asks to
 * take market requests (l12 Q130a), newest first, with the request's title
 * (staff only), the lawyer's name and licence state, and whether the
 * approval window has passed (`overdue`: the admin is alerted, the ask is
 * NEVER accepted automatically). orders.manage.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireStaff("orders.manage");
    if (!gate.ok) return gate.response;

    const raw = request.nextUrl.searchParams.get("status") ?? "pending";
    const status = raw === "all" ? null : STATUSES.has(raw) ? raw : "pending";

    const admin = await createServiceClient();
    let q = admin
      .from("marketplace_acceptances")
      .select("id, request_id, lawyer_user_id, mode, status, due_at, created_at, decided_at, decided_by, decision_note, alerted_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      if (isMarketSqlMissing(error.code)) return NextResponse.json({ installed: false, data: [], message: MARKET_SQL_MISSING_AR });
      console.error("[admin/marketplace/acceptances] read failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل طلبات القبول." }, { status: 500 });
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;

    const requestIds = [...new Set(rows.map((r) => r.request_id).filter((v): v is string => typeof v === "string"))];
    const lawyerIds = [...new Set(rows.map((r) => r.lawyer_user_id).filter((v): v is string => typeof v === "string"))];
    const [reqs, profs, lps] = await Promise.all([
      requestIds.length
        ? admin.from("service_requests").select("id, title, type, status, assigned_to, marketplace_category").in("id", requestIds)
        : Promise.resolve({ data: [] }),
      lawyerIds.length ? admin.from("profiles").select("id, display_name").in("id", lawyerIds) : Promise.resolve({ data: [] }),
      lawyerIds.length
        ? admin.from("lawyer_profiles").select("user_id, verification_status").in("user_id", lawyerIds)
        : Promise.resolve({ data: [] }),
    ]);
    const reqMap = new Map(((reqs.data ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.id), r]));
    const nameMap = new Map(((profs.data ?? []) as Array<Record<string, unknown>>).map((p) => [String(p.id), String(p.display_name ?? "")]));
    const lpMap = new Map(((lps.data ?? []) as Array<Record<string, unknown>>).map((l) => [String(l.user_id), l.verification_status]));

    const now = Date.now();
    return NextResponse.json({
      installed: true,
      data: rows.map((r) => {
        const req = reqMap.get(String(r.request_id));
        return {
          id: r.id,
          requestId: r.request_id,
          requestTitle: (req?.title as string | undefined) ?? "",
          requestCategory: openRequestCategoryLabelAr(req?.marketplace_category) ?? null,
          requestTaken: Boolean(req?.assigned_to),
          lawyerUserId: r.lawyer_user_id,
          lawyerName: nameMap.get(String(r.lawyer_user_id)) || null,
          lawyerVerified: lpMap.get(String(r.lawyer_user_id)) === "verified",
          mode: r.mode,
          status: r.status,
          statusLabel: acceptanceStatusAr(r.status),
          dueAt: r.due_at ?? null,
          createdAt: r.created_at ?? null,
          decidedAt: r.decided_at ?? null,
          note: r.decision_note ?? null,
          overdue: isOverdue(r, now),
          alertedAt: r.alerted_at ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("[admin/marketplace/acceptances] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر تحميل طلبات القبول." }, { status: 500 });
  }
}
