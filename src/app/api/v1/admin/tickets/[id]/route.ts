import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";

/**
 * PATCH /api/v1/admin/tickets/[id] — Update a support ticket (admin only)
 *
 * Body (all optional): {
 *   status?: 'open' | 'pending' | 'resolved' | 'closed',
 *   priority?: 'low' | 'normal' | 'high' | 'urgent',
 *   assignee_id?: string | null,
 *   subject?: string,
 *   category?: string,
 *   metadata?: Record<string, unknown>
 * }
 *
 * Always bumps updated_at.
 *
 * Owner ٢١٠: a staff role with tickets.manage; each update is audited.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireStaff("tickets.manage");
  if (!gate.ok) return gate.response;

  let body: {
    status?: string;
    priority?: string;
    assignee_id?: string | null;
    subject?: string;
    category?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  try {
    const adminClient = await createServiceClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) updateData.status = body.status;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.assignee_id !== undefined) updateData.assignee_id = body.assignee_id;
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    const { data, error } = await adminClient
      .from("support_tickets")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/tickets/[id] PATCH] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "التذكرة غير موجودة" }, { status: 404 });
    }

    const changed = Object.fromEntries(Object.entries(updateData).filter(([k]) => k !== "updated_at"));
    await logAdminAction({
      actorId: gate.userId,
      action: "support_ticket_updated",
      targetType: "support_ticket",
      targetId: id,
      after: changed,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[admin/tickets/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث التذكرة" }, { status: 500 });
  }
}
