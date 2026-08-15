import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * GET /api/v1/admin/service-orders — the AI service fulfillment queue.
 * Query: ?status=pending_assignment|in_review|completed|cancelled  ?service=draft|...
 * service_requests has no admin RLS policy, so this uses the service-role
 * client behind requireAdmin().
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const service = searchParams.get("service");

  const admin = await createServiceClient();
  let query = admin
    .from("service_requests")
    .select("*")
    .eq("receiver", "ai_workspace")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (service) query = query.eq("metadata->>service", service);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // No PostgREST FK from service_requests to profiles — enrich separately.
  const orders = rows ?? [];
  const userIds = [...new Set(orders.map((o) => o.requester_user_id).filter(Boolean))] as string[];
  let profileMap = new Map<string, Record<string, unknown>>();
  if (userIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles").select("id, display_name, email, phone, user_type").in("id", userIds);
    profileMap = new Map((profs ?? []).map((p) => [p.id as string, p]));
  }

  return NextResponse.json({
    success: true,
    data: orders.map((o) => ({ ...o, profile: profileMap.get(o.requester_user_id as string) ?? null })),
  });
}
