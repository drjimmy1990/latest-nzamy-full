import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { MARKET_SQL_MISSING_AR, acceptanceStatusAr, isMarketSqlMissing } from "@/lib/marketplace/marketSettings";
import { toOpenRequestItem } from "@/lib/services/openRequestsView";

/**
 * GET /api/v1/lawyer/market-requests — the lawyer's side of the market
 * (l12 Q130a):
 *   asks      his own asks (marketplace_acceptances, RLS: own rows only) with
 *             the same public card a verified lawyer already sees (type, city,
 *             summary line) — never the client's name or text;
 *   assigned  the market requests now assigned to him (receiver ai_workspace,
 *             assigned_to = him): only here, after assignment, the title, the
 *             description and the client's display name are shown (owner ١٠:
 *             «لا يظهر النص الكامل ولا اسم العميل إلا للمحامي المُسنَد إليه»).
 *             Read with his own session (RLS: the assignee reads the row); the
 *             name is read with the service role for those rows only.
 */
export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const { data: asks, error: asksError } = await supabase
      .from("marketplace_acceptances")
      .select("id, request_id, mode, status, due_at, created_at, decided_at, decision_note")
      .eq("lawyer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (asksError) {
      if (isMarketSqlMissing(asksError.code)) {
        return NextResponse.json({ installed: false, asks: [], assigned: [], message: MARKET_SQL_MISSING_AR });
      }
      console.error("[lawyer/market-requests] asks read failed:", asksError.code);
      return NextResponse.json({ error: "تعذّر تحميل طلباتك في السوق." }, { status: 500 });
    }

    const { data: assignedRows, error: assignedError } = await supabase
      .from("service_requests")
      .select("id, type, title, description, city, public_summary, status, created_at, requester_user_id")
      .eq("assigned_to", user.id)
      .eq("receiver", "ai_workspace")
      // his own order that he assigned to himself is not a market request
      .neq("requester_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (assignedError) {
      console.error("[lawyer/market-requests] assigned read failed:", assignedError.code);
      return NextResponse.json({ error: "تعذّر تحميل الطلبات المسندة إليك." }, { status: 500 });
    }

    const admin = await createServiceClient();
    const askRows = (asks ?? []) as Array<Record<string, unknown>>;
    const askIds = [...new Set(askRows.map((a) => a.request_id).filter((v): v is string => typeof v === "string"))];
    const cards = new Map<string, ReturnType<typeof toOpenRequestItem>>();
    if (askIds.length > 0) {
      const { data: pub } = await admin
        .from("service_requests")
        .select("id, type, city, public_summary, created_at, marketplace_category")
        .in("id", askIds);
      for (const r of (pub ?? []) as Array<Record<string, unknown>>) {
        cards.set(String(r.id), toOpenRequestItem({ ...r, category: r.marketplace_category }));
      }
    }

    const assigned = (assignedRows ?? []) as Array<Record<string, unknown>>;
    const requesterIds = [...new Set(assigned.map((r) => r.requester_user_id).filter((v): v is string => typeof v === "string"))];
    const names = new Map<string, string>();
    if (requesterIds.length > 0) {
      const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", requesterIds);
      for (const p of (profs ?? []) as Array<{ id?: string; display_name?: string | null }>) {
        if (p.id) names.set(p.id, (p.display_name ?? "").trim());
      }
    }

    return NextResponse.json({
      installed: true,
      asks: askRows.map((a) => ({
        id: a.id,
        requestId: a.request_id,
        status: a.status,
        statusLabel: acceptanceStatusAr(a.status),
        mode: a.mode,
        dueAt: a.due_at ?? null,
        createdAt: a.created_at ?? null,
        decidedAt: a.decided_at ?? null,
        // A rejection's note is the admin's reason, written for the lawyer.
        note: a.status === "rejected" ? (a.decision_note ?? null) : null,
        card: cards.get(String(a.request_id)) ?? null,
      })),
      assigned: assigned.map((r) => ({
        id: r.id,
        title: r.title ?? "",
        description: r.description ?? "",
        status: r.status ?? null,
        createdAt: r.created_at ?? null,
        clientName: (typeof r.requester_user_id === "string" && names.get(r.requester_user_id)) || null,
        card: toOpenRequestItem(r),
      })),
    });
  } catch (err) {
    console.error("[lawyer/market-requests] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر تحميل طلباتك في السوق." }, { status: 500 });
  }
}
