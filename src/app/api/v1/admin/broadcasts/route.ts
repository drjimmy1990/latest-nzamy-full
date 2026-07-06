import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * GET /api/v1/admin/broadcasts — List all broadcasts (newest first)
 *
 * Requires: authenticated admin user
 * Resilient: on any error returns { data: [] } (200) so the admin page can
 * fall back to its local mock gracefully (the broadcasts table may not yet
 * be applied to the remote DB).
 */
export async function GET() {
  try {
    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }

    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("broadcasts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[admin/broadcasts GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error("[admin/broadcasts GET] Unexpected error:", err);
    return NextResponse.json({ data: [] });
  }
}

/**
 * POST /api/v1/admin/broadcasts — Create a broadcast
 *
 * Body: {
 *   title: string (required),
 *   body?: string,
 *   audience?: string (default 'all'),
 *   status?: 'draft' | 'scheduled' | 'sent' (default 'draft'),
 *   scheduled_at?: string (ISO timestamp)
 * }
 *
 * created_by is set from the admin's user id.
 * Requires: authenticated admin user
 */
export async function POST(request: NextRequest) {
  try {
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
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    }

    const validStatuses = ["draft", "scheduled", "sent"];
    const status = validStatuses.includes(body.status ?? "")
      ? (body.status as string)
      : "draft";

    const insert: Record<string, unknown> = {
      title,
      body: body.body ?? null,
      audience: body.audience ?? "all",
      status,
      scheduled_at: body.scheduled_at ?? null,
      created_by: gate.userId,
    };

    if (status === "sent") {
      insert.sent_at = new Date().toISOString();
    }

    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("broadcasts")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/broadcasts POST] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[admin/broadcasts POST] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء الرسالة" }, { status: 500 });
  }
}
