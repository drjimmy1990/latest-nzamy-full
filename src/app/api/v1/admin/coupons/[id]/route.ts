import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * PATCH /api/v1/admin/coupons/[id] — Update a coupon (e.g. enable/disable).
 *
 * Body (all optional):
 *   active?: boolean          — toggle enable/disable directly
 *   status?: string           — "disabled"/"expired" => active=false, else true
 *   value?: number            — discount_value
 *   pointsGranted?: number    — points_granted
 *   usageLimit?: number       — max_uses
 *   startsAt?: string         — valid_from
 *   expiresAt?: string        — valid_until
 *   eligibleRoles?: string[]  — eligible_user_types (client => individual)
 */
function roleToUserType(role: string): string {
  return role === "client" ? "individual" : role;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const adminClient = await createServiceClient();

    // Fetch existing so metadata.status stays in sync.
    const { data: existing, error: fetchError } = await adminClient
      .from("coupons")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "الكوبون غير موجود" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Resolve the new active state (explicit `active`, else derive from `status`).
    let nextActive: boolean | undefined;
    if (typeof body.active === "boolean") {
      nextActive = body.active;
    } else if (typeof body.status === "string") {
      nextActive = body.status !== "disabled" && body.status !== "expired";
    }
    if (nextActive !== undefined) {
      updateData.active = nextActive;
    }

    if (body.value !== undefined) {
      updateData.discount_value = Number(body.value) || 0;
    }
    if (body.pointsGranted !== undefined) {
      updateData.points_granted = Number(body.pointsGranted) || 0;
    }
    if (body.usageLimit !== undefined) {
      const n = Number(body.usageLimit);
      updateData.max_uses = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    }
    if (body.startsAt !== undefined) {
      updateData.valid_from = body.startsAt ? new Date(String(body.startsAt)).toISOString() : null;
    }
    if (body.expiresAt !== undefined) {
      updateData.valid_until = body.expiresAt ? new Date(String(body.expiresAt)).toISOString() : null;
    }
    if (Array.isArray(body.eligibleRoles)) {
      updateData.eligible_user_types = (body.eligibleRoles as unknown[])
        .filter((r): r is string => typeof r === "string")
        .map(roleToUserType);
    }

    // Keep metadata.status coherent with the page's status field.
    if (typeof body.status === "string" || nextActive !== undefined) {
      const prevMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
      const nextStatus =
        typeof body.status === "string"
          ? body.status
          : nextActive
            ? "active"
            : "disabled";
      updateData.metadata = { ...prevMeta, status: nextStatus };
    }

    const { data, error } = await adminClient
      .from("coupons")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/coupons PATCH] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[admin/coupons PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث الكوبون" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/admin/coupons/[id] — Permanently delete a coupon.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }

    const adminClient = await createServiceClient();
    const { error } = await adminClient.from("coupons").delete().eq("id", id);

    if (error) {
      console.error("[admin/coupons DELETE] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/coupons DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء حذف الكوبون" }, { status: 500 });
  }
}
