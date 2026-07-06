import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * GET /api/v1/admin/entitlements/requests — the admin review queue.
 * Query: ?status=pending|approved|rejected (default: all). Enriched with the
 * requester's profile (display_name / email / user_type).
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const admin = await createServiceClient();
  let query = admin
    .from("entitlement_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // entitlement_requests.user_id → auth.users(id); profiles.id === auth.users.id
  // but there is no PostgREST FK to profiles, so enrich in a second query.
  const requests = rows ?? [];
  const userIds = [...new Set(requests.map((r) => r.user_id as string))];
  let profileMap = new Map<string, { id: string; display_name: string | null; email: string | null; user_type: string | null }>();
  if (userIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name, email, user_type")
      .in("id", userIds);
    profileMap = new Map((profs ?? []).map((p) => [p.id as string, p]));
  }

  const enriched = requests.map((r) => ({
    ...r,
    profile: profileMap.get(r.user_id as string) ?? null,
  }));

  return NextResponse.json({ success: true, data: enriched });
}
