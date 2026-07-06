import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * PATCH /api/v1/admin/broadcasts/[id] — Update a broadcast
 *
 * Body: any of {
 *   title?: string,
 *   body?: string,
 *   audience?: string,
 *   status?: 'draft' | 'scheduled' | 'sent',
 *   scheduled_at?: string | null
 * }
 *
 * When status transitions to 'sent', sent_at is stamped (unless the caller
 * supplied its own sent_at).
 *
 * Requires: authenticated admin user
 */
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

    let body: {
      title?: string;
      body?: string;
      audience?: string;
      status?: string;
      scheduled_at?: string | null;
      sent_at?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (typeof body.title === "string") update.title = body.title.trim();
    if (typeof body.body === "string") update.body = body.body;
    if (typeof body.audience === "string") update.audience = body.audience;
    if (body.scheduled_at !== undefined) update.scheduled_at = body.scheduled_at;

    if (body.status !== undefined) {
      const validStatuses = ["draft", "scheduled", "sent"];
      if (!validStatuses.includes(body.status ?? "")) {
        return NextResponse.json(
          { error: `الحالة غير صالحة. القيم المسموحة: ${validStatuses.join(", ")}` },
          { status: 400 },
        );
      }
      update.status = body.status;
      // Mark send time when moving to 'sent' (respect an explicit sent_at).
      if (body.status === "sent") {
        update.sent_at = body.sent_at ?? new Date().toISOString();
      }
    }

    if (body.sent_at !== undefined && update.sent_at === undefined) {
      update.sent_at = body.sent_at;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 });
    }

    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("broadcasts")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/broadcasts PATCH] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "الرسالة غير موجودة" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[admin/broadcasts PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث الرسالة" }, { status: 500 });
  }
}
