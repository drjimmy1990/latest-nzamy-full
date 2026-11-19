import { NextRequest, NextResponse } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { keepReplies } from "@/lib/services/ticketReplies";

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
    if (body.metadata !== undefined) {
      // l9 row 53: metadata.replies belongs to POST …/reply only — a PATCH
      // merges over the stored metadata and can neither drop nor add a reply.
      const { data: current, error: readError } = await adminClient
        .from("support_tickets")
        .select("metadata")
        .eq("id", id)
        .maybeSingle();
      if (readError) {
        console.error("[admin/tickets/[id] PATCH] metadata read failed:", readError.code);
        return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
      }
      if (!current) return NextResponse.json({ error: "التذكرة غير موجودة" }, { status: 404 });
      updateData.metadata = keepReplies((current as { metadata?: unknown }).metadata, body.metadata);
    }

    const { data, error } = await adminClient
      .from("support_tickets")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/tickets/[id] PATCH] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
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

/**
 * DELETE /api/v1/admin/tickets/[id] — removes one ticket for good (file 15
 * row 53: «حذف 3 تذاكر وهمية»). The admin screen asks for a typed
 * confirmation first; the whole row is kept in the audit log (before), so
 * what was removed stays on record. Staff role: tickets.manage.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await requireStaff("tickets.manage");
  if (!gate.ok) return gate.response;

  try {
    const adminClient = await createServiceClient();
    const { data, error } = await adminClient
      .from("support_tickets")
      .delete()
      .eq("id", id)
      .select("id, user_id, subject, body, category, priority, status, created_at");
    if (error) {
      console.error("[admin/tickets/[id] DELETE] Supabase error:", error.code, error.message);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "التذكرة غير موجودة" }, { status: 404 });
    }
    await logAdminAction({
      actorId: gate.userId,
      action: "support_ticket_deleted",
      targetType: "support_ticket",
      targetId: id,
      before: data[0] as Record<string, unknown>,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/tickets/[id] DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء حذف التذكرة" }, { status: 500 });
  }
}
